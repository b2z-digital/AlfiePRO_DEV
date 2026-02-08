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
    const { club_id } = await req.json();

    if (!club_id) {
      throw new Error('Missing club_id parameter');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    if (!clientId || !clientSecret) {
      throw new Error('Missing Google OAuth credentials');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: defaultIntegration } = await supabase
      .from('integrations')
      .select('id, credentials')
      .eq('platform', 'youtube')
      .eq('is_active', true)
      .eq('is_default', true)
      .maybeSingle();

    if (!defaultIntegration?.credentials?.refresh_token) {
      throw new Error('No default YouTube integration found in database. Please connect a YouTube account and mark it as default.');
    }

    const defaultCreds = defaultIntegration.credentials;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: defaultCreds.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error('Token refresh failed:', errText);
      let hint = 'Failed to refresh default YouTube access token.';
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error === 'invalid_grant') {
          hint = 'The default YouTube refresh token has expired. Please re-connect the YouTube account via Settings > Integrations on the club that owns the default channel.';
        }
      } catch { /* ignore */ }
      throw new Error(hint);
    }

    const tokenData = await tokenResponse.json();
    const newAccessToken = tokenData.access_token;
    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();

    let channelId = defaultCreds.channel_id;
    let channelName = defaultCreds.channel_name;

    if (!channelId) {
      try {
        const channelResponse = await fetch(
          'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
          { headers: { 'Authorization': `Bearer ${newAccessToken}` } }
        );
        if (channelResponse.ok) {
          const channelData = await channelResponse.json();
          if (channelData.items?.length > 0) {
            channelId = channelData.items[0].id;
            channelName = channelData.items[0].snippet.title;
          }
        }
      } catch (e) {
        console.error('Failed to fetch channel info:', e);
      }
    }

    await supabase
      .from('integrations')
      .update({
        credentials: {
          ...defaultCreds,
          access_token: newAccessToken,
          channel_id: channelId,
          channel_name: channelName,
          expires_at: expiresAt,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', defaultIntegration.id);

    const { data: existing } = await supabase
      .from('integrations')
      .select('id')
      .eq('club_id', club_id)
      .eq('platform', 'youtube')
      .maybeSingle();

    const clubCredentials = {
      access_token: newAccessToken,
      refresh_token: defaultCreds.refresh_token,
      channel_id: channelId,
      channel_name: channelName || 'AUS RC Yachting',
      expires_at: expiresAt,
    };

    let dbError = null;

    if (existing) {
      const { error } = await supabase
        .from('integrations')
        .update({
          credentials: clubCredentials,
          is_active: true,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      dbError = error;
    } else {
      const { error } = await supabase
        .from('integrations')
        .insert({
          club_id: club_id,
          platform: 'youtube',
          credentials: clubCredentials,
          is_active: true,
          connected_at: new Date().toISOString(),
        });
      dbError = error;
    }

    if (dbError) {
      throw new Error(`Database error: ${dbError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        channelId: channelId,
        channelName: channelName || 'AUS RC Yachting',
        message: 'YouTube integration connected to default channel successfully'
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error) {
    console.error('Connect default YouTube error:', error);

    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to connect default YouTube account'
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
