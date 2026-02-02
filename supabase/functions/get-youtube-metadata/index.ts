import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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
    const { videoId } = await req.json();

    if (!videoId) {
      return new Response(
        JSON.stringify({ error: "Video ID is required" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY");

    if (!YOUTUBE_API_KEY) {
      console.warn("YouTube API key not configured - metadata fetch will be skipped");
      return new Response(
        JSON.stringify({
          error: "YouTube API key not configured. Please enter video details manually.",
          canEmbed: null,
          requiresManualEntry: true
        }),
        {
          status: 503,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const url = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${YOUTUBE_API_KEY}&part=snippet,status`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch video data from YouTube" }),
        {
          status: response.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (!data.items || data.items.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Video not found or is private",
          canEmbed: false
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const video = data.items[0];
    const snippet = video.snippet;
    const status = video.status;

    const isEmbeddable = status.embeddable !== false;
    const isPublic = status.privacyStatus === "public";

    if (!isEmbeddable || !isPublic) {
      return new Response(
        JSON.stringify({
          error: !isPublic
            ? "This video is private or unlisted and cannot be embedded"
            : "This video does not allow embedding",
          canEmbed: false,
          title: snippet.title,
        }),
        {
          status: 403,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        canEmbed: true,
        title: snippet.title,
        description: snippet.description,
        thumbnailUrl: snippet.thumbnails?.maxres?.url ||
                      snippet.thumbnails?.high?.url ||
                      snippet.thumbnails?.medium?.url ||
                      `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error("Error fetching YouTube metadata:", err);
    return new Response(
      JSON.stringify({ error: "Failed to process request" }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});