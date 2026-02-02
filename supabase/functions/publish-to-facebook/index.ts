import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { clubId, text, media } = await req.json()

    if (!clubId) {
      throw new Error('Club ID is required')
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get the club's Facebook integration
    const { data: integration, error: integrationError } = await supabaseClient
      .from('club_integrations')
      .select('access_token, page_id, page_name')
      .eq('club_id', clubId)
      .eq('provider', 'meta')
      .single()

    if (integrationError || !integration) {
      throw new Error('Facebook integration not found for this club')
    }

    if (!integration.access_token || !integration.page_id) {
      throw new Error('Facebook integration is not properly configured')
    }

    // Prepare the post content
    let postData: any = {
      message: text || '',
      access_token: integration.access_token
    }

    // Handle media attachments
    if (media && media.length > 0) {
      const images = media.filter((item: any) => item.type === 'image')
      const videos = media.filter((item: any) => item.type === 'youtube_video')

      // If we have images, create a photo post
      if (images.length > 0) {
        if (images.length === 1) {
          // Single image post
          postData.url = images[0].url
        } else {
          // Multiple images - use batch upload (simplified for demo)
          // In a real implementation, you'd need to upload images to Facebook first
          postData.attached_media = images.map((img: any, index: number) => ({
            media_fbid: `temp_${index}`, // This would be the actual Facebook media ID after upload
          }))
        }
      }

      // Add YouTube video links to the message
      if (videos.length > 0) {
        const videoLinks = videos.map((video: any) => {
          const videoId = extractYouTubeVideoId(video.url)
          return `https://youtube.com/watch?v=${videoId}`
        }).join('\n')
        
        postData.message += (postData.message ? '\n\n' : '') + videoLinks
      }
    }

    // Post to Facebook Page
    const facebookResponse = await fetch(
      `https://graph.facebook.com/v18.0/${integration.page_id}/feed`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(postData)
      }
    )

    const facebookResult = await facebookResponse.json()

    if (!facebookResponse.ok) {
      throw new Error(`Facebook API error: ${facebookResult.error?.message || 'Unknown error'}`)
    }

    // Log the successful post
    await supabaseClient
      .from('email_logs')
      .insert({
        club_id: clubId,
        recipient_email: 'facebook@social.media',
        subject: 'Social Media Post',
        body: `Posted to Facebook: ${text}`,
        email_type: 'social_media_post',
        status: 'sent'
      })

    return new Response(
      JSON.stringify({
        success: true,
        postId: facebookResult.id,
        message: 'Successfully posted to Facebook'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error posting to Facebook:', error)
    
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to post to Facebook'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})

function extractYouTubeVideoId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/
  const match = url.match(regExp)
  return (match && match[2].length === 11) ? match[2] : null
}