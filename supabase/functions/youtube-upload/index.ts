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
): Promise<{ credentials: YouTubeCredentials; isDefault: boolean }> {
  const { data: integration } = await supabase
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
    throw new Error('No YouTube integration found. Please connect YouTube in Settings > Integrations.');
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

async function refreshYouTubeToken(
  credentials: YouTubeCredentials,
  clubId: string,
  supabase: any,
  isDefault: boolean
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
  const expiresIn = data.expires_in;

  if (!isDefault) {
    const expiresAt = new Date(Date.now() + (expiresIn * 1000)).toISOString();
    await supabase
      .from('integrations')
      .update({
        credentials: {
          ...credentials,
          access_token: newAccessToken,
          expires_at: expiresAt,
        },
      })
      .eq('club_id', clubId)
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

    const { credentials, isDefault } = await getYouTubeCredentials(supabase, clubId);

    let accessToken = credentials.access_token;

    if (!isDefault && credentials.expires_at) {
      const expiryTime = new Date(credentials.expires_at).getTime();
      if (Date.now() >= expiryTime - 300000) {
        accessToken = await refreshYouTubeToken(credentials, clubId, supabase, isDefault);
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
