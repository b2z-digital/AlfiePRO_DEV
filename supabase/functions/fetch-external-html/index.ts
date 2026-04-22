import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return new Response(
        JSON.stringify({ error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid URL format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only allow http/https
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return new Response(
        JSON.stringify({ error: "Only HTTP/HTTPS URLs are supported" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": "AlfiePRO/1.0 (Event Results Importer)",
        "Accept": "text/html, application/xhtml+xml, */*",
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch URL: ${response.status} ${response.statusText}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Read as ArrayBuffer to handle UTF-16 encoded pages
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    let html: string;
    // Detect UTF-16 LE BOM (FF FE) or UTF-16 BE BOM (FE FF)
    if ((bytes[0] === 0xFF && bytes[1] === 0xFE) || (bytes[0] === 0xFE && bytes[1] === 0xFF)) {
      const encoding = bytes[0] === 0xFF ? "utf-16le" : "utf-16be";
      html = new TextDecoder(encoding).decode(buffer);
    } else {
      // Check for null bytes indicating UTF-16 without BOM
      const hasNullBytes = bytes.length > 4 && (bytes[1] === 0 || bytes[0] === 0);
      if (hasNullBytes) {
        const encoding = bytes[0] === 0 ? "utf-16be" : "utf-16le";
        html = new TextDecoder(encoding).decode(buffer);
      } else {
        html = new TextDecoder("utf-8").decode(buffer);
      }
    }

    return new Response(
      JSON.stringify({ html }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
