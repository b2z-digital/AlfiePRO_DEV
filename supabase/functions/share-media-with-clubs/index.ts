import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ShareRequest {
  mediaIds: string[]
  sharingClubId: string
  recipientClubIds: string[]
  message?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    // Verify the user
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
    
    if (authError || !user) {
      throw new Error('Invalid authentication')
    }

    const { mediaIds, sharingClubId, recipientClubIds, message }: ShareRequest = await req.json()

    // Validate input
    if (!mediaIds || !Array.isArray(mediaIds) || mediaIds.length === 0) {
      throw new Error('Media IDs are required')
    }

    if (!sharingClubId) {
      throw new Error('Sharing club ID is required')
    }

    if (!recipientClubIds || !Array.isArray(recipientClubIds) || recipientClubIds.length === 0) {
      throw new Error('Recipient club IDs are required')
    }

    // Verify user has permission to share from the sharing club
    const { data: userClub, error: userClubError } = await supabaseClient
      .from('user_clubs')
      .select('role')
      .eq('user_id', user.id)
      .eq('club_id', sharingClubId)
      .in('role', ['admin', 'editor'])
      .single()

    if (userClubError || !userClub) {
      throw new Error('You do not have permission to share media from this club')
    }

    // Verify all media items belong to the sharing club
    const { data: mediaItems, error: mediaError } = await supabaseClient
      .from('event_media')
      .select('id, club_id')
      .in('id', mediaIds)
      .eq('club_id', sharingClubId)

    if (mediaError) {
      throw new Error('Failed to verify media ownership')
    }

    if (!mediaItems || mediaItems.length !== mediaIds.length) {
      throw new Error('Some media items do not belong to your club or do not exist')
    }

    // Verify recipient clubs exist
    const { data: recipientClubs, error: recipientError } = await supabaseClient
      .from('clubs')
      .select('id, name')
      .in('id', recipientClubIds)

    if (recipientError) {
      throw new Error('Failed to verify recipient clubs')
    }

    if (!recipientClubs || recipientClubs.length !== recipientClubIds.length) {
      throw new Error('Some recipient clubs do not exist')
    }

    // Create sharing records
    const sharingRecords = []
    for (const mediaId of mediaIds) {
      for (const recipientClubId of recipientClubIds) {
        sharingRecords.push({
          media_id: mediaId,
          sharing_club_id: sharingClubId,
          recipient_club_id: recipientClubId,
          shared_by_user_id: user.id,
          message: message || null
        })
      }
    }

    const { error: insertError } = await supabaseClient
      .from('shared_club_media')
      .insert(sharingRecords)

    if (insertError) {
      throw new Error(`Failed to create sharing records: ${insertError.message}`)
    }

    // Get sharing club name for response
    const { data: sharingClub } = await supabaseClient
      .from('clubs')
      .select('name')
      .eq('id', sharingClubId)
      .single()

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully shared ${mediaIds.length} media item${mediaIds.length > 1 ? 's' : ''} with ${recipientClubIds.length} club${recipientClubIds.length > 1 ? 's' : ''}`,
        sharedCount: mediaIds.length * recipientClubIds.length,
        sharingClub: sharingClub?.name || 'Unknown Club'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error in share-media-with-clubs function:', error)
    
    return new Response(
      JSON.stringify({
        error: error.message || 'An unexpected error occurred'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})