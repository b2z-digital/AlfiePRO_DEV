import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { code, redirectUri, clubId, associationId, associationType } = await req.json();

    if (!code || !redirectUri || (!clubId && !associationId)) {
      throw new Error('Missing required parameters');
    }

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!clientId || !clientSecret || !supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing environment variables');
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${errorData}`);
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in, scope: grantedScopes } = tokenData;

    if (!access_token) {
      throw new Error('No access token received');
    }

    const userInfoResponse = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
        },
      }
    );

    if (!userInfoResponse.ok) {
      const errorData = await userInfoResponse.text();
      throw new Error(`Failed to fetch user info: ${errorData}`);
    }

    const userInfo = await userInfoResponse.json();
    const email = userInfo.email;
    const expiresAt = new Date(Date.now() + (expires_in * 1000)).toISOString();

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const idColumn = clubId ? 'club_id' :
      associationType === 'state' ? 'state_association_id' : 'national_association_id';
    const orgId = clubId || associationId;

    const baseOwner: Record<string, unknown> = {
      [idColumn]: orgId,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (idColumn !== 'club_id') baseOwner['club_id'] = null;
    if (idColumn !== 'state_association_id') baseOwner['state_association_id'] = null;
    if (idColumn !== 'national_association_id') baseOwner['national_association_id'] = null;

    const scopeStr = grantedScopes || '';
    const hasCalendar = scopeStr.includes('calendar');
    const hasDrive = scopeStr.includes('drive');
    const hasYoutube = scopeStr.includes('youtube');

    let calendarId = null;
    if (hasCalendar) {
      const calendarResponse = await fetch(
        'https://www.googleapis.com/calendar/v3/users/me/calendarList',
        { headers: { 'Authorization': `Bearer ${access_token}` } }
      );
      if (calendarResponse.ok) {
        const calendarData = await calendarResponse.json();
        if (calendarData.items && calendarData.items.length > 0) {
          calendarId = calendarData.items[0].id;
        }
      }
    }

    let channelId = null;
    let channelName = null;
    if (hasYoutube) {
      const ytResponse = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
        { headers: { 'Authorization': `Bearer ${access_token}` } }
      );
      if (ytResponse.ok) {
        const ytData = await ytResponse.json();
        if (ytData.items && ytData.items.length > 0) {
          channelId = ytData.items[0].id;
          channelName = ytData.items[0].snippet?.title;
        }
      }
    }

    const sharedCredentials = {
      email,
      access_token,
      refresh_token,
      token_expires_at: expiresAt,
    };

    const platforms = [
      {
        platform: 'google',
        is_active: true,
        credentials: {
          ...sharedCredentials,
          google_calendar_id: calendarId,
        },
      },
    ];

    if (hasDrive) {
      platforms.push({
        platform: 'google_drive',
        is_active: true,
        credentials: {
          ...sharedCredentials,
          google_account_email: email,
        },
      });
    }

    if (hasYoutube) {
      platforms.push({
        platform: 'youtube',
        is_active: true,
        credentials: {
          ...sharedCredentials,
          channel_id: channelId,
          channel_name: channelName,
        },
      });
    }

    const results: string[] = [];
    for (const p of platforms) {
      const integrationData = {
        ...baseOwner,
        platform: p.platform,
        is_active: p.is_active,
        credentials: p.credentials,
      };

      const { data: existing } = await supabase
        .from('integrations')
        .select('id')
        .eq(idColumn, orgId)
        .eq('platform', p.platform)
        .maybeSingle();

      let dbError;
      if (existing) {
        const { error } = await supabase
          .from('integrations')
          .update(integrationData)
          .eq('id', existing.id);
        dbError = error;
      } else {
        const { error } = await supabase
          .from('integrations')
          .insert(integrationData);
        dbError = error;
      }

      if (dbError) {
        console.error(`Error saving ${p.platform}:`, dbError);
      } else {
        results.push(p.platform);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        email,
        calendarId,
        channelId,
        channelName,
        connectedServices: results,
        message: `Google connected: ${results.join(', ')}`
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error) {
    console.error('Google OAuth callback error:', error);

    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to process Google OAuth callback'
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        status: 400,
      }
    );
  }
});
