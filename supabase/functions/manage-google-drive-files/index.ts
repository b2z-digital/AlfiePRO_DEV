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

    // Get access token function - uses unified integrations table
    async function getAccessToken(organizationId: string, organizationType: string) {
      const idColumn = organizationType === 'club' ? 'club_id' :
                       organizationType === 'state' ? 'state_association_id' :
                       'national_association_id';

      const { data: integration } = await supabase
        .from('integrations')
        .select('id, credentials')
        .eq(idColumn, organizationId)
        .eq('platform', 'google_drive')
        .maybeSingle();

      if (!integration?.credentials?.refresh_token) {
        throw new Error('Google Drive not connected');
      }

      const creds = integration.credentials;

      // Check if token is expired
      const isExpired = !creds.token_expires_at ||
        new Date(creds.token_expires_at) <= new Date();

      if (isExpired) {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId!,
            client_secret: clientSecret!,
            refresh_token: creds.refresh_token,
            grant_type: 'refresh_token',
          }),
        });

        const tokenData = await tokenResponse.json();
        const newAccessToken = tokenData.access_token;
        const expiresIn = tokenData.expires_in || 3600;
        const newExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

        await supabase.from('integrations').update({
          credentials: { ...creds, access_token: newAccessToken, token_expires_at: newExpiry },
        }).eq('id', integration.id);

        return newAccessToken;
      }

      return creds.access_token;
    }

    // Get root folder id from unified integrations table
    async function getRootFolderId(organizationId: string, organizationType: string) {
      const idColumn = organizationType === 'club' ? 'club_id' :
                       organizationType === 'state' ? 'state_association_id' :
                       'national_association_id';

      const { data: integration } = await supabase
        .from('integrations')
        .select('credentials')
        .eq(idColumn, organizationId)
        .eq('platform', 'google_drive')
        .maybeSingle();

      return integration?.credentials?.folder_id || integration?.credentials?.root_folder_id || null;
    }

    if (action === 'create_folder') {
      const { organizationId, organizationType, folderName, parentFolderId } = body;

      if (!folderName) {
        throw new Error('Folder name is required');
      }

      const accessToken = await getAccessToken(organizationId, organizationType);
      const rootFolderId = await getRootFolderId(organizationId, organizationType);

      const targetParentId = parentFolderId || rootFolderId;

      if (!targetParentId) {
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
            parents: [targetParentId]
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

    if (action === 'sync' || action === 'list_folder') {
      const { organizationId, organizationType, folderId: bodyFolderId } = body;

      let folderId = bodyFolderId;

      // If no folderId provided, use the root folder from integration
      if (!folderId) {
        folderId = await getRootFolderId(organizationId, organizationType);
      }

      if (!folderId) {
        throw new Error('folderId is required');
      }

      const accessToken = await getAccessToken(organizationId, organizationType);

      const listResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,webViewLink,webContentLink,createdTime,modifiedTime,size,thumbnailLink,iconLink)&orderBy=folder,name`,
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
          files: listData.files || [],
          folderId
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

    if (action === 'rename_file') {
      const { organizationId, organizationType, fileId, newName } = body;

      if (!fileId || !newName) {
        throw new Error('fileId and newName are required');
      }

      const accessToken = await getAccessToken(organizationId, organizationType);

      const renameResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: newName }),
        }
      );

      if (!renameResponse.ok) {
        const error = await renameResponse.text();
        console.error('Rename error:', error);
        throw new Error('Failed to rename file in Google Drive');
      }

      const renamed = await renameResponse.json();
      return new Response(
        JSON.stringify({ success: true, file: renamed }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (action === 'move_file') {
      const { organizationId, organizationType, fileId, targetFolderId, currentParentId } = body;

      if (!fileId || !targetFolderId) {
        throw new Error('fileId and targetFolderId are required');
      }

      const accessToken = await getAccessToken(organizationId, organizationType);

      const removeParents = currentParentId ? `&removeParents=${currentParentId}` : '';
      const moveResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${targetFolderId}${removeParents}&fields=id,name,parents`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }
      );

      if (!moveResponse.ok) {
        const error = await moveResponse.text();
        console.error('Move error:', error);
        throw new Error('Failed to move file in Google Drive');
      }

      const moved = await moveResponse.json();
      return new Response(
        JSON.stringify({ success: true, file: moved }),
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