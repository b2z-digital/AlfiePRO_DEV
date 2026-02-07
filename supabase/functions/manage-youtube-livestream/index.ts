import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface YouTubeCredentials {
  access_token: string;
  refresh_token?: string;
  channel_id?: string;
  channel_name?: string;
}

interface Context {
  supabaseClient: any;
  clubId: string;
  isDefault: boolean;
}

async function getYouTubeCredentials(
  supabaseClient: any,
  clubId: string
): Promise<{ credentials: YouTubeCredentials; isDefault: boolean }> {
  const { data: integration } = await supabaseClient
    .from('integrations')
    .select('credentials')
    .eq('club_id', clubId)
    .eq('platform', 'youtube')
    .eq('is_active', true)
    .maybeSingle();

  if (integration?.credentials?.refresh_token) {
    return { credentials: integration.credentials as YouTubeCredentials, isDefault: false };
  }

  const refreshToken = Deno.env.get('YOUTUBE_DEFAULT_REFRESH_TOKEN');
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('No YouTube integration found for this club and default AlfiePRO account is not configured.');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Default YouTube token refresh failed:', errorText);
    throw new Error('Failed to authenticate with default AlfiePRO YouTube account.');
  }

  const data = await response.json();

  return {
    credentials: {
      access_token: data.access_token,
      refresh_token: refreshToken,
      channel_id: Deno.env.get('YOUTUBE_DEFAULT_CHANNEL_ID') || '',
      channel_name: Deno.env.get('YOUTUBE_DEFAULT_CHANNEL_NAME') || 'AlfiePRO',
    },
    isDefault: true,
  };
}

async function refreshAccessToken(
  credentials: YouTubeCredentials,
  context: Context
): Promise<string> {
  if (!credentials.refresh_token) {
    throw new Error('No refresh token available. Please reconnect your YouTube account.');
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new Error('Missing Google OAuth credentials in environment');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: credentials.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Token refresh failed:', error);
    throw new Error('Failed to refresh token. Please reconnect your YouTube account.');
  }

  const data = await response.json();
  const newAccessToken = data.access_token;

  if (!context.isDefault) {
    await context.supabaseClient
      .from('integrations')
      .update({
        credentials: {
          ...credentials,
          access_token: newAccessToken,
        },
      })
      .eq('club_id', context.clubId)
      .eq('platform', 'youtube');
  }

  return newAccessToken;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { action, clubId, sessionData, broadcastId } = await req.json();

    const { credentials, isDefault } = await getYouTubeCredentials(supabaseClient, clubId);
    const context: Context = { supabaseClient, clubId, isDefault };

    switch (action) {
      case 'createBroadcast':
        return await createBroadcast(credentials, sessionData, corsHeaders, context);
      case 'createStream':
        return await createStream(credentials, sessionData, corsHeaders, context);
      case 'bindBroadcastToStream':
        return await bindBroadcastToStream(credentials, sessionData, corsHeaders, context);
      case 'transitionBroadcast':
        return await transitionBroadcast(credentials, sessionData, corsHeaders, context);
      case 'getBroadcastStatus':
        return await getBroadcastStatus(credentials, sessionData, corsHeaders, context);
      case 'getStreamStatus':
        return await getStreamStatus(credentials, sessionData, corsHeaders, context);
      case 'endBroadcast':
        return await endBroadcast(credentials, sessionData, corsHeaders, context);
      case 'getVideoMetrics':
        return await getVideoMetrics(credentials, sessionData, corsHeaders, context);
      case 'deleteBroadcast':
        return await deleteBroadcast(credentials, { broadcastId, ...sessionData }, corsHeaders, context);
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
    }
  } catch (error) {
    console.error('Error in manage-youtube-livestream:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function createBroadcast(
  credentials: YouTubeCredentials,
  sessionData: any,
  corsHeaders: Record<string, string>,
  context: Context
): Promise<Response> {
  const scheduledStartTime = sessionData.scheduledStartTime || new Date().toISOString();

  const broadcastData = {
    snippet: {
      title: sessionData.title,
      description: sessionData.description || '',
      scheduledStartTime: scheduledStartTime,
    },
    status: {
      privacyStatus: sessionData.privacyStatus || 'public',
      selfDeclaredMadeForKids: false,
    },
    contentDetails: {
      enableAutoStart: true,
      enableAutoStop: true,
      enableDvr: true,
      recordFromStart: true,
      enableClosedCaptions: true,
      closedCaptionsType: 'closedCaptionsDisabled',
    },
  };

  let accessToken = credentials.access_token;
  let retryCount = 0;

  while (retryCount < 2) {
    const response = await fetch(
      'https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status,contentDetails',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(broadcastData),
      }
    );

    const data = await response.json();

    if (response.status === 401 && retryCount === 0) {
      try {
        accessToken = await refreshAccessToken(credentials, context);
        retryCount++;
        continue;
      } catch (refreshError) {
        return new Response(
          JSON.stringify({
            error: refreshError.message,
            hint: context.isDefault
              ? 'The default AlfiePRO YouTube account needs to be re-authenticated.'
              : 'Please reconnect your YouTube account in Settings > Integrations'
          }),
          {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    if (!response.ok) {
      const errorDetail = data.error?.message || JSON.stringify(data);
      return new Response(
        JSON.stringify({
          error: `YouTube API error (${response.status}): ${errorDetail}`,
          details: data
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ broadcast: data }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  return new Response(
    JSON.stringify({ error: 'Failed after token refresh retry' }),
    {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

async function createStream(
  credentials: YouTubeCredentials,
  sessionData: any,
  corsHeaders: Record<string, string>,
  context: Context
): Promise<Response> {
  const streamData = {
    snippet: {
      title: sessionData.title,
      description: sessionData.description || '',
    },
    cdn: {
      frameRate: '30fps',
      ingestionType: 'rtmp',
      resolution: '1080p',
    },
  };

  let accessToken = credentials.access_token;
  const response = await fetch(
    'https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn,status',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(streamData),
    }
  );

  const data = await response.json();

  if (response.status === 401) {
    accessToken = await refreshAccessToken(credentials, context);
    const retryResponse = await fetch(
      'https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn,status',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(streamData),
      }
    );
    const retryData = await retryResponse.json();
    if (!retryResponse.ok) {
      throw new Error(`YouTube API error: ${JSON.stringify(retryData)}`);
    }
    return new Response(
      JSON.stringify({ stream: retryData }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!response.ok) {
    throw new Error(`YouTube API error: ${JSON.stringify(data)}`);
  }

  return new Response(
    JSON.stringify({ stream: data }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

async function makeAuthenticatedRequest(
  url: string,
  options: RequestInit,
  credentials: YouTubeCredentials,
  context: Context
): Promise<{ response: Response; data: any }> {
  let accessToken = credentials.access_token;

  const headers = { ...options.headers as Record<string, string>, 'Authorization': `Bearer ${accessToken}` };
  let response = await fetch(url, { ...options, headers });
  let data = await response.json();

  if (response.status === 401) {
    accessToken = await refreshAccessToken(credentials, context);
    const retryHeaders = { ...options.headers as Record<string, string>, 'Authorization': `Bearer ${accessToken}` };
    response = await fetch(url, { ...options, headers: retryHeaders });
    data = await response.json();
  }

  return { response, data };
}

async function bindBroadcastToStream(
  credentials: YouTubeCredentials,
  sessionData: any,
  corsHeaders: Record<string, string>,
  context: Context
): Promise<Response> {
  const { broadcastId, streamId } = sessionData;

  const { response, data } = await makeAuthenticatedRequest(
    `https://www.googleapis.com/youtube/v3/liveBroadcasts/bind?id=${broadcastId}&streamId=${streamId}&part=id,snippet,contentDetails,status`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
    credentials,
    context
  );

  if (!response.ok) {
    throw new Error(`YouTube API error: ${JSON.stringify(data)}`);
  }

  return new Response(
    JSON.stringify({ success: true, data }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function transitionBroadcast(
  credentials: YouTubeCredentials,
  sessionData: any,
  corsHeaders: Record<string, string>,
  context: Context
): Promise<Response> {
  const { broadcastId, broadcastStatus } = sessionData;

  const { response, data } = await makeAuthenticatedRequest(
    `https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?broadcastStatus=${broadcastStatus}&id=${broadcastId}&part=id,status`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
    credentials,
    context
  );

  if (!response.ok) {
    throw new Error(`YouTube API error: ${JSON.stringify(data)}`);
  }

  return new Response(
    JSON.stringify({ success: true, data }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function getBroadcastStatus(
  credentials: YouTubeCredentials,
  sessionData: any,
  corsHeaders: Record<string, string>,
  context: Context
): Promise<Response> {
  const { broadcastId } = sessionData;

  const { response, data } = await makeAuthenticatedRequest(
    `https://www.googleapis.com/youtube/v3/liveBroadcasts?part=id,snippet,status,contentDetails,statistics&id=${broadcastId}`,
    { method: 'GET' },
    credentials,
    context
  );

  if (!response.ok) {
    throw new Error(`YouTube API error: ${JSON.stringify(data)}`);
  }

  return new Response(
    JSON.stringify(data),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function getStreamStatus(
  credentials: YouTubeCredentials,
  sessionData: any,
  corsHeaders: Record<string, string>,
  context: Context
): Promise<Response> {
  const { streamId } = sessionData;

  const { response, data } = await makeAuthenticatedRequest(
    `https://www.googleapis.com/youtube/v3/liveStreams?part=id,snippet,cdn,status&id=${streamId}`,
    { method: 'GET' },
    credentials,
    context
  );

  if (!response.ok) {
    throw new Error(`YouTube API error: ${JSON.stringify(data)}`);
  }

  return new Response(
    JSON.stringify(data),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function endBroadcast(
  credentials: YouTubeCredentials,
  sessionData: any,
  corsHeaders: Record<string, string>,
  context: Context
): Promise<Response> {
  return await transitionBroadcast(
    credentials,
    { ...sessionData, broadcastStatus: 'complete' },
    corsHeaders,
    context
  );
}

async function getVideoMetrics(
  credentials: YouTubeCredentials,
  sessionData: any,
  corsHeaders: Record<string, string>,
  context: Context
): Promise<Response> {
  const { videoId } = sessionData;

  const { response, data } = await makeAuthenticatedRequest(
    `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoId}`,
    { method: 'GET' },
    credentials,
    context
  );

  if (!response.ok) {
    throw new Error(`YouTube API error: ${JSON.stringify(data)}`);
  }

  return new Response(
    JSON.stringify(data),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function deleteBroadcast(
  credentials: YouTubeCredentials,
  sessionData: any,
  corsHeaders: Record<string, string>,
  context: Context
): Promise<Response> {
  const { broadcastId } = sessionData;

  if (!broadcastId) {
    return new Response(
      JSON.stringify({ error: 'broadcastId is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let accessToken = credentials.access_token;
  let response = await fetch(
    `https://www.googleapis.com/youtube/v3/liveBroadcasts?id=${broadcastId}`,
    {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    }
  );

  if (response.status === 401) {
    accessToken = await refreshAccessToken(credentials, context);
    response = await fetch(
      `https://www.googleapis.com/youtube/v3/liveBroadcasts?id=${broadcastId}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );
  }

  if (!response.ok) {
    const data = await response.json();
    throw new Error(`YouTube API error: ${JSON.stringify(data)}`);
  }

  return new Response(
    JSON.stringify({ success: true, message: 'Broadcast deleted successfully' }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
