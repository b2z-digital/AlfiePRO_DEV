import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface YouTubeCredentials {
  access_token: string;
  refresh_token?: string;
}

interface Context {
  supabaseClient: any;
  clubId: string;
}

async function refreshAccessToken(
  credentials: YouTubeCredentials,
  context: Context
): Promise<string> {
  if (!credentials.refresh_token) {
    throw new Error('No refresh token available. Please reconnect your YouTube account.');
  }

  console.log('🔄 Refreshing YouTube access token...');

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new Error('Missing Google OAuth credentials in environment');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: credentials.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('❌ Token refresh failed:', error);
    throw new Error('Failed to refresh token. Please reconnect your YouTube account.');
  }

  const data = await response.json();
  const newAccessToken = data.access_token;

  console.log('✅ Token refreshed successfully');

  await context.supabaseClient
    .from('integrations')
    .update({
      credentials: {
        access_token: newAccessToken,
        refresh_token: credentials.refresh_token,
      },
    })
    .eq('club_id', context.clubId)
    .eq('platform', 'youtube');

  console.log('✅ Updated token in database');

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

    const { data: integration } = await supabaseClient
      .from('integrations')
      .select('credentials')
      .eq('club_id', clubId)
      .eq('platform', 'youtube')
      .eq('is_active', true)
      .maybeSingle();

    if (!integration || !integration.credentials) {
      return new Response(
        JSON.stringify({ error: 'YouTube integration not found or inactive' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const credentials = integration.credentials as YouTubeCredentials;
    const context: Context = { supabaseClient, clubId };

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

  console.log('Creating YouTube broadcast with data:', {
    title: sessionData.title,
    scheduledStartTime,
    privacyStatus: sessionData.privacyStatus || 'public'
  });

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
    console.log('Sending request to YouTube API...');

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

    console.log('YouTube API response:', {
      status: response.status,
      ok: response.ok,
      data: data
    });

    if (response.status === 401 && retryCount === 0) {
      console.log('🔄 Access token expired, refreshing...');
      try {
        accessToken = await refreshAccessToken(credentials, context);
        retryCount++;
        continue;
      } catch (refreshError) {
        return new Response(
          JSON.stringify({
            error: refreshError.message,
            hint: 'Please reconnect your YouTube account in Settings → Integrations'
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
      console.error('YouTube API error:', errorDetail);

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

    console.log('✅ Broadcast created successfully:', data.id);

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

  const response = await fetch(
    'https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn,status',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(streamData),
    }
  );

  const data = await response.json();

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

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/liveBroadcasts/bind?id=${broadcastId}&streamId=${streamId}&part=id,snippet,contentDetails,status`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials.access_token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`YouTube API error: ${JSON.stringify(data)}`);
  }

  return new Response(
    JSON.stringify({ success: true, data }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

async function transitionBroadcast(
  credentials: YouTubeCredentials,
  sessionData: any,
  corsHeaders: Record<string, string>,
  context: Context
): Promise<Response> {
  const { broadcastId, broadcastStatus } = sessionData;

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?broadcastStatus=${broadcastStatus}&id=${broadcastId}&part=id,status`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials.access_token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`YouTube API error: ${JSON.stringify(data)}`);
  }

  return new Response(
    JSON.stringify({ success: true, data }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

async function getBroadcastStatus(
  credentials: YouTubeCredentials,
  sessionData: any,
  corsHeaders: Record<string, string>,
  context: Context
): Promise<Response> {
  const { broadcastId } = sessionData;

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/liveBroadcasts?part=id,snippet,status,contentDetails,statistics&id=${broadcastId}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${credentials.access_token}`,
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`YouTube API error: ${JSON.stringify(data)}`);
  }

  return new Response(
    JSON.stringify(data),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

async function getStreamStatus(
  credentials: YouTubeCredentials,
  sessionData: any,
  corsHeaders: Record<string, string>,
  context: Context
): Promise<Response> {
  const { streamId } = sessionData;

  console.log('[YouTube] Getting stream status for:', streamId);

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/liveStreams?part=id,snippet,cdn,status&id=${streamId}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${credentials.access_token}`,
      },
    }
  );

  const data = await response.json();

  console.log('[YouTube] Stream status response:', JSON.stringify(data, null, 2));

  if (!response.ok) {
    throw new Error(`YouTube API error: ${JSON.stringify(data)}`);
  }

  if (data.items && data.items.length > 0) {
    const stream = data.items[0];
    console.log('[YouTube] Stream health status:', stream.status?.healthStatus?.status);
    console.log('[YouTube] Stream ingestion info:', {
      ingestionAddress: stream.cdn?.ingestionInfo?.ingestionAddress,
      streamName: stream.cdn?.ingestionInfo?.streamName ? '***HIDDEN***' : 'NOT SET'
    });
  }

  return new Response(
    JSON.stringify(data),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
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

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoId}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${credentials.access_token}`,
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`YouTube API error: ${JSON.stringify(data)}`);
  }

  return new Response(
    JSON.stringify(data),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
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
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/liveBroadcasts?id=${broadcastId}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${credentials.access_token}`,
      },
    }
  );

  if (!response.ok) {
    const data = await response.json();
    throw new Error(`YouTube API error: ${JSON.stringify(data)}`);
  }

  return new Response(
    JSON.stringify({ success: true, message: 'Broadcast deleted successfully' }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}
