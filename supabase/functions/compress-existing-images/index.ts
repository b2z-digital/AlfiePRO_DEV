import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Image } from "npm:imagescript@1.3.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "bmp"]);
const SKIP_BUCKETS = new Set(["backups", "race-documents", "event-documents"]);

const MIN_SIZE_BYTES = 100 * 1024;
const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 80;

async function authenticateRequest(
  req: Request,
  supabase: any
): Promise<{ user: any } | { error: string; status: number }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { error: "Missing authorization", status: 401 };

  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) return { error: "Invalid token", status: 401 };

  const isSuperAdmin = user.user_metadata?.is_super_admin === true;
  if (!isSuperAdmin) {
    const { data: roleCheck } = await supabase
      .from("user_clubs")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleCheck) return { error: "Forbidden", status: 403 };
  }

  return { user };
}

interface StorageFile {
  name: string;
  metadata?: { size?: number; mimetype?: string };
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

async function getAllBucketNames(supabase: any): Promise<string[]> {
  const { data, error } = await supabase.storage.listBuckets();
  if (error || !data) return [];
  return data
    .map((b: any) => b.name)
    .filter((name: string) => !SKIP_BUCKETS.has(name));
}

function isCompressibleImage(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  return IMAGE_EXTENSIONS.has(ext);
}

async function compressImageBuffer(
  data: Uint8Array,
  _ext: string
): Promise<{ compressed: Uint8Array; width: number; height: number } | null> {
  try {
    let img = await Image.decode(data);

    const w = img.width;
    const h = img.height;

    if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
      const ratio = Math.min(MAX_DIMENSION / w, MAX_DIMENSION / h);
      const newW = Math.round(w * ratio);
      const newH = Math.round(h * ratio);
      img = img.resize(newW, newH);
    }

    const compressed = await img.encodeJPEG(JPEG_QUALITY);

    return {
      compressed: new Uint8Array(compressed),
      width: img.width,
      height: img.height,
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authResult = await authenticateRequest(req, supabase);
    if ("error" in authResult) {
      return new Response(JSON.stringify({ error: authResult.error }), {
        status: authResult.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || "preview";
    const maxFiles = body.maxFiles || 50;

    const buckets: string[] =
      body.buckets && body.buckets.length > 0
        ? body.buckets
        : await getAllBucketNames(supabase);

    if (action === "preview") {
      const results = [];
      let totalOriginal = 0;
      let compressibleCount = 0;

      for (const bucket of buckets) {
        try {
          const allFiles = await listAllFiles(supabase, bucket, "");
          let bucketOriginal = 0;
          let bucketCompressible = 0;
          let imageCount = 0;

          for (const file of allFiles) {
            if (!isCompressibleImage(file.name)) continue;
            imageCount++;
            const size = file.metadata?.size || 0;
            bucketOriginal += size;
            if (size > MIN_SIZE_BYTES) {
              bucketCompressible++;
            }
          }

          totalOriginal += bucketOriginal;
          compressibleCount += bucketCompressible;

          results.push({
            bucket,
            totalImages: imageCount,
            compressibleImages: bucketCompressible,
            totalSizeMB: (bucketOriginal / (1024 * 1024)).toFixed(2),
          });
        } catch {
          results.push({
            bucket,
            totalImages: 0,
            compressibleImages: 0,
            totalSizeMB: "0.00",
            error: "Could not list bucket",
          });
        }
      }

      return new Response(
        JSON.stringify({
          action: "preview",
          buckets: results,
          totalOriginalMB: (totalOriginal / (1024 * 1024)).toFixed(2),
          compressibleImages: compressibleCount,
          minSizeKB: Math.round(MIN_SIZE_BYTES / 1024),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "compress") {
      const fileResults: any[] = [];
      let totalSaved = 0;
      let totalOriginalBytes = 0;
      let processedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const bucket of buckets) {
        if (processedCount >= maxFiles) break;

        let allFiles: StorageFile[];
        try {
          allFiles = await listAllFiles(supabase, bucket, "");
        } catch {
          errors.push(`Failed to list ${bucket}`);
          continue;
        }

        for (const file of allFiles) {
          if (processedCount >= maxFiles) break;

          if (!isCompressibleImage(file.name)) continue;

          const size = file.metadata?.size || 0;
          if (size <= MIN_SIZE_BYTES) {
            skippedCount++;
            continue;
          }

          try {
            const { data: fileData, error: downloadError } =
              await supabase.storage.from(bucket).download(file.name);

            if (downloadError || !fileData) {
              errorCount++;
              errors.push(
                `Download failed: ${bucket}/${file.name}: ${downloadError?.message || "no data"}`
              );
              continue;
            }

            const arrayBuffer = await fileData.arrayBuffer();
            const uint8 = new Uint8Array(arrayBuffer);
            const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";

            const result = await compressImageBuffer(uint8, ext);
            if (!result) {
              errorCount++;
              errors.push(`Compress failed: ${bucket}/${file.name}`);
              continue;
            }

            if (result.compressed.byteLength >= size) {
              skippedCount++;
              continue;
            }

            const newPath =
              ext === "jpg" || ext === "jpeg"
                ? file.name
                : file.name.replace(/\.[^.]+$/, ".jpg");

            const blob = new Blob([result.compressed], {
              type: "image/jpeg",
            });

            const { error: uploadError } = await supabase.storage
              .from(bucket)
              .upload(newPath, blob, {
                contentType: "image/jpeg",
                cacheControl: "3600",
                upsert: true,
              });

            if (uploadError) {
              errorCount++;
              errors.push(
                `Upload failed: ${bucket}/${newPath}: ${uploadError.message}`
              );
              continue;
            }

            if (newPath !== file.name) {
              await supabase.storage.from(bucket).remove([file.name]);
            }

            const saved = size - result.compressed.byteLength;
            totalSaved += saved;
            totalOriginalBytes += size;
            processedCount++;

            fileResults.push({
              bucket,
              file: file.name,
              originalKB: (size / 1024).toFixed(1),
              compressedKB: (result.compressed.byteLength / 1024).toFixed(1),
              savedKB: (saved / 1024).toFixed(1),
              reductionPercent: ((saved / size) * 100).toFixed(0),
            });
          } catch (err: any) {
            errorCount++;
            errors.push(
              `Error: ${bucket}/${file.name}: ${err?.message || "unknown"}`
            );
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
          totalSavedKB: (totalSaved / 1024).toFixed(1),
          totalOriginalMB: (totalOriginalBytes / (1024 * 1024)).toFixed(2),
          avgReduction:
            totalOriginalBytes > 0
              ? ((totalSaved / totalOriginalBytes) * 100).toFixed(0)
              : "0",
          files: fileResults,
          errorDetails: errors.slice(0, 20),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        stack: error instanceof Error ? error.stack : undefined,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
