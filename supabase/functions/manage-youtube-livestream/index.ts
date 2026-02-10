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
  serviceClient: any;
  clubId: string;
  isDefault: boolean;
  integrationId?: string;
}

function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
}

async function getYouTubeCredentials(
  supabaseClient: any,
  serviceClient: any,
  clubId: string
): Promise<{ credentials: YouTubeCredentials; isDefault: boolean; integrationId?: string }> {
  const { data: integration } = await supabaseClient
    .from('integrations')
    .select('id, credentials')
    .eq('club_id', clubId)
    .eq('platform', 'youtube')
    .eq('is_active', true)
    .maybeSingle();

  if (integration?.credentials?.refresh_token) {
    return {
      credentials: integration.credentials as YouTubeCredentials,
      isDefault: false,
      integrationId: integration.id,
    };
  }

  const { data: defaultIntegration } = await serviceClient
    .from('integrations')
    .select('id, credentials')
    .eq('platform', 'youtube')
    .eq('is_active', true)
    .eq('is_default', true)
    .maybeSingle();

  if (!defaultIntegration?.credentials?.refresh_token) {
    throw new Error('No YouTube integration found. The default AlfiePRO account is not configured.');
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new Error('Missing Google OAuth credentials in environment');
  }

  const creds = defaultIntegration.credentials as YouTubeCredentials;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: creds.refresh_token!,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Default YouTube token refresh failed:', errorText);
    let hint = 'Failed to authenticate with default AlfiePRO YouTube account.';
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.error === 'invalid_grant') {
        hint = 'YouTube refresh token has expired. Please re-connect YouTube in Settings > Integrations to get a new token.';
      } else if (parsed.error === 'unauthorized_client') {
        hint = 'Google OAuth client credentials are invalid. Please check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.';
      } else {
        hint += ` Google error: ${parsed.error_description || parsed.error || errorText}`;
      }
    } catch {
      hint += ` Details: ${errorText}`;
    }
    throw new Error(hint);
  }

  const tokenData = await response.json();
  creds.access_token = tokenData.access_token;

  if (!creds.channel_id) {
    try {
      const channelResponse = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
        { headers: { 'Authorization': `Bearer ${creds.access_token}` } }
      );
      if (channelResponse.ok) {
        const channelData = await channelResponse.json();
        if (channelData.items?.length > 0) {
          creds.channel_id = channelData.items[0].id;
          creds.channel_name = channelData.items[0].snippet.title;
        }
      }
    } catch (e) {
      console.error('Failed to fetch channel info:', e);
    }
  }

  const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();
  await serviceClient
    .from('integrations')
    .update({
      credentials: { ...creds, expires_at: expiresAt },
      updated_at: new Date().toISOString(),
    })
    .eq('id', defaultIntegration.id);

  return {
    credentials: creds,
    isDefault: true,
    integrationId: defaultIntegration.id,
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
  const expiresAt = new Date(Date.now() + (data.expires_in * 1000)).toISOString();

  const client = context.isDefault ? context.serviceClient : context.supabaseClient;
  const updateQuery = context.integrationId
    ? client.from('integrations').update({
        credentials: { ...credentials, access_token: newAccessToken, expires_at: expiresAt },
      }).eq('id', context.integrationId)
    : client.from('integrations').update({
        credentials: { ...credentials, access_token: newAccessToken, expires_at: expiresAt },
      }).eq('club_id', context.clubId).eq('platform', 'youtube');

  await updateQuery;

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

    const serviceClient = getServiceClient();
    const { credentials, isDefault, integrationId } = await getYouTubeCredentials(supabaseClient, serviceClient, clubId);
    const context: Context = { supabaseClient, serviceClient, clubId, isDefault, integrationId };

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

  const { response, data } = await makeAuthenticatedRequest(
    'https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status,contentDetails',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(broadcastData),
    },
    credentials,
    context
  );

  if (!response.ok) {
    const errorDetail = data.error?.message || JSON.stringify(data);
    return new Response(
      JSON.stringify({
        error: `YouTube API error (${response.status}): ${errorDetail}`,
        details: data,
        hint: context.isDefault
          ? 'The default AlfiePRO YouTube account may need to be re-authenticated.'
          : 'Please reconnect your YouTube account in Settings > Integrations',
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

  const { response, data } = await makeAuthenticatedRequest(
    'https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn,status',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(streamData),
    },
    credentials,
    context
  );

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
