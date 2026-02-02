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
    const body = await req.json();
    const { action } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const clientId = Deno.env.get("GOOGLE_DRIVE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ error: "Google Drive credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get access token function
    async function getAccessToken(organizationId: string, organizationType: string) {
      const tableName = organizationType === 'club' ? 'club_integrations' :
                        organizationType === 'state' ? 'state_association_integrations' :
                        'national_association_integrations';
      const idColumn = organizationType === 'club' ? 'club_id' :
                       organizationType === 'state' ? 'state_association_id' :
                       'national_association_id';

      const { data: integration } = await supabase
        .from(tableName)
        .select('google_drive_refresh_token, google_drive_access_token, google_drive_token_expiry')
        .eq(idColumn, organizationId)
        .eq('provider', 'google_drive')
        .maybeSingle();

      if (!integration?.google_drive_refresh_token) {
        throw new Error('Google Drive not connected');
      }

      // Check if token is expired
      const isExpired = !integration.google_drive_token_expiry ||
        new Date(integration.google_drive_token_expiry) <= new Date();

      if (isExpired) {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: integration.google_drive_refresh_token,
            grant_type: 'refresh_token',
          }),
        });

        const tokenData = await tokenResponse.json();
        const newAccessToken = tokenData.access_token;
        const expiresIn = tokenData.expires_in || 3600;
        const newExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

        await supabase.from(tableName).update({
          google_drive_access_token: newAccessToken,
          google_drive_token_expiry: newExpiry,
        }).eq(idColumn, organizationId).eq('provider', 'google_drive');

        return newAccessToken;
      }

      return integration.google_drive_access_token;
    }

    if (action === 'create_folder') {
      const { organizationId, organizationType, folderName } = body;
      
      if (!folderName) {
        throw new Error('Folder name is required');
      }

      const accessToken = await getAccessToken(organizationId, organizationType);

      const tableName = organizationType === 'club' ? 'club_integrations' :
                        organizationType === 'state' ? 'state_association_integrations' :
                        'national_association_integrations';
      const idColumn = organizationType === 'club' ? 'club_id' :
                       organizationType === 'state' ? 'state_association_id' :
                       'national_association_id';

      const { data: integration } = await supabase
        .from(tableName)
        .select('google_drive_folder_id')
        .eq(idColumn, organizationId)
        .eq('provider', 'google_drive')
        .maybeSingle();

      if (!integration?.google_drive_folder_id) {
        throw new Error('Google Drive folder not configured');
      }

      const createFolderResponse = await fetch(
        'https://www.googleapis.com/drive/v3/files',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [integration.google_drive_folder_id]
          }),
        }
      );

      if (!createFolderResponse.ok) {
        throw new Error('Failed to create folder in Google Drive');
      }

      const folderData = await createFolderResponse.json();

      return new Response(
        JSON.stringify({
          success: true,
          folderId: folderData.id,
          folderName: folderData.name
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (action === 'upload_file') {
      const { organizationId, organizationType, fileName, fileData, mimeType, folderId } = body;

      if (!fileName || !fileData || !folderId) {
        throw new Error('fileName, fileData, and folderId are required');
      }

      const accessToken = await getAccessToken(organizationId, organizationType);

      const boundary = '-------314159265358979323846';
      const delimiter = "\r\n--" + boundary + "\r\n";
      const close_delim = "\r\n--" + boundary + "--";

      const metadata = {
        name: fileName,
        mimeType: mimeType,
        parents: [folderId]
      };

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: ' + mimeType + '\r\n' +
        'Content-Transfer-Encoding: base64\r\n' +
        '\r\n' +
        fileData +
        close_delim;

      const uploadResponse = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'multipart/related; boundary=' + boundary,
          },
          body: multipartRequestBody
        }
      );

      if (!uploadResponse.ok) {
        const error = await uploadResponse.text();
        console.error('Upload error:', error);
        throw new Error('Failed to upload file to Google Drive');
      }

      const fileInfo = await uploadResponse.json();

      return new Response(
        JSON.stringify({
          success: true,
          fileId: fileInfo.id,
          fileName: fileInfo.name,
          webViewLink: `https://drive.google.com/file/d/${fileInfo.id}/view`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (action === 'sync') {
      const { organizationId, organizationType, folderId } = body;

      if (!folderId) {
        throw new Error('folderId is required');
      }

      const accessToken = await getAccessToken(organizationId, organizationType);

      const listResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,webViewLink,createdTime,modifiedTime,size)`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!listResponse.ok) {
        const error = await listResponse.text();
        console.error('List error:', error);
        throw new Error('Failed to list files from Google Drive');
      }

      const listData = await listResponse.json();

      return new Response(
        JSON.stringify({
          success: true,
          files: listData.files || []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (action === 'delete_file') {
      const { organizationId, organizationType, fileId } = body;

      if (!fileId) {
        throw new Error('fileId is required');
      }

      const accessToken = await getAccessToken(organizationId, organizationType);

      const deleteResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!deleteResponse.ok) {
        const error = await deleteResponse.text();
        console.error('Delete error:', error);
        throw new Error('Failed to delete file from Google Drive');
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'File deleted from Google Drive'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (action === 'delete_folder') {
      const { organizationId, organizationType, folderId } = body;

      if (!folderId) {
        throw new Error('folderId is required');
      }

      const accessToken = await getAccessToken(organizationId, organizationType);

      const deleteResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${folderId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!deleteResponse.ok) {
        const error = await deleteResponse.text();
        console.error('Delete folder error:', error);
        throw new Error('Failed to delete folder from Google Drive');
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Folder deleted from Google Drive'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});