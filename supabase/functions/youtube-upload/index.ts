import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface UploadRequest {
  videoFile: string;
  title: string;
  description?: string;
  privacy: 'public' | 'unlisted' | 'private';
  clubId: string;
  eventId?: string;
  eventType?: string;
  eventName?: string;
  raceClass?: string;
}

interface YouTubeCredentials {
  access_token: string;
  refresh_token: string;
  channel_id?: string;
  channel_name?: string;
  expires_at?: string;
}

async function getYouTubeCredentials(
  supabase: any,
  clubId: string
): Promise<{ credentials: YouTubeCredentials; isDefault: boolean; integrationId?: string }> {
  const { data: integration } = await supabase
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

  const { data: defaultIntegration } = await supabase
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
    throw new Error('Missing Google OAuth credentials');
  }

  const creds = defaultIntegration.credentials as YouTubeCredentials;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: creds.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to authenticate with default AlfiePRO YouTube account.');
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
  await supabase
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

async function refreshYouTubeToken(
  credentials: YouTubeCredentials,
  supabase: any,
  isDefault: boolean,
  integrationId?: string
): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new Error('Missing Google OAuth credentials');
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
    throw new Error('Failed to refresh YouTube access token');
  }

  const data = await response.json();
  const newAccessToken = data.access_token;
  const expiresAt = new Date(Date.now() + (data.expires_in * 1000)).toISOString();

  if (integrationId) {
    await supabase
      .from('integrations')
      .update({
        credentials: { ...credentials, access_token: newAccessToken, expires_at: expiresAt },
      })
      .eq('id', integrationId);
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
    const {
      videoFile,
      title,
      description = '',
      privacy = 'unlisted',
      clubId,
      eventId,
      eventType,
      eventName,
      raceClass
    }: UploadRequest = await req.json();

    if (!videoFile || !title || !clubId) {
      throw new Error('Missing required parameters: videoFile, title, or clubId');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { credentials, isDefault, integrationId } = await getYouTubeCredentials(supabase, clubId);

    let accessToken = credentials.access_token;

    if (credentials.expires_at) {
      const expiryTime = new Date(credentials.expires_at).getTime();
      if (Date.now() >= expiryTime - 300000) {
        accessToken = await refreshYouTubeToken(credentials, supabase, isDefault, integrationId);
      }
    }

    const base64Data = videoFile.split(',')[1];
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    const videoId = await uploadToYouTube(binaryData, title, description, privacy, accessToken);

    const { error: mediaError } = await supabase
      .from('event_media')
      .insert({
        club_id: clubId,
        media_type: 'youtube_video',
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title,
        description,
        event_ref_id: eventId || null,
        event_ref_type: eventType || null,
        event_name: eventName || null,
        race_class: raceClass || null
      });

    if (mediaError) {
      console.error('Failed to store media record:', mediaError);
    }

    return new Response(
      JSON.stringify({
        videoId,
        message: 'Video uploaded successfully to YouTube'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('YouTube upload error:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to upload video to YouTube'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});

async function uploadToYouTube(
  videoData: Uint8Array,
  title: string,
  description: string,
  privacy: string,
  accessToken: string
): Promise<string> {
  const metadata = {
    snippet: {
      title,
      description,
      categoryId: '17'
    },
    status: {
      privacyStatus: privacy
    }
  };

  const uploadResponse = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'multipart/related; boundary="boundary"'
      },
      body: createMultipartBody(metadata, videoData)
    }
  );

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`YouTube upload failed: ${errorText}`);
  }

  const uploadData = await uploadResponse.json();
  return uploadData.id;
}

function createMultipartBody(metadata: any, videoData: Uint8Array): Uint8Array {
  const boundary = 'boundary';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadataPart = delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(metadata);

  const videoPart = delimiter +
    'Content-Type: video/mp4\r\n\r\n';

  const encoder = new TextEncoder();
  const metadataBytes = encoder.encode(metadataPart);
  const videoPartBytes = encoder.encode(videoPart);
  const closeDelimiterBytes = encoder.encode(closeDelimiter);

  const totalLength = metadataBytes.length + videoPartBytes.length + videoData.length + closeDelimiterBytes.length;
  const result = new Uint8Array(totalLength);

  let offset = 0;
  result.set(metadataBytes, offset);
  offset += metadataBytes.length;
  result.set(videoPartBytes, offset);
  offset += videoPartBytes.length;
  result.set(videoData, offset);
  offset += videoData.length;
  result.set(closeDelimiterBytes, offset);

  return result;
}
