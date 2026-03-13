import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ─── Boat class keyword map ───────────────────────────────────────────────────
// Maps common phrases found in source pages to normalised AlfiePRO class names
const BOAT_CLASS_KEYWORDS: Record<string, string> = {
  "international ten rater": "10R",
  "ten rater": "10R",
  "10 rater": "10R",
  "10r": "10R",
  "marblehead": "Marblehead",
  "m class": "Marblehead",
  "one metre": "1M",
  "1 metre": "1M",
  "1m": "1M",
  "a class": "A Class",
  "ec12": "EC12",
  "e-class": "E Class",
  "e class": "E Class",
  "footy": "Footy",
  "df65": "DF65",
  "df 65": "DF65",
  "df95": "DF95",
  "df 95": "DF95",
  "us1m": "US1M",
  "u.s.one metre": "US1M",
  "victoria": "Victoria",
  "r/c laser": "RC Laser",
  "rc laser": "RC Laser",
};

function detectBoatClass(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [keyword, mapped] of Object.entries(BOAT_CLASS_KEYWORDS)) {
    if (lower.includes(keyword)) return mapped;
  }
  return null;
}

// ─── HTML Parsing helpers ─────────────────────────────────────────────────────

function extractText(html: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, "is");
  const m = html.match(re);
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : "";
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#\d+;/g, "").trim();
}

function extractAllMatches(html: string, pattern: RegExp): RegExpMatchArray[] {
  const results: RegExpMatchArray[] = [];
  let m: RegExpMatchArray | null;
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  while ((m = re.exec(html)) !== null) results.push(m);
  return results;
}

// ─── Parse a single event results page ───────────────────────────────────────

interface ParsedResult {
  position: number | null;
  name: string;
  club: string;
  sailNo: string;
  boatDesign: string;
  nett: number | null;
  total: number | null;
  races: (string | null)[];
  isDiscard: boolean[];
}

interface ParsedEvent {
  eventName: string;
  venue: string;
  eventDate: string | null;
  eventEndDate: string | null;
  boatClassRaw: string;
  boatClassMapped: string | null;
  raceCount: number;
  competitors: ParsedResult[];
}

function parseEventPage(html: string): ParsedEvent | null {
  try {
    // Extract event name from <title> or <h1>/<h2>
    let eventName =
      extractText(html, "h1") ||
      extractText(html, "h2") ||
      extractText(html, "title") ||
      "Unknown Event";
    eventName = eventName.replace(/\s+/g, " ").trim();

    // Extract boat class from page text
    const boatClassRaw = (() => {
      // Look for class mentions near the header area
      const headerArea = html.slice(0, 3000);
      const classMatch =
        headerArea.match(/class[:\s]+([A-Za-z0-9\s\-\/]+?)(?:\s*<|\s*\n|\s*,)/i) ||
        headerArea.match(/(international ten rater|marblehead|one metre|footy|df65|df95|a class|e class|rc laser|victoria|ec12|1 metre)/i);
      if (classMatch) return classMatch[1].trim();
      // Fallback: detect from event name
      return detectBoatClass(eventName) ? eventName : "";
    })();
    const boatClassMapped = detectBoatClass(boatClassRaw || eventName);

    // Extract venue/location - look for common patterns
    const venueMatch = html.match(/(?:venue|location|held at|at\s+):\s*([^<\n,]+)/i) ||
                       html.match(/<td[^>]*>\s*(?:Venue|Location)\s*<\/td>\s*<td[^>]*>\s*([^<]+)/i);
    const venue = venueMatch ? stripTags(venueMatch[1]).trim() : "";

    // Extract date - look for common date patterns
    const dateMatch = html.match(/(\d{1,2}[-\/\s]\w+[-\/\s]\d{4}|\d{4}-\d{2}-\d{2}|\w+\s+\d{1,2}[-,\s]+\d{4})/);
    let eventDate: string | null = null;
    let eventEndDate: string | null = null;
    if (dateMatch) {
      const raw = dateMatch[1];
      // Try to parse a date range like "04-07 Mar 2026"
      const rangeMatch = html.match(/(\d{1,2})[-–](\d{1,2})\s+(\w+)\s+(\d{4})/);
      if (rangeMatch) {
        const [, d1, d2, mon, yr] = rangeMatch;
        eventDate = new Date(`${d1} ${mon} ${yr}`).toISOString().slice(0, 10);
        eventEndDate = new Date(`${d2} ${mon} ${yr}`).toISOString().slice(0, 10);
      } else {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) eventDate = d.toISOString().slice(0, 10);
      }
    }

    // ── Parse the results table ──────────────────────────────────────────────
    // Find the main results table (largest table or one with "Pos" header)
    const tableMatches = extractAllMatches(html, /<table[^>]*>([\s\S]*?)<\/table>/i);
    if (!tableMatches.length) return null;

    // Pick the table with most rows (most likely the results table)
    let bestTable = "";
    let bestRowCount = 0;
    for (const tm of tableMatches) {
      const rows = extractAllMatches(tm[1], /<tr[\s\S]*?<\/tr>/i).length;
      if (rows > bestRowCount) { bestRowCount = rows; bestTable = tm[1]; }
    }
    if (!bestTable) return null;

    // Extract headers from <th> tags
    const headerRow = bestTable.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i)?.[1] || "";
    const headers = extractAllMatches(headerRow, /<th[^>]*>([\s\S]*?)<\/th>/i)
      .map(m => stripTags(m[1]).trim().toUpperCase());

    if (!headers.length) return null;

    // Map header positions
    const posIdx = headers.findIndex(h => h === "POS" || h === "POSITION" || h === "#");
    const nameIdx = headers.findIndex(h => h.includes("NAME") || h.includes("SKIPPER") || h.includes("COMPETITOR"));
    const clubIdx = headers.findIndex(h => h.includes("CLUB"));
    const sailIdx = headers.findIndex(h => h.includes("SAIL") || h.includes("SAIL NO"));
    const designIdx = headers.findIndex(h => h.includes("DESIGN") || h.includes("BOAT") || h.includes("CLASS"));
    const nettIdx = headers.findIndex(h => h === "NETT" || h === "NET" || h === "PTS");
    const totalIdx = headers.findIndex(h => h === "TOTAL" || h === "GROSS");
    // Race columns: R1, R2, ... or just numeric
    const raceIndices = headers
      .map((h, i) => (/^R\d+$/.test(h) || /^\d+$/.test(h)) ? i : -1)
      .filter(i => i >= 0);
    const raceCount = raceIndices.length;

    // Extract data rows
    const rowMatches = extractAllMatches(bestTable, /<tr[^>]*>([\s\S]*?)<\/tr>/i);
    const competitors: ParsedResult[] = [];

    for (const rm of rowMatches) {
      const cells = extractAllMatches(rm[1], /<td[^>]*>([\s\S]*?)<\/td>/i)
        .map(c => stripTags(c[1]).trim());
      if (cells.length < 3) continue;

      const posRaw = posIdx >= 0 ? cells[posIdx] : cells[0];
      const pos = parseInt(posRaw);
      if (isNaN(pos)) continue; // skip header rows caught here

      // Name/Club may be combined in one cell with <br> or separate lines
      let name = nameIdx >= 0 ? cells[nameIdx] : cells[1];
      let club = clubIdx >= 0 ? cells[clubIdx] : "";

      // If name contains newline-like content, split
      const nameParts = name.split(/\n+/).map(s => s.trim()).filter(Boolean);
      if (nameParts.length >= 2 && !club) {
        name = nameParts[0];
        club = nameParts[1];
      }

      const sailNo = sailIdx >= 0 ? cells[sailIdx] : "";
      const boatDesign = designIdx >= 0 ? cells[designIdx] : "";
      const nettRaw = nettIdx >= 0 ? cells[nettIdx] : null;
      const totalRaw = totalIdx >= 0 ? cells[totalIdx] : null;
      const nett = nettRaw !== null ? parseFloat(nettRaw) || null : null;
      const total = totalRaw !== null ? parseFloat(totalRaw) || null : null;

      // Parse race scores - detect discards via brackets (e.g. "(15.0)")
      const races: (string | null)[] = [];
      const isDiscard: boolean[] = [];
      for (const ri of raceIndices) {
        const raw = ri < cells.length ? cells[ri] : null;
        if (raw === null || raw === "" || raw === "-") {
          races.push(null);
          isDiscard.push(false);
        } else {
          const discardMatch = raw.match(/^\((.+)\)$/);
          if (discardMatch) {
            races.push(discardMatch[1]);
            isDiscard.push(true);
          } else {
            races.push(raw);
            isDiscard.push(false);
          }
        }
      }

      competitors.push({
        position: pos,
        name,
        club,
        sailNo,
        boatDesign,
        nett,
        total,
        races,
        isDiscard,
      });
    }

    if (!competitors.length) return null;

    return { eventName, venue, eventDate, eventEndDate, boatClassRaw, boatClassMapped, raceCount, competitors };
  } catch {
    return null;
  }
}

// ─── Discover event links from a list page ────────────────────────────────────

interface DiscoveredEvent {
  externalEventId: string;
  url: string;
  name: string;
}

function discoverEventLinks(html: string, baseUrl: string): DiscoveredEvent[] {
  const events: DiscoveredEvent[] = [];
  const seen = new Set<string>();

  // Extract base origin from baseUrl
  const urlObj = new URL(baseUrl);
  const origin = urlObj.origin;

  // Strategy 1: Look for eventid= pattern in links
  const linkMatches = extractAllMatches(html, /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
  for (const m of linkMatches) {
    const href = m[1];
    const text = stripTags(m[2]).trim();
    if (!text || text.length < 3) continue;

    // Build full URL
    let fullUrl = href;
    if (href.startsWith("//")) fullUrl = urlObj.protocol + href;
    else if (href.startsWith("/")) fullUrl = origin + href;
    else if (!href.startsWith("http")) fullUrl = origin + "/" + href;

    // Look for eventid= or similar identifier
    const eventIdMatch = fullUrl.match(/[?&](?:eventid|event_id|id)=(\d+)/i) ||
                        fullUrl.match(/\/event\/(\d+)/i) ||
                        fullUrl.match(/\/results\/(\d+)/i);

    if (eventIdMatch) {
      const externalEventId = eventIdMatch[1];
      if (!seen.has(externalEventId)) {
        seen.add(externalEventId);
        events.push({ externalEventId, url: fullUrl, name: text });
      }
    }
  }

  // Strategy 2: If no eventid pattern found, look for any links to results-like URLs
  if (!events.length) {
    for (const m of linkMatches) {
      const href = m[1];
      const text = stripTags(m[2]).trim();
      if (!text || text.length < 5) continue;
      if (!href.toLowerCase().includes("result") && !href.toLowerCase().includes("arcade")) continue;

      let fullUrl = href;
      if (href.startsWith("//")) fullUrl = urlObj.protocol + href;
      else if (href.startsWith("/")) fullUrl = origin + href;
      else if (!href.startsWith("http")) fullUrl = origin + "/" + href;

      if (!seen.has(fullUrl)) {
        seen.add(fullUrl);
        // Use a hash of the URL as the external ID
        const hash = btoa(fullUrl).replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
        events.push({ externalEventId: hash, url: fullUrl, name: text });
      }
    }
  }

  return events;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const { source_id, manual } = body;

    // Fetch sources to process
    let sourcesQuery = supabase.from("external_result_sources").select("*").eq("is_active", true);
    if (source_id) sourcesQuery = sourcesQuery.eq("id", source_id);

    const { data: sources, error: sourcesErr } = await sourcesQuery;
    if (sourcesErr) throw new Error(sourcesErr.message);
    if (!sources?.length) {
      return new Response(JSON.stringify({ message: "No active sources found", results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];

    for (const source of sources) {
      let logId: string | null = null;
      let eventsCreated = 0;
      let eventsUpdated = 0;
      let eventsSkipped = 0;
      let eventsFound = 0;

      try {
        // Create scrape log
        const { data: logData } = await supabase
          .from("external_result_scrape_logs")
          .insert({ source_id: source.id, status: "running" })
          .select("id")
          .single();
        logId = logData?.id || null;

        // ── Fetch the source URL ──────────────────────────────────────────────
        const fetchResponse = await fetch(source.url, {
          headers: { "User-Agent": "AlfiePRO-Results-Scraper/1.0" },
          signal: AbortSignal.timeout(30000),
        });
        if (!fetchResponse.ok) throw new Error(`HTTP ${fetchResponse.status} for ${source.url}`);
        const html = await fetchResponse.text();

        // ── Determine events to process ───────────────────────────────────────
        let eventsToProcess: DiscoveredEvent[] = [];

        if (source.source_type === "single_event") {
          // Treat the source URL itself as a single event
          const urlId = source.id.slice(0, 8);
          eventsToProcess = [{ externalEventId: urlId, url: source.url, name: source.name }];
        } else {
          // Discover links from the list page
          eventsToProcess = discoverEventLinks(html, source.url);
        }

        eventsFound = eventsToProcess.length;

        // ── Process each event ────────────────────────────────────────────────
        for (const ev of eventsToProcess) {
          try {
            // Check if already exists
            const { data: existing } = await supabase
              .from("external_result_events")
              .select("id, last_scraped_at")
              .eq("source_id", source.id)
              .eq("external_event_id", ev.externalEventId)
              .maybeSingle();

            // Skip if scraped in last 6 hours (unless manual)
            if (existing && !manual) {
              const lastScrape = existing.last_scraped_at ? new Date(existing.last_scraped_at) : null;
              if (lastScrape && (Date.now() - lastScrape.getTime()) < 6 * 60 * 60 * 1000) {
                eventsSkipped++;
                continue;
              }
            }

            // Fetch event page (skip if same as source for event_list)
            let eventHtml = html;
            if (ev.url !== source.url) {
              const evRes = await fetch(ev.url, {
                headers: { "User-Agent": "AlfiePRO-Results-Scraper/1.0" },
                signal: AbortSignal.timeout(20000),
              });
              if (!evRes.ok) { eventsSkipped++; continue; }
              eventHtml = await evRes.text();
            }

            const parsed = parseEventPage(eventHtml);
            if (!parsed || !parsed.competitors.length) { eventsSkipped++; continue; }

            // Try to auto-map boat class to AlfiePRO boat_classes table
            let boatClassId: string | null = null;
            if (parsed.boatClassMapped) {
              const { data: bc } = await supabase
                .from("boat_classes")
                .select("id")
                .ilike("name", `%${parsed.boatClassMapped}%`)
                .maybeSingle();
              boatClassId = bc?.id || null;
            }

            const eventPayload = {
              source_id: source.id,
              external_event_id: ev.externalEventId,
              event_name: parsed.eventName || ev.name,
              event_date: parsed.eventDate,
              event_end_date: parsed.eventEndDate,
              venue: parsed.venue,
              boat_class_raw: parsed.boatClassRaw,
              boat_class_id: boatClassId,
              boat_class_mapped: parsed.boatClassMapped,
              source_url: ev.url,
              results_json: parsed.competitors,
              competitor_count: parsed.competitors.length,
              race_count: parsed.raceCount,
              display_category: source.display_category,
              last_scraped_at: new Date().toISOString(),
            };

            if (existing) {
              await supabase
                .from("external_result_events")
                .update({ ...eventPayload, updated_at: new Date().toISOString() })
                .eq("id", existing.id);
              eventsUpdated++;
            } else {
              await supabase.from("external_result_events").insert(eventPayload);
              eventsCreated++;
            }
          } catch (evErr) {
            console.error("Error processing event", ev.url, evErr);
            eventsSkipped++;
          }
        }

        // Update source event_count
        const { count: totalCount } = await supabase
          .from("external_result_events")
          .select("*", { count: "exact", head: true })
          .eq("source_id", source.id);

        await supabase.from("external_result_sources").update({
          last_scraped_at: new Date().toISOString(),
          event_count: totalCount ?? 0,
          updated_at: new Date().toISOString(),
        }).eq("id", source.id);

        if (logId) {
          await supabase.from("external_result_scrape_logs").update({
            completed_at: new Date().toISOString(),
            events_found: eventsFound,
            events_created: eventsCreated,
            events_updated: eventsUpdated,
            events_skipped: eventsSkipped,
            status: "success",
          }).eq("id", logId);
        }

        results.push({ source: source.name, found: eventsFound, created: eventsCreated, updated: eventsUpdated, skipped: eventsSkipped });

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (logId) {
          await supabase.from("external_result_scrape_logs").update({
            completed_at: new Date().toISOString(),
            status: "error",
            error_message: msg,
          }).eq("id", logId);
        }
        results.push({ source: source.name, error: msg });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
