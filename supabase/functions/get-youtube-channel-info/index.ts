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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

    if (!supabaseUrl || !supabaseServiceKey || !clientId || !clientSecret) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: integration } = await supabase
      .from('integrations')
      .select('id, credentials, club_id')
      .eq('platform', 'youtube')
      .eq('is_active', true)
      .order('connected_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!integration?.credentials?.refresh_token) {
      throw new Error('No YouTube integration with refresh_token found in database');
    }

    const refreshToken = integration.credentials.refresh_token;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      throw new Error(`Token refresh failed: ${errText}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    const channelResponse = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    if (!channelResponse.ok) {
      const errText = await channelResponse.text();
      throw new Error(`Channel fetch failed: ${errText}`);
    }

    const channelData = await channelResponse.json();

    if (!channelData.items || channelData.items.length === 0) {
      throw new Error('No YouTube channel found for this account');
    }

    const channel = channelData.items[0];
    const channelId = channel.id;
    const channelName = channel.snippet.title;

    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();
    await supabase
      .from('integrations')
      .update({
        credentials: {
          ...integration.credentials,
          access_token: accessToken,
          channel_id: channelId,
          channel_name: channelName,
          expires_at: expiresAt,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', integration.id);

    return new Response(
      JSON.stringify({
        success: true,
        refresh_token: refreshToken,
        channel_id: channelId,
        channel_name: channelName,
        message: 'Set these as your Supabase Edge Function secrets: YOUTUBE_DEFAULT_REFRESH_TOKEN, YOUTUBE_DEFAULT_CHANNEL_ID, YOUTUBE_DEFAULT_CHANNEL_NAME',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Get YouTube channel info error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to get YouTube channel info' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
