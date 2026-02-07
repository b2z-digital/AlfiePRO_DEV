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
    const youtubeRefreshToken = Deno.env.get('YOUTUBE_DEFAULT_REFRESH_TOKEN');
    const youtubeChannelId = Deno.env.get('YOUTUBE_DEFAULT_CHANNEL_ID');
    const youtubeChannelName = Deno.env.get('YOUTUBE_DEFAULT_CHANNEL_NAME');
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    if (!youtubeRefreshToken || !youtubeChannelId || !clientId || !clientSecret) {
      throw new Error('Default YouTube account not configured. Please set up YouTube credentials.');
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: youtubeRefreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to refresh default YouTube access token');
    }

    const tokenData = await tokenResponse.json();

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: existing } = await supabase
      .from('integrations')
      .select('id')
      .eq('club_id', club_id)
      .eq('platform', 'youtube')
      .maybeSingle();

    const credentials = {
      access_token: tokenData.access_token,
      refresh_token: youtubeRefreshToken,
      channel_id: youtubeChannelId,
      channel_name: youtubeChannelName || 'AlfiePRO',
      expires_at: new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString(),
    };

    let dbError = null;

    if (existing) {
      const { error } = await supabase
        .from('integrations')
        .update({
          credentials,
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
          credentials,
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
        channelId: youtubeChannelId,
        channelName: youtubeChannelName || 'AlfiePRO',
        message: 'YouTube integration connected to default AlfiePRO channel successfully'
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
