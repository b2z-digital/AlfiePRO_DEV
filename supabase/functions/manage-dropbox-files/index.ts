import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

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
    const body = await req.json();
    const { action } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const appKey = Deno.env.get("DROPBOX_APP_KEY");
    const appSecret = Deno.env.get("DROPBOX_APP_SECRET");

    if (!appKey || !appSecret) {
      return new Response(
        JSON.stringify({ error: "Dropbox credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    async function getAccessToken(organizationId: string, organizationType: string) {
      const idColumn =
        organizationType === "club" ? "club_id" :
        organizationType === "state" ? "state_association_id" :
        "national_association_id";

      const { data: integration } = await supabase
        .from("integrations")
        .select("id, credentials")
        .eq(idColumn, organizationId)
        .eq("platform", "dropbox")
        .maybeSingle();

      if (!integration?.credentials?.refresh_token) {
        throw new Error("Dropbox not connected");
      }

      const creds = integration.credentials;
      const isExpired = !creds.token_expires_at || new Date(creds.token_expires_at) <= new Date();

      if (isExpired) {
        const tokenResponse = await fetch("https://api.dropboxapi.com/oauth2/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: creds.refresh_token,
            client_id: appKey!,
            client_secret: appSecret!,
          }),
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok || !tokenData.access_token) {
          console.error("Token refresh failed:", JSON.stringify(tokenData));
          throw new Error(
            `Dropbox token refresh failed: ${tokenData.error_description || tokenData.error || "unknown error"}. Please reconnect Dropbox in Integrations.`
          );
        }

        const newAccessToken = tokenData.access_token;
        const expiresIn = tokenData.expires_in || 14400;
        const newExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

        await supabase
          .from("integrations")
          .update({
            credentials: { ...creds, access_token: newAccessToken, token_expires_at: newExpiry },
          })
          .eq("id", integration.id);

        return newAccessToken;
      }

      return creds.access_token;
    }

    async function getRootFolderPath(organizationId: string, organizationType: string) {
      const idColumn =
        organizationType === "club" ? "club_id" :
        organizationType === "state" ? "state_association_id" :
        "national_association_id";

      const { data: integration } = await supabase
        .from("integrations")
        .select("credentials")
        .eq(idColumn, organizationId)
        .eq("platform", "dropbox")
        .maybeSingle();

      return integration?.credentials?.root_folder_path || "/AlfiePRO Resources";
    }

    if (action === "create_folder") {
      const { organizationId, organizationType, folderName, parentPath } = body;

      if (!folderName) {
        throw new Error("Folder name is required");
      }

      const accessToken = await getAccessToken(organizationId, organizationType);
      const rootPath = await getRootFolderPath(organizationId, organizationType);
      const targetParent = parentPath || rootPath;
      const fullPath = `${targetParent}/${folderName}`;

      const response = await fetch("https://api.dropboxapi.com/2/files/create_folder_v2", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: fullPath, autorename: false }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("Create folder error:", error);
        throw new Error("Failed to create folder in Dropbox");
      }

      const data = await response.json();

      return new Response(
        JSON.stringify({
          success: true,
          folderPath: data.metadata?.path_display || fullPath,
          folderName: data.metadata?.name || folderName,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (action === "upload_file") {
      const { organizationId, organizationType, fileName, fileData, folderPath } = body;

      if (!fileName || !fileData || !folderPath) {
        throw new Error("fileName, fileData, and folderPath are required");
      }

      const accessToken = await getAccessToken(organizationId, organizationType);
      const fullPath = `${folderPath}/${fileName}`;

      const binaryData = Uint8Array.from(atob(fileData), (c) => c.charCodeAt(0));

      const response = await fetch("https://content.dropboxapi.com/2/files/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/octet-stream",
          "Dropbox-API-Arg": JSON.stringify({
            path: fullPath,
            mode: "add",
            autorename: true,
            mute: false,
          }),
        },
        body: binaryData,
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("Upload error:", error);
        throw new Error("Failed to upload file to Dropbox");
      }

      const fileInfo = await response.json();

      return new Response(
        JSON.stringify({
          success: true,
          fileId: fileInfo.id,
          fileName: fileInfo.name,
          path: fileInfo.path_display,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (action === "sync" || action === "list_folder") {
      const { organizationId, organizationType, folderPath: bodyFolderPath } = body;

      let folderPath = bodyFolderPath;
      if (!folderPath) {
        folderPath = await getRootFolderPath(organizationId, organizationType);
      }

      const accessToken = await getAccessToken(organizationId, organizationType);

      const response = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: folderPath,
          recursive: false,
          include_media_info: false,
          include_deleted: false,
          include_has_explicit_shared_members: false,
          include_mounted_folders: true,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("List folder error:", error);
        if (response.status === 401 || response.status === 403) {
          throw new Error("Dropbox access denied. Your token may have been revoked. Please reconnect Dropbox in Integrations.");
        }
        throw new Error(`Failed to list files from Dropbox: ${response.status}`);
      }

      const data = await response.json();
      const entries = data.entries || [];

      const files = entries.map((entry: any) => ({
        id: entry.id,
        name: entry.name,
        path: entry.path_display,
        isFolder: entry[".tag"] === "folder",
        mimeType: entry[".tag"] === "folder" ? "application/vnd.dropbox.folder" : getMimeType(entry.name),
        size: entry.size || 0,
        modifiedTime: entry.client_modified || entry.server_modified || null,
        createdTime: entry.server_modified || null,
      }));

      files.sort((a: any, b: any) => {
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;
        return a.name.localeCompare(b.name);
      });

      return new Response(
        JSON.stringify({ success: true, files, folderPath }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (action === "get_download_link") {
      const { organizationId, organizationType, filePath } = body;

      if (!filePath) {
        throw new Error("filePath is required");
      }

      const accessToken = await getAccessToken(organizationId, organizationType);

      const response = await fetch("https://api.dropboxapi.com/2/files/get_temporary_link", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: filePath }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("Get link error:", error);
        throw new Error("Failed to get download link from Dropbox");
      }

      const data = await response.json();

      return new Response(
        JSON.stringify({ success: true, link: data.link }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (action === "delete_file" || action === "delete_folder") {
      const { organizationId, organizationType, filePath, folderPath } = body;
      const pathToDelete = filePath || folderPath;

      if (!pathToDelete) {
        throw new Error("filePath or folderPath is required");
      }

      const accessToken = await getAccessToken(organizationId, organizationType);

      const response = await fetch("https://api.dropboxapi.com/2/files/delete_v2", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: pathToDelete }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("Delete error:", error);
        throw new Error("Failed to delete from Dropbox");
      }

      return new Response(
        JSON.stringify({ success: true, message: "Deleted from Dropbox" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (action === "rename_file") {
      const { organizationId, organizationType, filePath, newName } = body;

      if (!filePath || !newName) {
        throw new Error("filePath and newName are required");
      }

      const accessToken = await getAccessToken(organizationId, organizationType);
      const parentPath = filePath.substring(0, filePath.lastIndexOf("/"));
      const newPath = `${parentPath}/${newName}`;

      const response = await fetch("https://api.dropboxapi.com/2/files/move_v2", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from_path: filePath,
          to_path: newPath,
          autorename: false,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("Rename error:", error);
        throw new Error("Failed to rename in Dropbox");
      }

      const data = await response.json();
      return new Response(
        JSON.stringify({ success: true, file: data.metadata }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (action === "move_file") {
      const { organizationId, organizationType, filePath, targetFolderPath } = body;

      if (!filePath || !targetFolderPath) {
        throw new Error("filePath and targetFolderPath are required");
      }

      const accessToken = await getAccessToken(organizationId, organizationType);
      const fileName = filePath.substring(filePath.lastIndexOf("/") + 1);
      const newPath = `${targetFolderPath}/${fileName}`;

      const response = await fetch("https://api.dropboxapi.com/2/files/move_v2", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from_path: filePath,
          to_path: newPath,
          autorename: false,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("Move error:", error);
        throw new Error("Failed to move file in Dropbox");
      }

      const data = await response.json();
      return new Response(
        JSON.stringify({ success: true, file: data.metadata }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const mimeTypes: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
    zip: "application/zip",
    csv: "text/csv",
    txt: "text/plain",
    html: "text/html",
  };
  return mimeTypes[ext] || "application/octet-stream";
}
