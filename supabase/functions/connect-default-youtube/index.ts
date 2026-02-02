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
    const youtubeAccessToken = Deno.env.get('YOUTUBE_DEFAULT_ACCESS_TOKEN');
    const youtubeRefreshToken = Deno.env.get('YOUTUBE_DEFAULT_REFRESH_TOKEN');
    const youtubeChannelId = Deno.env.get('YOUTUBE_DEFAULT_CHANNEL_ID');
    const youtubeChannelName = Deno.env.get('YOUTUBE_DEFAULT_CHANNEL_NAME');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    if (!youtubeAccessToken || !youtubeRefreshToken || !youtubeChannelId || !youtubeChannelName) {
      throw new Error('Default YouTube account not configured. Please set up YouTube credentials.');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Store the default YouTube connection for this club
    const { error: dbError } = await supabase
      .from('club_integrations')
      .upsert({
        club_id: club_id,
        provider: 'youtube',
        youtube_channel_id: youtubeChannelId,
        youtube_channel_name: youtubeChannelName,
        youtube_access_token: youtubeAccessToken,
        youtube_refresh_token: youtubeRefreshToken,
        youtube_token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        access_token: youtubeAccessToken,
        refresh_token: youtubeRefreshToken,
        token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(), // 1 hour from now
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
        channelId: youtubeChannelId,
        channelName: youtubeChannelName,
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