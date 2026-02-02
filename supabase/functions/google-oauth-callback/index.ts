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
    const { access_token, refresh_token, expires_in } = tokenData;

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

    const calendarResponse = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
        },
      }
    );

    let calendarId = null;
    if (calendarResponse.ok) {
      const calendarData = await calendarResponse.json();
      if (calendarData.items && calendarData.items.length > 0) {
        calendarId = calendarData.items[0].id;
      }
    }

    const expiresAt = new Date(Date.now() + (expires_in * 1000)).toISOString();

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let dbError;

    if (clubId) {
      const result = await supabase
        .from('club_integrations')
        .upsert({
          club_id: clubId,
          provider: 'google',
          google_email: email,
          google_calendar_id: calendarId,
          access_token: access_token,
          refresh_token: refresh_token,
          token_expires_at: expiresAt,
          is_enabled: true,
          connected_at: new Date().toISOString()
        }, {
          onConflict: 'club_id,provider'
        });
      dbError = result.error;
    } else if (associationId && associationType) {
      const tableName = associationType === 'state'
        ? 'state_association_integrations'
        : 'national_association_integrations';
      const idColumn = associationType === 'state'
        ? 'state_association_id'
        : 'national_association_id';

      const result = await supabase
        .from(tableName)
        .upsert({
          [idColumn]: associationId,
          provider: 'google',
          google_email: email,
          google_calendar_id: calendarId,
          access_token: access_token,
          refresh_token: refresh_token,
          token_expires_at: expiresAt,
          is_enabled: true,
          connected_at: new Date().toISOString()
        }, {
          onConflict: `${idColumn},provider`
        });
      dbError = result.error;
    }

    if (dbError) {
      throw new Error(`Database error: ${dbError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        email: email,
        calendarId: calendarId,
        message: 'Google integration connected successfully'
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