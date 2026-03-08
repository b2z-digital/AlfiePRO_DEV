import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;

function splitTextIntoChunks(text: string): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\s*\n/);
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    if (currentChunk.length + trimmed.length + 2 > CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      const overlap = currentChunk.slice(-CHUNK_OVERLAP);
      currentChunk = overlap + "\n\n" + trimmed;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + trimmed;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  if (chunks.length === 0 && text.trim()) {
    for (let i = 0; i < text.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
      chunks.push(text.slice(i, i + CHUNK_SIZE).trim());
    }
  }

  return chunks.filter((c) => c.length > 50);
}

function extractTextFromBinaryPdf(pdfBytes: Uint8Array): string {
  const decoder = new TextDecoder("latin1");
  const raw = decoder.decode(pdfBytes);

  const textSegments: string[] = [];
  const streamPattern = /stream\s*\n([\s\S]*?)endstream/g;
  let match;

  while ((match = streamPattern.exec(raw)) !== null) {
    const content = match[1];
    const textMatches = content.match(/\(([^)]+)\)/g);
    if (textMatches) {
      const line = textMatches.map((t) => t.slice(1, -1)).join(" ");
      if (line.trim().length > 2) {
        textSegments.push(line.trim());
      }
    }

    const hexMatches = content.match(/<([0-9a-fA-F]+)>/g);
    if (hexMatches) {
      for (const hex of hexMatches) {
        const hexStr = hex.slice(1, -1);
        if (hexStr.length > 4) {
          let decoded = "";
          for (let i = 0; i < hexStr.length; i += 2) {
            const charCode = parseInt(hexStr.substr(i, 2), 16);
            if (charCode >= 32 && charCode <= 126) {
              decoded += String.fromCharCode(charCode);
            }
          }
          if (decoded.trim().length > 2) {
            textSegments.push(decoded.trim());
          }
        }
      }
    }
  }

  return textSegments.join("\n\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const body = await req.json();
    const { guideId } = body;

    if (!guideId) {
      return new Response(
        JSON.stringify({ error: "guideId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: guide, error: guideError } = await supabase
      .from("alfie_tuning_guides")
      .select("*")
      .eq("id", guideId)
      .single();

    if (guideError || !guide) {
      return new Response(
        JSON.stringify({ error: "Guide not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase
      .from("alfie_tuning_guides")
      .update({ status: "processing" })
      .eq("id", guideId);

    const { data: fileData, error: downloadError } = await supabase.storage
      .from("alfie-knowledge")
      .download(guide.storage_path);

    if (downloadError || !fileData) {
      await supabase
        .from("alfie_tuning_guides")
        .update({
          status: "failed",
          processing_error: `Download failed: ${downloadError?.message || "No file data"}`,
        })
        .eq("id", guideId);

      return new Response(
        JSON.stringify({ error: "Failed to download file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const pdfBytes = new Uint8Array(arrayBuffer);
    let extractedText = extractTextFromBinaryPdf(pdfBytes);

    if (extractedText.trim().length < 100) {
      extractedText = `Tuning guide for ${guide.boat_type || "RC yacht"}: ${guide.name}. ` +
        `Version ${guide.version}. ${guide.description || ""}`;
    }

    const chunks = splitTextIntoChunks(extractedText);

    await supabase
      .from("alfie_knowledge_chunks")
      .delete()
      .eq("tuning_guide_id", guideId);

    const { data: existingDoc } = await supabase
      .from("alfie_knowledge_documents")
      .select("id")
      .eq("title", guide.name)
      .eq("storage_path", guide.storage_path)
      .maybeSingle();

    let documentId: string;

    if (existingDoc) {
      documentId = existingDoc.id;
      await supabase
        .from("alfie_knowledge_documents")
        .update({
          category: "tuning-guide",
          chunk_count: chunks.length,
          processing_status: "completed",
          processed_at: new Date().toISOString(),
        })
        .eq("id", documentId);
    } else {
      const { data: newDoc, error: docError } = await supabase
        .from("alfie_knowledge_documents")
        .insert({
          title: guide.name,
          category: "tuning-guide",
          storage_path: guide.storage_path,
          file_name: guide.file_name,
          file_size: guide.file_size,
          mime_type: "application/pdf",
          chunk_count: chunks.length,
          processing_status: "completed",
          processed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (docError) {
        throw new Error(`Failed to create document record: ${docError.message}`);
      }
      documentId = newDoc.id;
    }

    const chunkRecords = chunks.map((content, index) => ({
      document_id: documentId,
      chunk_index: index,
      content,
      metadata: {
        boat_type: guide.boat_type || "",
        hull_type: guide.hull_type || "",
        guide_name: guide.name,
        version: guide.version,
        source_type: "tuning-guide",
      },
      boat_type: guide.boat_type || "",
      hull_type: guide.hull_type || "",
      source_type: "tuning-guide",
      tuning_guide_id: guideId,
    }));

    const batchSize = 50;
    for (let i = 0; i < chunkRecords.length; i += batchSize) {
      const batch = chunkRecords.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from("alfie_knowledge_chunks")
        .insert(batch);

      if (insertError) {
        console.error(`Chunk insert error (batch ${i}):`, insertError);
      }
    }

    await supabase
      .from("alfie_tuning_guides")
      .update({
        status: "completed",
        chunk_count: chunks.length,
        image_count: 0,
        processed_at: new Date().toISOString(),
        processing_error: null,
      })
      .eq("id", guideId);

    return new Response(
      JSON.stringify({
        success: true,
        guideId,
        chunksCreated: chunks.length,
        textLength: extractedText.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Process error:", error);

    try {
      const body = await req.clone().json().catch(() => ({}));
      if (body.guideId) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        await supabase
          .from("alfie_tuning_guides")
          .update({
            status: "failed",
            processing_error: error.message || "Unknown error",
          })
          .eq("id", body.guideId);
      }
    } catch (_) {}

    return new Response(
      JSON.stringify({ error: error.message || "Processing failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
