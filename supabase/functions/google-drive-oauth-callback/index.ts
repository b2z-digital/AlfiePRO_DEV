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

    // Store integration in Supabase
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Use appropriate table based on organization type
    const tableName = organizationType === 'club' ? 'club_integrations' :
                      organizationType === 'state' ? 'state_association_integrations' :
                      'national_association_integrations'

    const idColumn = organizationType === 'club' ? 'club_id' :
                     organizationType === 'state' ? 'state_association_id' :
                     'national_association_id'

    const integrationData = {
      [idColumn]: organizationId,
      provider: 'google_drive',
      google_drive_refresh_token: refresh_token,
      google_drive_access_token: access_token,
      google_drive_token_expiry: expiresAt,
      google_drive_folder_id: rootFolderId,
      google_drive_sync_enabled: true,
      google_account_email: userEmail,
      is_enabled: true,
      connected_at: new Date().toISOString()
    }

    console.log('Attempting to save Google Drive integration:', {
      tableName,
      idColumn,
      organizationId,
      userEmail,
      rootFolderId
    })

    const { data: savedData, error: dbError } = await supabase
      .from(tableName)
      .upsert(integrationData, {
        onConflict: `${idColumn},provider`
      })
      .select()

    console.log('Database upsert result:', { savedData, dbError })

    if (dbError) {
      console.error('Database error details:', dbError)
      throw new Error(`Database error: ${dbError.message}`)
    }

    // Create a default resource category for Google Drive files
    let categoryId: string | null = null
    try {
      const categoryData = {
        organization_id: organizationId,
        organization_type: organizationType,
        name: 'My Files',
        description: 'Files synced from Google Drive',
        is_public: false,
        display_order: 0,
        created_at: new Date().toISOString()
      }

      // Check if category already exists
      const { data: existingCategory } = await supabase
        .from('resource_categories')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('organization_type', organizationType)
        .eq('name', 'My Files')
        .maybeSingle()

      if (existingCategory) {
        categoryId = existingCategory.id
        console.log('Default category "My Files" already exists with ID:', categoryId)
      } else {
        const { data: newCategory, error: categoryError } = await supabase
          .from('resource_categories')
          .insert(categoryData)
          .select('id')
          .single()

        if (categoryError) {
          console.error('Failed to create default category:', categoryError)
        } else if (newCategory) {
          categoryId = newCategory.id
          console.log('Default category "My Files" created successfully with ID:', categoryId)
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

        if (syncResponse.ok) {
          const syncData = await syncResponse.json()
          console.log('Initial Google Drive sync completed:', syncData)
        } else {
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
