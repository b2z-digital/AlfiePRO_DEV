import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RankingEntry {
  rank: number;
  name: string;
  sailNumber?: string;
  state?: string;
  points?: number;
  events?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get auth token from request (optional for cron jobs)
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    let isCronJob = false;

    if (authHeader) {
      // Verify user is authenticated
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        throw new Error("Unauthorized");
      }
      userId = user.id;
    } else {
      // Check if this is a cron job call (has special header or comes from internal)
      const cronSecret = req.headers.get("X-Cron-Secret");
      const expectedSecret = Deno.env.get("CRON_SECRET") || "internal-cron-job";

      if (cronSecret === expectedSecret) {
        isCronJob = true;
        userId = null; // System-initiated
      } else {
        throw new Error("No authorization header");
      }
    }

    const { url, yachtClassName, nationalAssociationId } = await req.json();

    console.log(`Scraping rankings from: ${url} for ${yachtClassName}`);

    // Fetch the HTML page
    const response = await fetch(url);
    const html = await response.text();

    // Parse the HTML to extract rankings
    const rankings = parseRankingsFromHTML(html);

    console.log(`Found ${rankings.length} rankings`);

    if (rankings.length === 0) {
      // Log failed sync
      await supabase.from("ranking_sync_logs").insert({
        national_association_id: nationalAssociationId,
        yacht_class_name: yachtClassName,
        source_url: url,
        status: "failed",
        rankings_imported: 0,
        error_message: "No rankings found in HTML",
        initiated_by: userId,
      });

      return new Response(
        JSON.stringify({
          success: false,
          message: "No rankings found in the page",
          rankings: []
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Delete existing rankings for this class
    await supabase
      .from("national_rankings")
      .delete()
      .eq("national_association_id", nationalAssociationId)
      .eq("yacht_class_name", yachtClassName);

    // Insert new rankings
    const rankingsToInsert = rankings.map((r) => ({
      national_association_id: nationalAssociationId,
      yacht_class_name: yachtClassName,
      rank: r.rank,
      skipper_name: r.name,
      sail_number: r.sailNumber,
      state: r.state,
      points: r.points,
      events_counted: r.events,
      source_url: url,
      last_updated: new Date().toISOString(),
    }));

    const { error: insertError } = await supabase
      .from("national_rankings")
      .insert(rankingsToInsert);

    if (insertError) {
      console.error("Insert error:", insertError);

      // Log failed sync
      await supabase.from("ranking_sync_logs").insert({
        national_association_id: nationalAssociationId,
        yacht_class_name: yachtClassName,
        source_url: url,
        status: "failed",
        rankings_imported: 0,
        error_message: insertError.message,
        initiated_by: userId,
      });

      throw insertError;
    }

    // Log successful sync
    await supabase.from("ranking_sync_logs").insert({
      national_association_id: nationalAssociationId,
      yacht_class_name: yachtClassName,
      source_url: url,
      status: "success",
      rankings_imported: rankings.length,
      initiated_by: userId,
    });

    return new Response(
      JSON.stringify({
        success: true,
        rankingsImported: rankings.length,
        rankings: rankings
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

function parseRankingsFromHTML(html: string): RankingEntry[] {
  const rankings: RankingEntry[] = [];

  // Find the table - it's typically in a structure like:
  // <table>...<tbody>...<tr>...</tr>...</tbody></table>

  // Extract table rows using regex (more reliable than full DOM parsing)
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  const tableMatch = tableRegex.exec(html);

  if (!tableMatch) {
    console.log("No table found");
    return rankings;
  }

  const tableContent = tableMatch[1];

  // Find all table rows
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const rows: string[] = [];
  let rowMatch;

  while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
    rows.push(rowMatch[1]);
  }

  console.log(`Found ${rows.length} rows`);

  // Skip header row(s) and parse data rows
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Extract cells
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    const cells: string[] = [];
    let cellMatch;

    while ((cellMatch = cellRegex.exec(row)) !== null) {
      // Clean HTML tags and get text content
      const cellText = cellMatch[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .trim();
      cells.push(cellText);
    }

    // Skip if not enough cells or if it's a header row
    if (cells.length < 3) continue;

    // Check if first cell is a number (rank)
    const rank = parseInt(cells[0]);
    if (isNaN(rank)) continue;

    // Parse the row
    // Expected columns: RANK, NAME, SAIL NO, STATE, POINTS, EVENTS, ...
    const entry: RankingEntry = {
      rank: rank,
      name: cells[1] || "",
      sailNumber: cells[2] || undefined,
      state: cells[3] || undefined,
      points: cells[4] ? parseFloat(cells[4]) : undefined,
      events: cells[5] ? parseInt(cells[5]) : undefined,
    };

    // Only add if we have a name
    if (entry.name) {
      rankings.push(entry);
    }
  }

  return rankings;
}
