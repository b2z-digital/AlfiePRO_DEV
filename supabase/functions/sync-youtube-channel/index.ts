import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

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
    const { channelId } = await req.json();

    if (!channelId) {
      return new Response(
        JSON.stringify({ error: "Channel ID is required" }),
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
      return new Response(
        JSON.stringify({
          error: "YouTube API key not configured. Please add YOUTUBE_API_KEY to your environment variables.",
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get channel from database
    const { data: channel, error: channelError } = await supabase
      .from("alfie_tv_channels")
      .select("*")
      .eq("id", channelId)
      .single();

    if (channelError || !channel) {
      console.error('Channel fetch error:', channelError);
      return new Response(
        JSON.stringify({ error: "Channel not found in database", details: channelError?.message }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Extract YouTube channel ID from URL
    let youtubeChannelId = channel.channel_id;
    const channelUrl = channel.channel_url;

    console.log('Processing channel URL:', channelUrl);

    if (!youtubeChannelId) {
      // First, check if URL is just a plain channel ID
      const plainIdMatch = channelUrl.match(/^[UC][\w-]{22,}$/);
      if (plainIdMatch) {
        youtubeChannelId = channelUrl;
        console.log('Detected plain channel ID:', youtubeChannelId);
      }
      // Handle @username format (e.g., https://www.youtube.com/@QldRadioYachting or just @username)
      else {
        const handleMatch = channelUrl.match(/@([\w-]+)/);
        if (handleMatch) {
          const username = handleMatch[1];
          console.log('Detected @username format:', username);
        
        // Use the search API to find the channel by custom URL/handle
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(username)}&key=${YOUTUBE_API_KEY}`;
        console.log('Searching for channel...');
        
        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();
        
        console.log('Search API response:', JSON.stringify(searchData));
        
        if (searchData.error) {
          return new Response(
            JSON.stringify({ 
              error: `YouTube API error: ${searchData.error.message}`,
              details: searchData.error
            }),
            {
              status: 400,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            }
          );
        }
        
        if (searchData.items && searchData.items.length > 0) {
          // Find the best match - prefer exact channel title match
          let bestMatch = searchData.items[0];
          for (const item of searchData.items) {
            const channelTitle = item.snippet.channelTitle.toLowerCase();
            const queryLower = username.toLowerCase();
            if (channelTitle.includes(queryLower) || queryLower.includes(channelTitle.replace(/\s+/g, ''))) {
              bestMatch = item;
              break;
            }
          }
          youtubeChannelId = bestMatch.snippet.channelId || bestMatch.id.channelId;
          console.log('Found channel ID:', youtubeChannelId);
        }
        } else {
          // Handle /channel/ID format
          const channelMatch = channelUrl.match(/\/channel\/([\w-]+)/);
          if (channelMatch) {
            youtubeChannelId = channelMatch[1];
            console.log('Extracted channel ID from /channel/ URL:', youtubeChannelId);
          } else {
            // Handle /c/CustomName format
            const customMatch = channelUrl.match(/\/c\/([\w-]+)/);
            if (customMatch) {
              const customName = customMatch[1];
              console.log('Detected /c/ custom name:', customName);

              // Search for custom channel name
              const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(customName)}&key=${YOUTUBE_API_KEY}`;
              const searchResponse = await fetch(searchUrl);
              const searchData = await searchResponse.json();

              if (searchData.items && searchData.items.length > 0) {
                youtubeChannelId = searchData.items[0].snippet.channelId || searchData.items[0].id.channelId;
                console.log('Found channel ID via /c/ search:', youtubeChannelId);
              }
            } else {
              // Handle /user/Username format
              const userMatch = channelUrl.match(/\/user\/([\w-]+)/);
              if (userMatch) {
                const username = userMatch[1];
                console.log('Detected /user/ format:', username);

                // Search for user
                const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(username)}&key=${YOUTUBE_API_KEY}`;
                const searchResponse = await fetch(searchUrl);
                const searchData = await searchResponse.json();

                if (searchData.items && searchData.items.length > 0) {
                  youtubeChannelId = searchData.items[0].snippet.channelId || searchData.items[0].id.channelId;
                  console.log('Found channel ID via /user/ search:', youtubeChannelId);
                }
              }
            }
          }
        }
      }
    }

    if (!youtubeChannelId) {
      return new Response(
        JSON.stringify({ 
          error: "Could not extract YouTube channel ID from URL",
          details: "Unable to find channel using the provided URL. Please check the URL format."
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log('Using YouTube channel ID:', youtubeChannelId);

    // Fetch channel details
    const channelDetailsUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${youtubeChannelId}&key=${YOUTUBE_API_KEY}`;
    const channelDetailsResponse = await fetch(channelDetailsUrl);
    const channelDetailsData = await channelDetailsResponse.json();

    console.log('Channel details response:', JSON.stringify(channelDetailsData));

    if (channelDetailsData.error) {
      return new Response(
        JSON.stringify({ 
          error: `YouTube API error: ${channelDetailsData.error.message}`,
          details: channelDetailsData.error
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (!channelDetailsData.items || channelDetailsData.items.length === 0) {
      return new Response(
        JSON.stringify({ error: "Channel not found on YouTube with the extracted ID" }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const channelDetails = channelDetailsData.items[0];
    const uploadsPlaylistId = channelDetails.contentDetails.relatedPlaylists.uploads;

    console.log('Uploads playlist ID:', uploadsPlaylistId);

    // Update channel metadata
    await supabase
      .from("alfie_tv_channels")
      .update({
        channel_id: youtubeChannelId,
        channel_thumbnail: channelDetails.snippet.thumbnails.high?.url || channelDetails.snippet.thumbnails.default?.url,
        channel_description: channelDetails.snippet.description,
        subscriber_count: parseInt(channelDetails.statistics.subscriberCount) || 0,
      })
      .eq("id", channelId);

    // Fetch ALL videos from the uploads playlist with pagination
    let allVideoItems: any[] = [];
    let nextPageToken: string | undefined = undefined;
    let pageCount = 0;

    console.log('Starting to fetch all videos from playlist...');

    do {
      pageCount++;
      const videosUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${uploadsPlaylistId}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}&key=${YOUTUBE_API_KEY}`;
      const videosResponse = await fetch(videosUrl);
      const videosData = await videosResponse.json();

      console.log(`Page ${pageCount}: ${videosData.items?.length || 0} videos found`);

      if (videosData.error) {
        return new Response(
          JSON.stringify({
            error: `YouTube API error fetching videos: ${videosData.error.message}`,
            details: videosData.error
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      if (videosData.items && videosData.items.length > 0) {
        allVideoItems = allVideoItems.concat(videosData.items);
      }

      nextPageToken = videosData.nextPageToken;
    } while (nextPageToken);

    console.log(`Total videos fetched: ${allVideoItems.length} across ${pageCount} pages`);

    if (allVideoItems.length === 0) {
      // Update channel with 0 videos
      await supabase
        .from("alfie_tv_channels")
        .update({
          video_count: 0,
          last_imported_at: new Date().toISOString(),
        })
        .eq("id", channelId);

      return new Response(
        JSON.stringify({
          success: true,
          videosImported: 0,
          channelName: channelDetails.snippet.title,
          message: "Channel synced but no videos found"
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Get video IDs to fetch details (process in batches of 50 due to API limits)
    const allVideoDetails: any[] = [];

    for (let i = 0; i < allVideoItems.length; i += 50) {
      const batchItems = allVideoItems.slice(i, i + 50);
      const videoIds = batchItems.map((item: any) => item.contentDetails.videoId).join(',');

      // Fetch video details (duration, statistics)
      const videoDetailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics,snippet&id=${videoIds}&key=${YOUTUBE_API_KEY}`;
      const videoDetailsResponse = await fetch(videoDetailsUrl);
      const videoDetailsData = await videoDetailsResponse.json();

      if (videoDetailsData.items && videoDetailsData.items.length > 0) {
        allVideoDetails.push(...videoDetailsData.items);
      }

      console.log(`Video details batch ${Math.floor(i / 50) + 1}: ${videoDetailsData.items?.length || 0} videos`);
    }

    console.log(`Total video details fetched: ${allVideoDetails.length}`);

    // Convert ISO 8601 duration to seconds
    const parseDuration = (isoDuration: string): number => {
      const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (!match) return 0;
      const hours = parseInt(match[1] || '0');
      const minutes = parseInt(match[2] || '0');
      const seconds = parseInt(match[3] || '0');
      return hours * 3600 + minutes * 60 + seconds;
    };

    // Format duration as HH:MM:SS or MM:SS
    const formatDuration = (seconds: number): string => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      
      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    };

    // Prepare videos for insertion
    const videosToInsert = allVideoDetails.map((video: any) => {
      const durationSeconds = parseDuration(video.contentDetails.duration);
      return {
        youtube_id: video.id,
        title: video.snippet.title,
        description: video.snippet.description || '',
        thumbnail_url: video.snippet.thumbnails.medium?.url || video.snippet.thumbnails.default?.url,
        thumbnail_high_url: video.snippet.thumbnails.high?.url || video.snippet.thumbnails.maxres?.url,
        duration: durationSeconds,
        duration_formatted: formatDuration(durationSeconds),
        channel_id: channelId,
        boat_classes: [],
        content_type: 'general',
        skill_level: 'intermediate',
        view_count: parseInt(video.statistics.viewCount) || 0,
        like_count: parseInt(video.statistics.likeCount) || 0,
        published_at: video.snippet.publishedAt,
        is_approved: true,
        is_featured: false,
        alfie_view_count: 0,
        tags: video.snippet.tags || [],
      };
    });

    console.log('Inserting', videosToInsert.length, 'videos into database');
    console.log('Sample video data:', JSON.stringify(videosToInsert[0]));

    // Upsert videos (insert or update if youtube_id already exists)
    const { data: insertedData, error: insertError } = await supabase
      .from("alfie_tv_videos")
      .upsert(videosToInsert, { onConflict: 'youtube_id' })
      .select();

    if (insertError) {
      console.error('Error inserting videos:', insertError);
      console.error('Error details:', JSON.stringify(insertError));
      return new Response(
        JSON.stringify({ 
          error: "Failed to save videos", 
          details: insertError.message,
          hint: insertError.hint,
          code: insertError.code
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log('Successfully inserted', insertedData?.length || videosToInsert.length, 'videos');

    // Fetch YouTube playlists from the channel
    console.log('Fetching playlists from channel...');
    let allPlaylists: any[] = [];
    let playlistPageToken: string | undefined = undefined;

    do {
      const playlistsUrl = `https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&channelId=${youtubeChannelId}&maxResults=50${playlistPageToken ? `&pageToken=${playlistPageToken}` : ''}&key=${YOUTUBE_API_KEY}`;
      const playlistsResponse = await fetch(playlistsUrl);
      const playlistsData = await playlistsResponse.json();

      if (playlistsData.items && playlistsData.items.length > 0) {
        allPlaylists = allPlaylists.concat(playlistsData.items);
      }

      playlistPageToken = playlistsData.nextPageToken;
    } while (playlistPageToken);

    console.log(`Found ${allPlaylists.length} playlists`);

    // Import playlists and their videos
    let totalPlaylistVideos = 0;
    for (const playlist of allPlaylists) {
      // Upsert playlist
      const { data: playlistData, error: playlistError } = await supabase
        .from("alfie_tv_youtube_playlists")
        .upsert({
          channel_id: channelId,
          youtube_playlist_id: playlist.id,
          title: playlist.snippet.title,
          description: playlist.snippet.description || '',
          thumbnail_url: playlist.snippet.thumbnails.medium?.url || playlist.snippet.thumbnails.default?.url,
          video_count: playlist.contentDetails.itemCount || 0,
          published_at: playlist.snippet.publishedAt,
        }, { onConflict: 'youtube_playlist_id' })
        .select()
        .single();

      if (playlistError) {
        console.error('Error upserting playlist:', playlist.snippet.title, playlistError);
        continue;
      }

      // Fetch videos in this playlist
      let playlistVideoItems: any[] = [];
      let playlistVideoPageToken: string | undefined = undefined;

      do {
        const playlistVideosUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${playlist.id}&maxResults=50${playlistVideoPageToken ? `&pageToken=${playlistVideoPageToken}` : ''}&key=${YOUTUBE_API_KEY}`;
        const playlistVideosResponse = await fetch(playlistVideosUrl);
        const playlistVideosData = await playlistVideosResponse.json();

        if (playlistVideosData.items && playlistVideosData.items.length > 0) {
          playlistVideoItems = playlistVideoItems.concat(playlistVideosData.items);
        }

        playlistVideoPageToken = playlistVideosData.nextPageToken;
      } while (playlistVideoPageToken);

      // Link videos to playlist
      for (let i = 0; i < playlistVideoItems.length; i++) {
        const playlistVideoItem = playlistVideoItems[i];
        const videoYoutubeId = playlistVideoItem.contentDetails.videoId;

        // Find the video in our database
        const { data: videoData } = await supabase
          .from("alfie_tv_videos")
          .select("id")
          .eq("youtube_id", videoYoutubeId)
          .eq("channel_id", channelId)
          .maybeSingle();

        if (videoData) {
          // Link video to playlist
          await supabase
            .from("alfie_tv_youtube_playlist_videos")
            .upsert({
              youtube_playlist_id: playlistData.id,
              video_id: videoData.id,
              position: i,
            }, { onConflict: 'youtube_playlist_id,video_id', ignoreDuplicates: true });

          totalPlaylistVideos++;
        }
      }

      console.log(`Imported playlist "${playlist.snippet.title}" with ${playlistVideoItems.length} videos`);
    }

    // Update channel video count and last import time
    await supabase
      .from("alfie_tv_channels")
      .update({
        video_count: videosToInsert.length,
        last_imported_at: new Date().toISOString(),
      })
      .eq("id", channelId);

    console.log('Successfully synced channel with', videosToInsert.length, 'videos and', allPlaylists.length, 'playlists');

    return new Response(
      JSON.stringify({
        success: true,
        videosImported: videosToInsert.length,
        playlistsImported: allPlaylists.length,
        playlistVideosLinked: totalPlaylistVideos,
        channelName: channelDetails.snippet.title,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error("Error syncing YouTube channel:", err);
    return new Response(
      JSON.stringify({ error: "Failed to sync channel", details: err.message }),
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