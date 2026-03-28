import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

interface CloudflareCredentials {
  account_id: string;
  api_token: string;
}

interface YouTubeCredentials {
  access_token: string;
  refresh_token?: string;
  channel_id?: string;
  channel_name?: string;
  expires_at?: string;
}

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
}

async function getYouTubeCredentials(
  serviceClient: any
): Promise<{ credentials: YouTubeCredentials; integrationId: string }> {
  const { data: defaultIntegration } = await serviceClient
    .from("integrations")
    .select("id, credentials")
    .eq("platform", "youtube")
    .eq("is_active", true)
    .eq("is_default", true)
    .maybeSingle();

  if (!defaultIntegration?.credentials?.refresh_token) {
    throw new Error("No default YouTube integration found.");
  }

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("Missing Google OAuth credentials");
  }

  const creds = defaultIntegration.credentials as YouTubeCredentials;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: creds.refresh_token!,
      grant_type: "refresh_token",
    }),
  });

  if (!tokenRes.ok) {
    throw new Error("Failed to refresh YouTube token");
  }

  const tokenData = await tokenRes.json();
  creds.access_token = tokenData.access_token;

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
  await serviceClient
    .from("integrations")
    .update({
      credentials: { ...creds, expires_at: expiresAt },
      updated_at: new Date().toISOString(),
    })
    .eq("id", defaultIntegration.id);

  return { credentials: creds, integrationId: defaultIntegration.id };
}

async function getCloudflareCredentials(
  serviceClient: any,
  clubId: string
): Promise<CloudflareCredentials> {
  const { data: integration } = await serviceClient
    .from("integrations")
    .select("credentials")
    .eq("club_id", clubId)
    .eq("platform", "cloudflare_stream")
    .eq("is_active", true)
    .maybeSingle();

  if (!integration?.credentials) {
    throw new Error("Cloudflare Stream not configured for this club");
  }

  return integration.credentials as CloudflareCredentials;
}

async function waitForRecording(
  cfCreds: CloudflareCredentials,
  liveInputId: string,
  maxAttempts = 12,
  delayMs = 5000
): Promise<any> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[Segment] Checking recordings (attempt ${attempt}/${maxAttempts})...`);

    const res = await fetch(
      `${CF_API_BASE}/accounts/${cfCreds.account_id}/stream?search=${liveInputId}&type=live`,
      { headers: { Authorization: `Bearer ${cfCreds.api_token}` } }
    );

    const data = await res.json();
    if (res.ok && data.success && data.result?.length > 0) {
      const sorted = data.result.sort(
        (a: any, b: any) => new Date(b.created).getTime() - new Date(a.created).getTime()
      );

      const readyRecording = sorted.find((r: any) => r.readyToStream);
      if (readyRecording) {
        console.log(`[Segment] Found ready recording: ${readyRecording.uid}`);
        return readyRecording;
      }

      if (sorted.length > 0 && attempt >= 6) {
        console.log(`[Segment] Using latest recording even if not fully ready: ${sorted[0].uid}`);
        return sorted[0];
      }
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  throw new Error("No recording found after maximum attempts");
}

async function getDownloadUrl(
  cfCreds: CloudflareCredentials,
  videoId: string
): Promise<string> {
  const res = await fetch(
    `${CF_API_BASE}/accounts/${cfCreds.account_id}/stream/${videoId}/downloads`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfCreds.api_token}`,
        "Content-Type": "application/json",
      },
    }
  );

  const data = await res.json();
  if (!res.ok || !data.success) {
    const existRes = await fetch(
      `${CF_API_BASE}/accounts/${cfCreds.account_id}/stream/${videoId}/downloads`,
      { headers: { Authorization: `Bearer ${cfCreds.api_token}` } }
    );
    const existData = await existRes.json();
    if (existRes.ok && existData.result?.default?.url) {
      return existData.result.default.url;
    }
    throw new Error("Failed to create download URL");
  }

  if (data.result?.default?.url) {
    return data.result.default.url;
  }

  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const checkRes = await fetch(
      `${CF_API_BASE}/accounts/${cfCreds.account_id}/stream/${videoId}/downloads`,
      { headers: { Authorization: `Bearer ${cfCreds.api_token}` } }
    );
    const checkData = await checkRes.json();
    if (checkRes.ok && checkData.result?.default?.url) {
      const status = checkData.result?.default?.status;
      if (status === "ready" || status === "inprogress") {
        return checkData.result.default.url;
      }
    }
  }

  throw new Error("Download URL not ready after polling");
}

async function uploadToYouTube(
  ytCreds: YouTubeCredentials,
  videoUrl: string,
  title: string,
  description: string
): Promise<string> {
  console.log(`[Segment] Downloading video from Cloudflare: ${videoUrl}`);
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) {
    throw new Error(`Failed to download video: ${videoRes.status}`);
  }
  const videoData = await videoRes.arrayBuffer();
  console.log(`[Segment] Downloaded ${(videoData.byteLength / 1024 / 1024).toFixed(1)}MB`);

  const metadata = {
    snippet: { title, description, categoryId: "17" },
    status: { privacyStatus: "public" },
  };

  console.log("[Segment] Initiating YouTube resumable upload...");
  const initRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ytCreds.access_token}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Length": videoData.byteLength.toString(),
        "X-Upload-Content-Type": "video/mp4",
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!initRes.ok) {
    const errorText = await initRes.text();
    throw new Error(`YouTube upload init failed (${initRes.status}): ${errorText}`);
  }

  const uploadUrl = initRes.headers.get("Location");
  if (!uploadUrl) {
    throw new Error("No upload URL returned from YouTube");
  }

  console.log("[Segment] Uploading video data to YouTube...");
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4" },
    body: videoData,
  });

  if (!uploadRes.ok) {
    const errorText = await uploadRes.text();
    throw new Error(`YouTube upload failed (${uploadRes.status}): ${errorText}`);
  }

  const uploadData = await uploadRes.json();
  console.log(`[Segment] YouTube upload complete. Video ID: ${uploadData.id}`);
  return uploadData.id;
}

async function addToPlaylist(
  ytCreds: YouTubeCredentials,
  playlistId: string,
  videoId: string,
  position?: number
): Promise<void> {
  const itemData: any = {
    snippet: {
      playlistId,
      resourceId: { kind: "youtube#video", videoId },
    },
  };
  if (typeof position === "number") {
    itemData.snippet.position = position;
  }

  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ytCreds.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(itemData),
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[Segment] Failed to add to playlist: ${errorText}`);
  } else {
    console.log(`[Segment] Added video ${videoId} to playlist ${playlistId}`);
  }
}

async function createPlaylist(
  ytCreds: YouTubeCredentials,
  title: string,
  description: string
): Promise<string> {
  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/playlists?part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ytCreds.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        snippet: { title, description },
        status: { privacyStatus: "public" },
      }),
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to create playlist: ${errorText}`);
  }

  const data = await res.json();
  console.log(`[Segment] Created YouTube playlist: ${data.id} - ${title}`);
  return data.id;
}

async function deleteCloudflareVideo(
  cfCreds: CloudflareCredentials,
  videoId: string
): Promise<void> {
  console.log(`[Segment] Deleting Cloudflare video: ${videoId}`);
  const res = await fetch(
    `${CF_API_BASE}/accounts/${cfCreds.account_id}/stream/${videoId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${cfCreds.api_token}` },
    }
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    console.error("[Segment] Failed to delete CF video:", data);
  } else {
    console.log(`[Segment] Cloudflare video ${videoId} deleted`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const serviceClient = getServiceClient();
    const { segmentId } = await req.json();

    if (!segmentId) {
      return new Response(
        JSON.stringify({ error: "segmentId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: segment, error: segError } = await serviceClient
      .from("livestream_race_segments")
      .select("*")
      .eq("id", segmentId)
      .maybeSingle();

    if (segError || !segment) {
      return new Response(
        JSON.stringify({ error: "Segment not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (segment.upload_status === "uploaded" || segment.upload_status === "cleanup_complete") {
      return new Response(
        JSON.stringify({ success: true, message: "Already processed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await serviceClient
      .from("livestream_race_segments")
      .update({ upload_status: "uploading", updated_at: new Date().toISOString() })
      .eq("id", segmentId);

    const cfCreds = await getCloudflareCredentials(serviceClient, segment.club_id);

    let recording: any;
    if (segment.cloudflare_video_id) {
      const res = await fetch(
        `${CF_API_BASE}/accounts/${cfCreds.account_id}/stream/${segment.cloudflare_video_id}`,
        { headers: { Authorization: `Bearer ${cfCreds.api_token}` } }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        recording = data.result;
      } else {
        recording = await waitForRecording(cfCreds, segment.cloudflare_input_id);
      }
    } else {
      recording = await waitForRecording(cfCreds, segment.cloudflare_input_id);
    }

    const cfVideoId = recording.uid;
    await serviceClient
      .from("livestream_race_segments")
      .update({ cloudflare_video_id: cfVideoId })
      .eq("id", segmentId);

    const downloadUrl = await getDownloadUrl(cfCreds, cfVideoId);

    const { credentials: ytCreds } = await getYouTubeCredentials(serviceClient);

    let playlistId = segment.youtube_playlist_id;

    if (!playlistId && segment.session_id) {
      const { data: session } = await serviceClient
        .from("livestream_sessions")
        .select("youtube_playlist_id, title, event_id")
        .eq("id", segment.session_id)
        .maybeSingle();

      playlistId = session?.youtube_playlist_id;

      if (!playlistId && segment.event_id) {
        const { data: existingPlaylist } = await serviceClient
          .from("livestream_youtube_playlists")
          .select("youtube_playlist_id")
          .eq("event_id", segment.event_id)
          .eq("club_id", segment.club_id)
          .maybeSingle();

        if (existingPlaylist?.youtube_playlist_id) {
          playlistId = existingPlaylist.youtube_playlist_id;
        } else {
          const eventTitle = session?.title || "Race Replays";
          const newPlaylistId = await createPlaylist(
            ytCreds,
            eventTitle,
            `Race replays from ${eventTitle} - Powered by AlfiePRO`
          );

          await serviceClient
            .from("livestream_youtube_playlists")
            .insert({
              club_id: segment.club_id,
              event_id: segment.event_id,
              youtube_playlist_id: newPlaylistId,
              playlist_title: eventTitle,
            });

          playlistId = newPlaylistId;
        }

        if (session) {
          await serviceClient
            .from("livestream_sessions")
            .update({ youtube_playlist_id: playlistId })
            .eq("id", segment.session_id);
        }
      }
    }

    const youtubeVideoId = await uploadToYouTube(
      ytCreds,
      downloadUrl,
      segment.segment_title,
      `${segment.segment_title} - Powered by AlfiePRO`
    );

    if (playlistId) {
      await addToPlaylist(ytCreds, playlistId, youtubeVideoId, segment.race_number - 1);
    }

    const duration = recording.duration ? Math.round(recording.duration) : null;

    await serviceClient
      .from("livestream_race_segments")
      .update({
        youtube_video_id: youtubeVideoId,
        youtube_playlist_id: playlistId || null,
        upload_status: "uploaded",
        duration,
        segment_end_time: segment.segment_end_time || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", segmentId);

    await serviceClient.from("livestream_archives").insert({
      session_id: segment.session_id,
      club_id: segment.club_id,
      title: segment.segment_title,
      description: `${segment.segment_title} - Powered by AlfiePRO`,
      event_id: segment.event_id || null,
      heat_number: segment.heat_number || null,
      youtube_video_id: youtubeVideoId,
      youtube_url: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
      source: "youtube",
      recorded_at: segment.segment_start_time,
      is_public: true,
      duration,
    });

    console.log(`[Segment] Cleaning up Cloudflare video: ${cfVideoId}`);
    await deleteCloudflareVideo(cfCreds, cfVideoId);

    await serviceClient
      .from("livestream_race_segments")
      .update({
        upload_status: "cleanup_complete",
        updated_at: new Date().toISOString(),
      })
      .eq("id", segmentId);

    console.log(`[Segment] Fully processed segment ${segmentId}: CF -> YouTube -> Cleanup`);

    return new Response(
      JSON.stringify({
        success: true,
        youtubeVideoId,
        playlistId,
        cloudflareVideoDeleted: true,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Segment] Error processing segment:", error);

    try {
      const serviceClient = getServiceClient();
      const { segmentId } = await new Response(req.body).json().catch(() => ({}));
      if (segmentId) {
        await serviceClient
          .from("livestream_race_segments")
          .update({
            upload_status: "failed",
            upload_error: error.message || "Unknown error",
            updated_at: new Date().toISOString(),
          })
          .eq("id", segmentId);
      }
    } catch {}

    return new Response(
      JSON.stringify({ error: error.message || "Failed to process segment" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
