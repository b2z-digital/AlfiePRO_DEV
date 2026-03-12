import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface OAuthCallbackRequest {
  code: string;
  state: string;
  redirectUri: string;
  organizationId: string;
  organizationType: 'club' | 'state' | 'national';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const clientId = Deno.env.get('GOOGLE_DRIVE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  // GET request: return just the client ID so the frontend can initiate the correct OAuth flow
  if (req.method === 'GET') {
    if (!clientId) {
      return new Response(
        JSON.stringify({ error: 'Google Drive client ID not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }
    return new Response(
      JSON.stringify({ clientId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }

  try {
    const { code, state, redirectUri, organizationId, organizationType }: OAuthCallbackRequest = await req.json()

    if (!code || !state || !redirectUri || !organizationId || !organizationType) {
      throw new Error('Missing required parameters')
    }

    if (!clientId || !clientSecret || !supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing environment variables')
    }

    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      throw new Error(`Token exchange failed: ${errorData}`)
    }

    const tokenData = await tokenResponse.json()
    const { access_token, refresh_token, expires_in } = tokenData

    if (!access_token) {
      throw new Error('No access token received')
    }

    // Get Google Drive account information
    const aboutResponse = await fetch(
      'https://www.googleapis.com/drive/v3/about?fields=user',
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
        },
      }
    )

    if (!aboutResponse.ok) {
      const errorData = await aboutResponse.text()
      throw new Error(`Failed to fetch Drive account info: ${errorData}`)
    }

    const aboutData = await aboutResponse.json()
    const userEmail = aboutData.user?.emailAddress

    if (!userEmail) {
      throw new Error('Could not retrieve Google Drive account email')
    }

    // Create a root folder for AlfiePRO resources
    const folderMetadata = {
      name: 'AlfiePRO Resources',
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Root folder for AlfiePRO club/association resources'
    }

    const folderResponse = await fetch(
      'https://www.googleapis.com/drive/v3/files',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(folderMetadata),
      }
    )

    if (!folderResponse.ok) {
      const errorData = await folderResponse.text()
      throw new Error(`Failed to create root folder: ${errorData}`)
    }

    const folderData = await folderResponse.json()
    const rootFolderId = folderData.id

    // Calculate token expiry time
    const expiresAt = new Date(Date.now() + (expires_in * 1000)).toISOString()

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Determine which ID column to use in the unified integrations table
    const idColumn = organizationType === 'club' ? 'club_id' :
                     organizationType === 'state' ? 'state_association_id' :
                     'national_association_id'

    // Store in the unified integrations table so all frontend queries work correctly
    const integrationData: Record<string, unknown> = {
      [idColumn]: organizationId,
      platform: 'google_drive',
      is_active: true,
      credentials: {
        google_account_email: userEmail,
        folder_id: rootFolderId,
        access_token,
        refresh_token,
        token_expires_at: expiresAt,
      },
      connected_at: new Date().toISOString(),
    }

    // Clear unrelated ID columns to avoid constraint issues
    if (idColumn !== 'club_id') integrationData['club_id'] = null
    if (idColumn !== 'state_association_id') integrationData['state_association_id'] = null
    if (idColumn !== 'national_association_id') integrationData['national_association_id'] = null

    console.log('Saving Google Drive integration to unified integrations table:', {
      idColumn,
      organizationId,
      userEmail,
      rootFolderId
    })

    // Check if an existing record exists (partial unique indexes don't support onConflict strings)
    const { data: existing } = await supabase
      .from('integrations')
      .select('id')
      .eq(idColumn, organizationId)
      .eq('platform', 'google_drive')
      .maybeSingle()

    let dbError: unknown
    if (existing?.id) {
      const { error } = await supabase
        .from('integrations')
        .update(integrationData)
        .eq('id', existing.id)
      dbError = error
    } else {
      const { error } = await supabase
        .from('integrations')
        .insert(integrationData)
      dbError = error
    }

    if (dbError) {
      const err = dbError as { message: string }
      console.error('Database error details:', dbError)
      throw new Error(`Database error: ${err.message}`)
    }

    // Create a default resource category for Google Drive files
    let categoryId: string | null = null
    try {
      const { data: existingCategory } = await supabase
        .from('resource_categories')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('organization_type', organizationType)
        .eq('name', 'My Files')
        .maybeSingle()

      if (existingCategory) {
        categoryId = existingCategory.id
      } else {
        const { data: newCategory, error: categoryError } = await supabase
          .from('resource_categories')
          .insert({
            organization_id: organizationId,
            organization_type: organizationType,
            name: 'My Files',
            description: 'Files synced from Google Drive',
            is_public: false,
            display_order: 0,
            created_at: new Date().toISOString()
          })
          .select('id')
          .single()

        if (categoryError) {
          console.error('Failed to create default category:', categoryError)
        } else if (newCategory) {
          categoryId = newCategory.id
        }
      }
    } catch (categoryError) {
      console.error('Error creating default category:', categoryError)
    }

    // Trigger initial sync of Google Drive files
    if (categoryId) {
      try {
        const syncResponse = await fetch(`${supabaseUrl}/functions/v1/manage-google-drive-files`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            action: 'sync',
            organizationId,
            organizationType,
            categoryId,
            recursive: true
          })
        })

        if (!syncResponse.ok) {
          const syncError = await syncResponse.text()
          console.error('Initial sync failed:', syncError)
        }
      } catch (syncError) {
        console.error('Error triggering initial sync:', syncError)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        userEmail,
        rootFolderId,
        message: 'Google Drive integration connected successfully'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Google Drive OAuth callback error:', error)

    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to process Google Drive OAuth callback'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
