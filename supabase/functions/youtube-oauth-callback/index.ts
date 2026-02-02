import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface OAuthCallbackRequest {
  code: string;
  state: string;
  redirectUri: string;
  clubId: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { code, state, redirectUri, clubId }: OAuthCallbackRequest = await req.json();

    if (!code || !state || !redirectUri || !clubId) {
      throw new Error('Missing required parameters');
    }

    console.log('Processing YouTube OAuth callback for club:', clubId);

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const missingVars = [];
    if (!clientId) missingVars.push('GOOGLE_CLIENT_ID');
    if (!clientSecret) missingVars.push('GOOGLE_CLIENT_SECRET');
    if (!supabaseUrl) missingVars.push('SUPABASE_URL');
    if (!supabaseServiceKey) missingVars.push('SUPABASE_SERVICE_ROLE_KEY');

    if (missingVars.length > 0) {
      const errorMsg = `Missing environment variables: ${missingVars.join(', ')}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    console.log('Exchanging authorization code for tokens...');

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
      console.error('Token exchange failed:', errorData);
      throw new Error(`Token exchange failed: ${errorData}`);
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    if (!access_token) {
      throw new Error('No access token received');
    }

    console.log('Access token received, fetching YouTube channel info...');

    const channelResponse = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
        },
      }
    );

    if (!channelResponse.ok) {
      const errorData = await channelResponse.text();
      console.error('Failed to fetch channel info:', errorData);
      throw new Error(`Failed to fetch channel info: ${errorData}`);
    }

    const channelData = await channelResponse.json();

    if (!channelData.items || channelData.items.length === 0) {
      throw new Error('No YouTube channel found for this account');
    }

    const channel = channelData.items[0];
    const channelId = channel.id;
    const channelName = channel.snippet.title;

    console.log('YouTube channel found:', channelName);

    const expiresAt = new Date(Date.now() + (expires_in * 1000)).toISOString();

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Storing integration in database...');

    // First, check if an integration already exists
    const { data: existing } = await supabase
      .from('integrations')
      .select('id')
      .eq('club_id', clubId)
      .eq('platform', 'youtube')
      .single();

    let dbError = null;

    if (existing) {
      // Update existing integration
      const { error } = await supabase
        .from('integrations')
        .update({
          credentials: {
            access_token,
            refresh_token,
            channel_id: channelId,
            channel_name: channelName,
            expires_at: expiresAt,
          },
          is_active: true,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      dbError = error;
    } else {
      // Insert new integration
      const { error } = await supabase
        .from('integrations')
        .insert({
          club_id: clubId,
          platform: 'youtube',
          credentials: {
            access_token,
            refresh_token,
            channel_id: channelId,
            channel_name: channelName,
            expires_at: expiresAt,
          },
          is_active: true,
          connected_at: new Date().toISOString(),
        });

      dbError = error;
    }

    if (dbError) {
      console.error('Database error:', dbError);
      throw new Error(`Database error: ${dbError.message}`);
    }

    console.log('YouTube integration stored successfully');

    return new Response(
      JSON.stringify({
        success: true,
        channelId,
        channelName,
        message: 'YouTube integration connected successfully'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('YouTube OAuth callback error:', error);

    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to process YouTube OAuth callback'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});