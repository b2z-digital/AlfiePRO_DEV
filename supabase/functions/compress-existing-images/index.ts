import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "bmp",
  "tiff",
]);

const MAX_SIZE_BYTES = 800 * 1024;
const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isSuperAdmin = user.user_metadata?.is_super_admin === true;
    if (!isSuperAdmin) {
      const { data: roleCheck } = await supabase
        .from("user_clubs")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "super_admin")
        .maybeSingle();

      if (!roleCheck) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || "preview";
    const buckets: string[] = body.buckets || [
      "media",
      "event-media",
      "ad-banners",
      "boat-classes",
      "user-avatars",
      "avatars",
      "article-images",
    ];
    const maxFiles = body.maxFiles || 50;

    if (action === "preview") {
      const results = [];
      let totalOriginal = 0;
      let compressibleCount = 0;

      for (const bucket of buckets) {
        const { data: files, error: listError } = await supabase.storage
          .from(bucket)
          .list("", { limit: 500, sortBy: { column: "created_at", order: "desc" } });

        if (listError || !files) continue;

        const allFiles = await listAllFiles(supabase, bucket, "");
        let bucketOriginal = 0;
        let bucketCompressible = 0;

        for (const file of allFiles) {
          const ext = file.name.split(".").pop()?.toLowerCase() || "";
          if (!IMAGE_EXTENSIONS.has(ext)) continue;

          const size = file.metadata?.size || 0;
          bucketOriginal += size;

          if (size > MAX_SIZE_BYTES) {
            bucketCompressible++;
          }
        }

        totalOriginal += bucketOriginal;
        compressibleCount += bucketCompressible;

        results.push({
          bucket,
          totalImages: allFiles.filter((f) => {
            const ext = f.name.split(".").pop()?.toLowerCase() || "";
            return IMAGE_EXTENSIONS.has(ext);
          }).length,
          compressibleImages: bucketCompressible,
          totalSizeMB: (bucketOriginal / (1024 * 1024)).toFixed(2),
        });
      }

      return new Response(
        JSON.stringify({
          action: "preview",
          buckets: results,
          totalOriginalMB: (totalOriginal / (1024 * 1024)).toFixed(2),
          compressibleImages: compressibleCount,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "compress") {
      const results = [];
      let totalSaved = 0;
      let processedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;

      for (const bucket of buckets) {
        if (processedCount >= maxFiles) break;

        const allFiles = await listAllFiles(supabase, bucket, "");

        for (const file of allFiles) {
          if (processedCount >= maxFiles) break;

          const ext = file.name.split(".").pop()?.toLowerCase() || "";
          if (!IMAGE_EXTENSIONS.has(ext)) continue;

          const size = file.metadata?.size || 0;
          if (size <= MAX_SIZE_BYTES) {
            skippedCount++;
            continue;
          }

          try {
            const { data: fileData, error: downloadError } = await supabase
              .storage
              .from(bucket)
              .download(file.name);

            if (downloadError || !fileData) {
              errorCount++;
              continue;
            }

            const arrayBuffer = await fileData.arrayBuffer();
            const bitmap = await createImageBitmap(new Blob([arrayBuffer]));

            let width = bitmap.width;
            let height = bitmap.height;

            if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
              const ratio = Math.min(
                MAX_DIMENSION / width,
                MAX_DIMENSION / height
              );
              width = Math.round(width * ratio);
              height = Math.round(height * ratio);
            }

            const canvas = new OffscreenCanvas(width, height);
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              errorCount++;
              continue;
            }

            ctx.drawImage(bitmap, 0, 0, width, height);
            bitmap.close();

            const compressedBlob = await canvas.convertToBlob({
              type: "image/jpeg",
              quality: JPEG_QUALITY,
            });

            if (compressedBlob.size >= size) {
              skippedCount++;
              continue;
            }

            const newPath = ext === "jpg" || ext === "jpeg"
              ? file.name
              : file.name.replace(/\.[^.]+$/, ".jpg");

            const { error: uploadError } = await supabase.storage
              .from(bucket)
              .upload(newPath, compressedBlob, {
                contentType: "image/jpeg",
                cacheControl: "3600",
                upsert: true,
              });

            if (uploadError) {
              errorCount++;
              continue;
            }

            if (newPath !== file.name) {
              await supabase.storage.from(bucket).remove([file.name]);
            }

            const saved = size - compressedBlob.size;
            totalSaved += saved;
            processedCount++;

            results.push({
              bucket,
              file: file.name,
              originalKB: (size / 1024).toFixed(1),
              compressedKB: (compressedBlob.size / 1024).toFixed(1),
              savedKB: (saved / 1024).toFixed(1),
              reductionPercent: ((saved / size) * 100).toFixed(0),
            });
          } catch (err) {
            errorCount++;
          }
        }
      }

      return new Response(
        JSON.stringify({
          action: "compress",
          processed: processedCount,
          skipped: skippedCount,
          errors: errorCount,
          totalSavedMB: (totalSaved / (1024 * 1024)).toFixed(2),
          files: results,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        error: 'Invalid action. Use "preview" or "compress".',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

interface StorageFile {
  name: string;
  metadata?: { size?: number };
}

async function listAllFiles(
  supabase: any,
  bucket: string,
  prefix: string
): Promise<StorageFile[]> {
  const allFiles: StorageFile[] = [];

  const { data, error } = await supabase.storage
    .from(bucket)
    .list(prefix, { limit: 1000 });

  if (error || !data) return allFiles;

  for (const item of data) {
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name;

    if (item.id) {
      allFiles.push({ name: fullPath, metadata: item.metadata });
    } else {
      const nested = await listAllFiles(supabase, bucket, fullPath);
      allFiles.push(...nested);
    }
  }

  return allFiles;
}
