import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { clubId, text, media } = await req.json();

    if (!clubId) {
      throw new Error('Club ID is required');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: integration, error: integrationError } = await supabaseClient
      .from('integrations')
      .select('credentials')
      .eq('club_id', clubId)
      .eq('platform', 'facebook')
      .eq('is_active', true)
      .single();

    if (integrationError || !integration) {
      throw new Error('Facebook integration not found for this club');
    }

    const creds = integration.credentials || {};
    const accessToken = creds.access_token;
    const pageId = creds.page_id;

    if (!accessToken || !pageId) {
      throw new Error('Facebook integration is not properly configured');
    }

    let postData: Record<string, unknown> = {
      message: text || '',
      access_token: accessToken,
    };

    if (media && media.length > 0) {
      const images = media.filter((item: { type: string }) => item.type === 'image');
      const videos = media.filter((item: { type: string }) => item.type === 'youtube_video');

      if (images.length === 1) {
        postData.url = images[0].url;
      } else if (images.length > 1) {
        const mediaIds: string[] = [];
        for (const img of images) {
          const uploadRes = await fetch(
            `https://graph.facebook.com/v18.0/${pageId}/photos`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                url: img.url,
                published: false,
                access_token: accessToken,
              }),
            }
          );
          const uploadData = await uploadRes.json();
          if (uploadData.id) {
            mediaIds.push(uploadData.id);
          }
        }
        if (mediaIds.length > 0) {
          postData.attached_media = mediaIds.map(id => ({ media_fbid: id }));
        }
      }

      if (videos.length > 0) {
        const videoLinks = videos.map((video: { url: string }) => {
          const videoId = extractYouTubeVideoId(video.url);
          return `https://youtube.com/watch?v=${videoId}`;
        }).join('\n');

        postData.message += (postData.message ? '\n\n' : '') + videoLinks;
      }
    }

    const facebookResponse = await fetch(
      `https://graph.facebook.com/v18.0/${pageId}/feed`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postData),
      }
    );

    const facebookResult = await facebookResponse.json();

    if (!facebookResponse.ok) {
      throw new Error(`Facebook API error: ${facebookResult.error?.message || 'Unknown error'}`);
    }

    await supabaseClient
      .from('email_logs')
      .insert({
        club_id: clubId,
        recipient_email: 'facebook@social.media',
        subject: 'Social Media Post',
        body: `Posted to Facebook: ${text}`,
        email_type: 'social_media_post',
        status: 'sent',
      });

    return new Response(
      JSON.stringify({
        success: true,
        postId: facebookResult.id,
        message: 'Successfully posted to Facebook',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error posting to Facebook:', error);

    return new Response(
      JSON.stringify({ error: error.message || 'Failed to post to Facebook' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});

function extractYouTubeVideoId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}
