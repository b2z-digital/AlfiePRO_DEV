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

// New ARYA site (Nov 2026): /rankings?class=<id>&page=<n>, 15 sailors a page, with every sailor's
// figures in a data-ranking-details JSON attribute. The old index.php / rankings-<class> pages are gone.
const ARYA_ORIGIN = "https://radiosailing.org.au";
const ARYA_CLASSES: Array<{ id: number; name: string; match: RegExp }> = [
  { id: 1, name: "IOM", match: /\biom\b|one.?metre/i },
  { id: 2, name: "10R", match: /10.?r(ater)?\b|ten.?rater/i },
  { id: 3, name: "A Class", match: /\ba.?class\b|aclass/i },
  { id: 4, name: "Marblehead", match: /marblehead|\brm\b/i },
  { id: 8, name: "DF65", match: /df.?65/i },
  { id: 9, name: "RC Laser", match: /rc.?laser|\brcl\b/i },
  { id: 10, name: "DF95", match: /df.?95/i },
];

function aryaClass(url: string, yachtClassName: string): { id: number; name: string } | null {
  const fromUrl = url.match(/[?&]class=(\d+)/);
  if (fromUrl) {
    const hit = ARYA_CLASSES.find((c) => c.id === Number(fromUrl[1]));
    if (hit) return hit;
  }
  // old addresses such as index.php?arcade=iom-ranking or /rankings-df95
  const slug = (url.match(/arcade=([\w-]+)/)?.[1] || url.match(/rankings-([\w-]+)/)?.[1] || "").replace(/-?ranking$/, "");
  return ARYA_CLASSES.find((c) => slug && c.match.test(slug.replace(/-/g, " ")))
    || ARYA_CLASSES.find((c) => c.match.test(yachtClassName || ""))
    || null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

function parseAryaRankingPage(html: string): RankingEntry[] {
  const attr = html.match(/data-ranking-details=["']([^"']*)["']/);
  if (!attr) return [];
  let data: Record<string, { rank?: number | string; name?: string; club?: string; sail?: string; score?: number | string; events?: number | string }> = {};
  try { data = JSON.parse(decodeEntities(attr[1])); } catch { return []; }
  return Object.values(data)
    .map((d) => ({
      rank: Number(d.rank),
      name: String(d.name || "").trim(),
      // stored as the number alone, as before ("AUS 74" -> "74")
      sailNumber: String(d.sail || "").replace(/^[A-Z]{2,3}\s+/, "").trim() || undefined,
      state: String(d.club || "").trim() || undefined,
      points: d.score !== undefined && d.score !== "" ? Number(d.score) : undefined,
      events: d.events !== undefined && d.events !== "" ? Number(d.events) : undefined,
    }))
    .filter((r) => r.name && Number.isFinite(r.rank));
}

async function fetchAryaRankings(classId: number): Promise<RankingEntry[]> {
  const byKey = new Map<string, RankingEntry>();
  let total = Infinity;
  for (let page = 1; page <= 40 && byKey.size < total; page++) {
    const res = await fetch(`${ARYA_ORIGIN}/rankings?class=${classId}&page=${page}`, {
      headers: { "User-Agent": "Mozilla/5.0 AlfiePRO-Rankings/1.0", Accept: "text/html" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) break;
    const html = await res.text();
    const count = html.match(/(\d+)\s+ranked sailors/i);
    if (count) total = Number(count[1]);
    const entries = parseAryaRankingPage(html);
    const before = byKey.size;
    for (const e of entries) byKey.set(`${e.rank}|${e.name}`, e);
    if (byKey.size === before) break; // past the last page
    await new Promise((r) => setTimeout(r, 300));
  }
  return [...byKey.values()].sort((a, b) => a.rank - b.rank);
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

    const body = await req.json();
    let url: string = String(body.url || "");
    let yachtClassName: string = String(body.yachtClassName || "");
    const nationalAssociationId = body.nationalAssociationId;

    let host = "";
    try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* invalid */ }
    // Only the national association's own rankings site is fetched
    if (host !== "radiosailing.org.au") throw new Error("Rankings can only be imported from radiosailing.org.au");

    const cls = aryaClass(url, yachtClassName);
    let rankings: RankingEntry[] = [];
    if (cls) {
      url = `${ARYA_ORIGIN}/rankings?class=${cls.id}`;
      yachtClassName = cls.name; // one name per class, whichever screen or job asked
      console.log(`Scraping rankings from: ${url} for ${yachtClassName}`);
      rankings = await fetchAryaRankings(cls.id);
    }
    if (!rankings.length) {
      const response = await fetch(url);
      rankings = parseRankingsFromHTML(await response.text());
    }

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
