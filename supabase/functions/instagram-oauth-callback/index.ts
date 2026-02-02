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
    const { code, redirectUri, clubId } = await req.json();

    if (!code || !redirectUri || !clubId) {
      throw new Error('Missing required parameters');
    }

    const appId = Deno.env.get('INSTAGRAM_APP_ID');
    const appSecret = Deno.env.get('INSTAGRAM_APP_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!appId || !appSecret || !supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing environment variables');
    }

    const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code: code,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${errorData}`);
    }

    const tokenData = await tokenResponse.json();
    const { access_token, user_id } = tokenData;

    if (!access_token || !user_id) {
      throw new Error('No access token or user ID received');
    }

    const userResponse = await fetch(
      `https://graph.instagram.com/${user_id}?fields=id,username&access_token=${access_token}`
    );

    if (!userResponse.ok) {
      const errorData = await userResponse.text();
      throw new Error(`Failed to fetch user info: ${errorData}`);
    }

    const userData = await userResponse.json();
    const username = userData.username;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error: dbError } = await supabase
      .from('club_integrations')
      .upsert({
        club_id: clubId,
        provider: 'instagram',
        instagram_user_id: user_id,
        instagram_username: username,
        access_token: access_token,
        is_enabled: true,
        connected_at: new Date().toISOString()
      }, {
        onConflict: 'club_id,provider'
      });

    if (dbError) {
      throw new Error(`Database error: ${dbError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId: user_id,
        username: username,
        message: 'Instagram integration connected successfully'
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error) {
    console.error('Instagram OAuth callback error:', error);

    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to process Instagram OAuth callback'
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