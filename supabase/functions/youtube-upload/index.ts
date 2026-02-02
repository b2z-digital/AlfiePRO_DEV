import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
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
    }: UploadRequest = await req.json()

    if (!videoFile || !title || !clubId) {
      throw new Error('Missing required parameters: videoFile, title, or clubId')
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables')
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get the club's YouTube integration
    const { data: integration, error: integrationError } = await supabase
      .from('club_integrations')
      .select('youtube_access_token, youtube_refresh_token, youtube_token_expires_at, youtube_channel_id')
      .eq('club_id', clubId)
      .eq('provider', 'youtube')
      .maybeSingle()

    if (integrationError) {
      console.error('Integration query error:', integrationError)
      throw new Error(`Failed to query YouTube integration: ${integrationError.message}`)
    }

    if (!integration) {
      throw new Error('YouTube integration not found. Please connect your YouTube account in Settings > Integrations first.')
    }

    if (!integration.youtube_access_token) {
      throw new Error('YouTube access token is missing. Please reconnect your YouTube account in Settings > Integrations.')
    }

    let accessToken = integration.youtube_access_token

    // Check if token needs refresh
    if (integration.youtube_token_expires_at) {
      const expiryTime = new Date(integration.youtube_token_expires_at).getTime()
      const currentTime = Date.now()
      
      if (currentTime >= expiryTime - 300000) { // Refresh 5 minutes before expiry
        accessToken = await refreshYouTubeToken(integration.youtube_refresh_token, clubId, supabase)
      }
    }

    // Convert base64 to blob
    const base64Data = videoFile.split(',')[1] // Remove data:video/mp4;base64, prefix
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))

    // Upload video to YouTube
    const videoId = await uploadToYouTube(binaryData, title, description, privacy, accessToken)

    // Store media record in database
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
      })

    if (mediaError) {
      console.error('Failed to store media record:', mediaError)
      // Don't throw here as the video was successfully uploaded
    }

    return new Response(
      JSON.stringify({
        videoId,
        message: 'Video uploaded successfully to YouTube'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('YouTube upload error:', error)
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to upload video to YouTube'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})

async function refreshYouTubeToken(refreshToken: string, clubId: string, supabase: any): Promise<string> {
  const clientId = Deno.env.get('YOUTUBE_CLIENT_ID')
  const clientSecret = Deno.env.get('YOUTUBE_CLIENT_SECRET')

  if (!clientId || !clientSecret) {
    throw new Error('Missing YouTube OAuth credentials')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    throw new Error('Failed to refresh YouTube access token')
  }

  const data = await response.json()
  const newAccessToken = data.access_token
  const expiresIn = data.expires_in

  // Update the token in the database
  const expiresAt = new Date(Date.now() + (expiresIn * 1000)).toISOString()
  
  await supabase
    .from('club_integrations')
    .update({
      youtube_access_token: newAccessToken,
      youtube_token_expires_at: expiresAt
    })
    .eq('club_id', clubId)
    .eq('provider', 'youtube')

  return newAccessToken
}

async function uploadToYouTube(
  videoData: Uint8Array,
  title: string,
  description: string,
  privacy: string,
  accessToken: string
): Promise<string> {
  // Step 1: Create video metadata
  const metadata = {
    snippet: {
      title,
      description,
      categoryId: '17' // Sports category
    },
    status: {
      privacyStatus: privacy
    }
  }

  // Step 2: Upload video using resumable upload
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
  )

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text()
    throw new Error(`YouTube upload failed: ${errorText}`)
  }

  const uploadData = await uploadResponse.json()
  return uploadData.id
}

function createMultipartBody(metadata: any, videoData: Uint8Array): Uint8Array {
  const boundary = 'boundary'
  const delimiter = `\r\n--${boundary}\r\n`
  const closeDelimiter = `\r\n--${boundary}--`

  const metadataPart = delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(metadata)

  const videoPart = delimiter +
    'Content-Type: video/mp4\r\n\r\n'

  // Convert strings to Uint8Array
  const encoder = new TextEncoder()
  const metadataBytes = encoder.encode(metadataPart)
  const videoPartBytes = encoder.encode(videoPart)
  const closeDelimiterBytes = encoder.encode(closeDelimiter)

  // Combine all parts
  const totalLength = metadataBytes.length + videoPartBytes.length + videoData.length + closeDelimiterBytes.length
  const result = new Uint8Array(totalLength)

  let offset = 0
  result.set(metadataBytes, offset)
  offset += metadataBytes.length
  result.set(videoPartBytes, offset)
  offset += videoPartBytes.length
  result.set(videoData, offset)
  offset += videoData.length
  result.set(closeDelimiterBytes, offset)

  return result
}
