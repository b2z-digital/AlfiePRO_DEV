import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { inflateSync, inflateRawSync } from "node:zlib";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;
const MAX_STREAM_SIZE = 500000;

function sanitizeText(text: string): string {
  // deno-lint-ignore no-control-regex
  let clean = text.replace(/\x00/g, "");
  clean = clean.replace(/\\u[0-9a-fA-F]{0,3}(?![0-9a-fA-F])/g, "");
  clean = clean.replace(/\\u[dD][89abAB][0-9a-fA-F]{2}/g, "");
  // deno-lint-ignore no-control-regex
  clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  return clean;
}

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

function inflateStream(compressedData: Uint8Array): Uint8Array | null {
  try {
    return new Uint8Array(inflateSync(Buffer.from(compressedData)));
  } catch {
    try {
      return new Uint8Array(inflateRawSync(Buffer.from(compressedData)));
    } catch {
      return null;
    }
  }
}

function extractTextOperators(content: string): string[] {
  const segments: string[] = [];
  const len = content.length;
  let i = 0;

  while (i < len) {
    if (content[i] === "(") {
      let depth = 1;
      let j = i + 1;
      while (j < len && depth > 0) {
        if (content[j] === "\\") {
          j += 2;
          continue;
        }
        if (content[j] === "(") depth++;
        if (content[j] === ")") depth--;
        j++;
      }
      const inner = content.substring(i + 1, j - 1)
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")")
        .replace(/\\\\/g, "\\");
      if (inner.trim().length > 0) {
        segments.push(inner);
      }
      i = j;
    } else if (content[i] === "<" && i + 1 < len && content[i + 1] !== "<") {
      const closeIdx = content.indexOf(">", i + 1);
      if (closeIdx > i && closeIdx - i < 10002) {
        const hexStr = content.substring(i + 1, closeIdx);
        if (/^[0-9a-fA-F]+$/.test(hexStr) && hexStr.length > 4) {
          let decoded = "";
          for (let h = 0; h < hexStr.length; h += 2) {
            const charCode = parseInt(hexStr.substr(h, 2), 16);
            if (charCode >= 32 && charCode <= 126) {
              decoded += String.fromCharCode(charCode);
            }
          }
          if (decoded.trim().length > 1) {
            segments.push(decoded.trim());
          }
        }
        i = closeIdx + 1;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }

  return segments;
}

function extractTextFromPdf(pdfBytes: Uint8Array): string {
  const decoder = new TextDecoder("latin1");
  const raw = decoder.decode(pdfBytes);
  console.log(`PDF raw size: ${raw.length} chars`);

  const allTextSegments: string[] = [];
  const maxSegments = 10000;
  let streamsProcessed = 0;
  let flateStreams = 0;
  let decompressedStreams = 0;

  const streamEntries: { isFlate: boolean; bytes: Uint8Array | null; rawStr: string }[] = [];

  let searchPos = 0;
  while (streamEntries.length < 500) {
    const sIdx = raw.indexOf("stream", searchPos);
    if (sIdx === -1) break;

    if (sIdx > 0 && /[a-zA-Z]/.test(raw[sIdx - 1])) {
      searchPos = sIdx + 6;
      continue;
    }

    let streamContentStart = sIdx + 6;
    if (raw[streamContentStart] === "\r") streamContentStart++;
    if (raw[streamContentStart] === "\n") streamContentStart++;

    const eIdx = raw.indexOf("endstream", streamContentStart);
    if (eIdx === -1) break;
    searchPos = eIdx + 9;
    streamsProcessed++;

    const streamLength = eIdx - streamContentStart;
    if (streamLength > MAX_STREAM_SIZE || streamLength <= 0) continue;

    const lookbackStart = Math.max(0, sIdx - 500);
    const objDict = raw.substring(lookbackStart, sIdx);
    const isFlate = objDict.includes("/FlateDecode");
    const streamRaw = raw.substring(streamContentStart, eIdx);

    if (isFlate) {
      flateStreams++;
      const streamBytes = new Uint8Array(streamRaw.length);
      for (let k = 0; k < streamRaw.length; k++) {
        streamBytes[k] = streamRaw.charCodeAt(k);
      }
      streamEntries.push({ isFlate: true, bytes: streamBytes, rawStr: "" });
    } else {
      streamEntries.push({ isFlate: false, bytes: null, rawStr: streamRaw });
    }
  }

  for (const entry of streamEntries) {
    if (allTextSegments.length >= maxSegments) break;

    if (entry.isFlate && entry.bytes) {
      const decompressed = inflateStream(entry.bytes);
      if (decompressed) {
        decompressedStreams++;
        const textDecoder = new TextDecoder("latin1");
        const decompressedStr = textDecoder.decode(decompressed);
        const segments = extractTextOperators(decompressedStr);
        for (const seg of segments) {
          if (allTextSegments.length >= maxSegments) break;
          allTextSegments.push(seg);
        }
      }
    } else if (!entry.isFlate) {
      const segments = extractTextOperators(entry.rawStr);
      for (const seg of segments) {
        if (allTextSegments.length >= maxSegments) break;
        allTextSegments.push(seg);
      }
    }
  }

  console.log(`Streams: ${streamsProcessed}, Flate: ${flateStreams}, Decompressed: ${decompressedStreams}, Segments: ${allTextSegments.length}`);

  const lines: string[] = [];
  let currentLine = "";

  for (const seg of allTextSegments) {
    if (seg === "\n" || seg === "\r\n" || seg === "\r") {
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
      }
      currentLine = "";
    } else {
      currentLine += seg;
    }
  }
  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }

  const cleanedLines = lines.filter(
    (line) => line.length > 1 && !/^[\x00-\x1F\x7F-\xFF]+$/.test(line)
  );

  return sanitizeText(cleanedLines.join("\n\n"));
}

async function downloadFromStorage(storagePath: string): Promise<Uint8Array> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  const url = `${supabaseUrl}/storage/v1/object/alfie-knowledge/${encodedPath}`;
  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${serviceKey}`,
      "apikey": serviceKey,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Storage download HTTP ${res.status}: ${body}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

function createServiceClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${supabaseServiceKey}` } },
  });
}

async function processGuide(supabase: any, guideId: string) {
  const { data: guide, error: guideError } = await supabase
    .from("alfie_tuning_guides")
    .select("*")
    .eq("id", guideId)
    .single();

  if (guideError || !guide) throw new Error("Guide not found");

  await supabase.from("alfie_tuning_guides").update({ status: "processing" }).eq("id", guideId);

  const pdfBytes = await downloadFromStorage(guide.storage_path);
  console.log(`Downloaded ${pdfBytes.length} bytes for guide ${guideId}`);

  let extractedText = extractTextFromPdf(pdfBytes);
  console.log(`Extracted ${extractedText.length} chars of text`);

  if (extractedText.trim().length < 100) {
    extractedText = `Tuning guide for ${guide.boat_type || "RC yacht"}: ${guide.name}. ` +
      `Version ${guide.version}. ${guide.description || ""}`;
  }

  const chunks = splitTextIntoChunks(extractedText);
  console.log(`Created ${chunks.length} chunks`);

  await supabase.from("alfie_knowledge_chunks").delete().eq("tuning_guide_id", guideId);

  const { data: existingDoc } = await supabase
    .from("alfie_knowledge_documents")
    .select("id")
    .eq("title", guide.name)
    .eq("storage_path", guide.storage_path)
    .maybeSingle();

  let documentId: string;

  if (existingDoc) {
    documentId = existingDoc.id;
    await supabase.from("alfie_knowledge_documents").update({
      category: "tuning-guide",
      chunk_count: chunks.length,
      processing_status: "completed",
      processed_at: new Date().toISOString(),
    }).eq("id", documentId);
  } else {
    const { data: newDoc, error: docError } = await supabase
      .from("alfie_knowledge_documents")
      .insert({
        title: guide.name, category: "tuning-guide", storage_path: guide.storage_path,
        file_name: guide.file_name, file_size: guide.file_size, mime_type: "application/pdf",
        chunk_count: chunks.length, processing_status: "completed", processed_at: new Date().toISOString(),
      })
      .select().single();
    if (docError) throw new Error(`Failed to create document record: ${docError.message}`);
    documentId = newDoc.id;
  }

  const chunkRecords = chunks.map((content, index) => ({
    document_id: documentId, chunk_index: index, content: sanitizeText(content),
    metadata: { boat_type: guide.boat_type || "", hull_type: guide.hull_type || "", guide_name: guide.name, version: guide.version, source_type: "tuning-guide" },
    boat_type: guide.boat_type || "", hull_type: guide.hull_type || "", source_type: "tuning-guide", tuning_guide_id: guideId,
  }));

  let insertedCount = 0;
  const batchSize = 50;
  for (let i = 0; i < chunkRecords.length; i += batchSize) {
    const batch = chunkRecords.slice(i, i + batchSize);
    const { data: inserted, error: insertError } = await supabase.from("alfie_knowledge_chunks").insert(batch).select("id");
    if (insertError) {
      console.error(`Chunk insert error (batch ${i}):`, JSON.stringify(insertError));
      throw new Error(`Failed to insert chunks batch ${i}: ${insertError.message}`);
    }
    insertedCount += (inserted?.length || 0);
  }
  console.log(`Actually inserted ${insertedCount} chunks for guide ${guideId}`);

  const { error: updateError } = await supabase.from("alfie_tuning_guides").update({
    status: "completed", chunk_count: chunks.length, image_count: 0,
    processed_at: new Date().toISOString(), processing_error: null,
  }).eq("id", guideId);
  if (updateError) console.error("Guide status update error:", JSON.stringify(updateError));

  return { chunksCreated: chunks.length, insertedCount, textLength: extractedText.length };
}

async function processDocument(supabase: any, documentId: string) {
  const { data: doc, error: docError } = await supabase
    .from("alfie_knowledge_documents")
    .select("*")
    .eq("id", documentId)
    .single();

  if (docError || !doc) throw new Error("Document not found");

  await supabase.from("alfie_knowledge_documents").update({ processing_status: "processing" }).eq("id", documentId);

  if (!doc.storage_path) {
    await supabase.from("alfie_knowledge_documents").update({
      processing_status: "failed", processing_error: "No file attached to this document",
    }).eq("id", documentId);
    throw new Error("No file attached to this document");
  }

  const pdfBytes = await downloadFromStorage(doc.storage_path);
  console.log(`Downloaded ${pdfBytes.length} bytes for document ${documentId}`);

  let extractedText = extractTextFromPdf(pdfBytes);
  console.log(`Extracted ${extractedText.length} chars of text`);

  if (extractedText.trim().length < 100) {
    extractedText = `${doc.title}: ${doc.category || "sailing rules document"}. ` + (doc.content_text || "");
  }

  const chunks = splitTextIntoChunks(extractedText);
  console.log(`Created ${chunks.length} chunks`);

  await supabase.from("alfie_knowledge_chunks").delete().eq("document_id", documentId);

  const chunkRecords = chunks.map((content, index) => ({
    document_id: documentId, chunk_index: index, content: sanitizeText(content),
    metadata: { document_title: doc.title, category: doc.category, source_type: "sailing-rules" },
    source_type: "sailing-rules",
  }));

  let insertedCount = 0;
  const batchSize = 50;
  for (let i = 0; i < chunkRecords.length; i += batchSize) {
    const batch = chunkRecords.slice(i, i + batchSize);
    const { data: inserted, error: insertError } = await supabase.from("alfie_knowledge_chunks").insert(batch).select("id");
    if (insertError) {
      console.error(`Chunk insert error (batch ${i}):`, JSON.stringify(insertError));
      throw new Error(`Failed to insert chunks batch ${i}: ${insertError.message}`);
    }
    insertedCount += (inserted?.length || 0);
  }
  console.log(`Actually inserted ${insertedCount} chunks for document ${documentId}`);

  const { error: updateError } = await supabase.from("alfie_knowledge_documents").update({
    processing_status: "completed", chunk_count: chunks.length,
    processed_at: new Date().toISOString(), processing_error: null,
    content_text: extractedText.slice(0, 5000),
  }).eq("id", documentId);
  if (updateError) console.error("Document status update error:", JSON.stringify(updateError));

  return { chunksCreated: chunks.length, insertedCount, textLength: extractedText.length };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  let parsedBody: any = null;

  try {
    const supabase = createServiceClient();
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      if (token !== supabaseServiceKey) {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
          return new Response(
            JSON.stringify({ error: "Unauthorized" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    parsedBody = await req.json();
    const { guideId, documentId } = parsedBody;

    if (!guideId && !documentId) {
      return new Response(
        JSON.stringify({ error: "guideId or documentId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result;
    if (guideId) {
      result = await processGuide(supabase, guideId);
      return new Response(JSON.stringify({ success: true, guideId, ...result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } else {
      result = await processDocument(supabase, documentId);
      return new Response(JSON.stringify({ success: true, documentId, ...result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (error: any) {
    console.error("Process error:", error);

    try {
      const supabase = createServiceClient();
      if (parsedBody?.guideId) {
        await supabase.from("alfie_tuning_guides").update({ status: "failed", processing_error: error.message || "Unknown error" }).eq("id", parsedBody.guideId);
      }
      if (parsedBody?.documentId) {
        await supabase.from("alfie_knowledge_documents").update({ processing_status: "failed", processing_error: error.message || "Unknown error" }).eq("id", parsedBody.documentId);
      }
    } catch (cleanupErr) {
      console.error("Failed to update error status:", cleanupErr);
    }

    return new Response(
      JSON.stringify({ error: error.message || "Processing failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
