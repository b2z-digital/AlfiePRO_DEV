import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_EVENTS_PER_RUN = 500;
const FETCH_TIMEOUT_MS = 20000;

const BOAT_CLASS_KEYWORDS: Record<string, string> = {
  "international ten rater": "10R",
  "ten rater": "10R",
  "10 rater": "10R",
  "10r": "10R",
  "marblehead": "Marblehead",
  "m class": "Marblehead",
  "international one metre": "IOM",
  "iom": "IOM",
  "i.o.m": "IOM",
  "one metre": "IOM",
  "1 metre": "IOM",
  "1m": "IOM",
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

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAllMatches(html: string, pattern: RegExp): RegExpMatchArray[] {
  const results: RegExpMatchArray[] = [];
  let m: RegExpMatchArray | null;
  const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
  const re = new RegExp(pattern.source, flags);
  while ((m = re.exec(html)) !== null) results.push(m);
  return results;
}

function extractText(html: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, "is");
  const m = html.match(re);
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : "";
}

// ─── Parse list page: extract event links + metadata from the list HTML ────────

interface DiscoveredEvent {
  externalEventId: string;
  url: string;
  name: string;
  eventDate: string | null;
  venue: string | null;
  boatClassRaw: string | null;
  boatClassMapped: string | null;
}

function findNearbyDate(html: string, linkIndex: number): string | null {
  const searchWindow = html.slice(Math.max(0, linkIndex - 500), linkIndex);
  const datePatterns = [
    /(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2})/gi,
    /(\d{1,2})[-\/](\d{1,2})[-\/](20\d{2})/g,
  ];
  for (const pattern of datePatterns) {
    const matches = [...searchWindow.matchAll(pattern)];
    if (matches.length > 0) {
      const last = matches[matches.length - 1];
      const d = new Date(last[0]);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  return null;
}

function findNearbyVenue(html: string, linkIndex: number): string | null {
  const searchWindow = html.slice(linkIndex, linkIndex + 500);
  const venueMatch =
    searchWindow.match(/([A-Z][a-zA-Z\s']+,\s*(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT)(?:\s+AUS)?)/);
  if (venueMatch) return venueMatch[1].replace(/\s+AUS$/, "").trim();
  return null;
}

function parseListPage(html: string, baseUrl: string): DiscoveredEvent[] {
  const events: DiscoveredEvent[] = [];
  const seen = new Set<string>();
  const urlObj = new URL(baseUrl);
  const origin = urlObj.origin;

  const linkMatches = extractAllMatches(html, /<a[^>]+href=["']([^"'#][^"']*?)["'][^>]*>([\s\S]*?)<\/a>/i);

  for (const m of linkMatches) {
    const href = m[1].trim()
      .replace(/&amp;/g, "&")
      .replace(/&#38;/g, "&")
      .replace(/&quot;/g, '"');
    const rawText = stripTags(m[2]);
    if (!rawText || rawText.length < 3) continue;

    let fullUrl = href;
    if (href.startsWith("//")) fullUrl = urlObj.protocol + href;
    else if (href.startsWith("/")) fullUrl = origin + href;
    else if (!href.startsWith("http")) fullUrl = origin + "/" + href;

    try {
      const u = new URL(fullUrl);
      if (u.origin !== origin) continue;
    } catch {
      continue;
    }

    const eventIdMatch =
      fullUrl.match(/[?&](?:eventid|event_id|eid|id)=(\w+)/i) ||
      fullUrl.match(/\/event[s]?\/(\w+)/i) ||
      fullUrl.match(/\/results?\/(\w+)/i) ||
      fullUrl.match(/arcade=results[^&]*&.*?eventid=(\w+)/i);

    if (!eventIdMatch) continue;

    const externalEventId = eventIdMatch[1];
    if (seen.has(externalEventId)) continue;
    seen.add(externalEventId);

    const boatClassMapped = detectBoatClass(rawText);

    const linkStartIndex = m.index ?? 0;
    let eventDate: string | null = null;

    const inlineDate = rawText.match(/\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/) ||
                       rawText.match(/\d{1,2}\s+\w{3,9}\s+\d{4}/);
    if (inlineDate) {
      const d = new Date(inlineDate[0]);
      if (!isNaN(d.getTime())) eventDate = d.toISOString().slice(0, 10);
    }

    if (!eventDate) {
      eventDate = findNearbyDate(html, linkStartIndex);
    }

    const venue = findNearbyVenue(html, linkStartIndex + (m[0]?.length || 0));

    events.push({
      externalEventId,
      url: fullUrl,
      name: rawText.slice(0, 200),
      eventDate,
      venue,
      boatClassRaw: boatClassMapped || null,
      boatClassMapped,
    });

    if (events.length >= MAX_EVENTS_PER_RUN) break;
  }

  return events;
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

function parseEventPage(html: string, fallbackName?: string): ParsedEvent | null {
  try {
    // Try headings in order; skip generic "Results" text
    const isGeneric = (s: string) => !s || /^results?$/i.test(s.trim()) || s.trim().length < 4;

    const h1 = extractText(html, "h1");
    const h2 = extractText(html, "h2");
    const h3 = extractText(html, "h3");
    const title = extractText(html, "title").replace(/\s*\|.*$/, "").trim(); // strip " | Site Name"

    let eventName = "";
    for (const candidate of [h3, h2, h1, title, fallbackName || ""]) {
      if (!isGeneric(candidate)) { eventName = candidate; break; }
    }
    if (!eventName) eventName = fallbackName || "Unknown Event";
    eventName = eventName.replace(/\s+/g, " ").trim();

    // Scan wider area for boat class detection (h3 often has it)
    const headerArea = html.slice(0, 5000);
    const boatClassRaw = (() => {
      // Direct keyword match in h3/event name first
      const fromName = detectBoatClass(eventName);
      if (fromName) return eventName;
      const classMatch =
        headerArea.match(/class[:\s]+([A-Za-z0-9\s\-\/]+?)(?:\s*<|\s*\n|\s*,)/i) ||
        headerArea.match(/(international ten rater|marblehead|one metre|footy|df65|df95|dragonflite|dragon force|a class|e class|rc laser|victoria|ec12|1 metre|soling|wind warrior)/i);
      if (classMatch) return classMatch[1].trim();
      return "";
    })();
    const boatClassMapped = detectBoatClass(boatClassRaw || eventName);

    // Venue: radiosailing.org.au puts it as plain text near the date line
    const venueMatch =
      html.match(/(?:venue|location|held at|at\s+):\s*([^<\n,]+)/i) ||
      html.match(/<td[^>]*>\s*(?:Venue|Location)\s*<\/td>\s*<td[^>]*>\s*([^<]+)/i) ||
      // "Eagleby, QLD" style — city/suburb + state code
      html.match(/([A-Z][a-zA-Z\s]+,\s*(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT|NZ))/);
    const venue = venueMatch ? stripTags(venueMatch[1]).trim() : "";

    // Date parsing — priority: extract from tilde line "~ DD Mon YYYY" used by radiosailing.org.au
    let eventDate: string | null = null;
    let eventEndDate: string | null = null;

    // Extract just the date portion after the tilde to avoid matching race numbers elsewhere
    const tildeMatch = html.match(/~\s*([\d]{1,2}[^<\n]{0,30}20\d{2})/);
    const dateSource = tildeMatch ? tildeMatch[1].trim() : "";

    // Cross-month range: "28 Feb - 03 Mar 2026"
    const crossMonthRange = dateSource.match(/^(\d{1,2})\s+(\w{3,9})\s*[-–]\s*(\d{1,2})\s+(\w{3,9})\s+(20\d{2})/);
    // Same-month range: "09 Aug - 10 Aug 2025"
    const sameMonthRange = dateSource.match(/^(\d{1,2})\s+(\w{3,9})\s*[-–]\s*(\d{1,2})\s+\w{3,9}\s+(20\d{2})/);
    // Same-month short: "09-10 Aug 2025"
    const sameMonthShort = dateSource.match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})\s+(\w{3,9})\s+(20\d{2})/);
    // Single date: "01 Feb 2026"
    const singleDate = dateSource.match(/^(\d{1,2})\s+(\w{3,9})\s+(20\d{2})/) ||
                       html.match(/(20\d{2}-\d{2}-\d{2})/);

    if (crossMonthRange) {
      const [, d1, mon1, d2, mon2, yr] = crossMonthRange;
      const start = new Date(`${d1} ${mon1} ${yr}`);
      const end = new Date(`${d2} ${mon2} ${yr}`);
      if (!isNaN(start.getTime())) eventDate = start.toISOString().slice(0, 10);
      if (!isNaN(end.getTime())) eventEndDate = end.toISOString().slice(0, 10);
    } else if (sameMonthRange) {
      const [, d1, mon1, d2, , yr] = sameMonthRange;
      const start = new Date(`${d1} ${mon1} ${yr}`);
      const end = new Date(`${d2} ${mon1} ${yr}`);
      if (!isNaN(start.getTime())) eventDate = start.toISOString().slice(0, 10);
      if (!isNaN(end.getTime())) eventEndDate = end.toISOString().slice(0, 10);
    } else if (sameMonthShort) {
      const [, d1, d2, mon, yr] = sameMonthShort;
      const start = new Date(`${d1} ${mon} ${yr}`);
      const end = new Date(`${d2} ${mon} ${yr}`);
      if (!isNaN(start.getTime())) eventDate = start.toISOString().slice(0, 10);
      if (!isNaN(end.getTime())) eventEndDate = end.toISOString().slice(0, 10);
    } else if (singleDate) {
      const d = new Date(singleDate[0]);
      if (!isNaN(d.getTime())) eventDate = d.toISOString().slice(0, 10);
    }

    const tableMatches = extractAllMatches(html, /<table[^>]*>([\s\S]*?)<\/table>/i);
    if (!tableMatches.length) return null;

    let bestTable = "";
    let bestRowCount = 0;
    for (const tm of tableMatches) {
      const rows = extractAllMatches(tm[1], /<tr[\s\S]*?<\/tr>/i).length;
      if (rows > bestRowCount) { bestRowCount = rows; bestTable = tm[1]; }
    }
    if (!bestTable) return null;

    const headerRow = bestTable.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i)?.[1] || "";
    const headers = extractAllMatches(headerRow, /<th[^>]*>([\s\S]*?)<\/th>/i)
      .map(m => stripTags(m[1]).trim().toUpperCase());

    if (!headers.length) return null;

    const posIdx = headers.findIndex(h => h === "POS" || h === "POSITION" || h === "#");
    const nameIdx = headers.findIndex(h => h.includes("NAME") || h.includes("SKIPPER") || h.includes("COMPETITOR"));
    const clubIdx = headers.findIndex(h => h.includes("CLUB"));
    const sailIdx = headers.findIndex(h => h.includes("SAIL") || h.includes("SAIL NO"));
    const designIdx = headers.findIndex(h => h.includes("DESIGN") || h.includes("BOAT") || h.includes("CLASS"));
    const nettIdx = headers.findIndex(h => h === "NETT" || h === "NET" || h === "PTS");
    const totalIdx = headers.findIndex(h => h === "TOTAL" || h === "GROSS");
    const raceIndices = headers
      .map((h, i) => (/^R\d+$/.test(h) || /^\d+$/.test(h)) ? i : -1)
      .filter(i => i >= 0);
    const raceCount = raceIndices.length;

    const rowMatches = extractAllMatches(bestTable, /<tr[^>]*>([\s\S]*?)<\/tr>/i);
    const competitors: ParsedResult[] = [];

    for (const rm of rowMatches) {
      const cells = extractAllMatches(rm[1], /<td[^>]*>([\s\S]*?)<\/td>/i)
        .map(c => stripTags(c[1]).trim());
      if (cells.length < 3) continue;

      const posRaw = posIdx >= 0 ? cells[posIdx] : cells[0];
      const pos = parseInt(posRaw);
      if (isNaN(pos)) continue;

      let name = nameIdx >= 0 ? cells[nameIdx] : cells[1];
      let club = clubIdx >= 0 ? cells[clubIdx] : "";
      const nameParts = name.split(/\n+/).map(s => s.trim()).filter(Boolean);
      if (nameParts.length >= 2 && !club) { name = nameParts[0]; club = nameParts[1]; }

      const sailNo = sailIdx >= 0 ? cells[sailIdx] : "";
      const boatDesign = designIdx >= 0 ? cells[designIdx] : "";
      const nettRaw = nettIdx >= 0 ? cells[nettIdx] : null;
      const totalRaw = totalIdx >= 0 ? cells[totalIdx] : null;
      const nett = nettRaw !== null ? parseFloat(nettRaw) || null : null;
      const total = totalRaw !== null ? parseFloat(totalRaw) || null : null;

      const races: (string | null)[] = [];
      const isDiscard: boolean[] = [];
      for (const ri of raceIndices) {
        const raw = ri < cells.length ? cells[ri] : null;
        if (!raw || raw === "-") { races.push(null); isDiscard.push(false); continue; }
        const d = raw.match(/^\((.+)\)$/);
        if (d) { races.push(d[1]); isDiscard.push(true); }
        else { races.push(raw); isDiscard.push(false); }
      }

      competitors.push({ position: pos, name, club, sailNo, boatDesign, nett, total, races, isDiscard });
    }

    if (!competitors.length) return null;
    return { eventName, venue, eventDate, eventEndDate, boatClassRaw, boatClassMapped, raceCount, competitors };
  } catch {
    return null;
  }
}

// ─── Extract the largest results table as raw HTML ────────────────────────────

function extractBestTableHtml(html: string): string | null {
  const tableMatches = extractAllMatches(html, /<table[^>]*>[\s\S]*?<\/table>/i);
  if (!tableMatches.length) return null;

  let bestHtml = "";
  let bestRowCount = 0;
  for (const tm of tableMatches) {
    const rowCount = extractAllMatches(tm[0], /<tr[\s\S]*?<\/tr>/i).length;
    if (rowCount > bestRowCount) {
      bestRowCount = rowCount;
      bestHtml = tm[0];
    }
  }
  if (!bestHtml || bestRowCount < 2) return null;

  // Strip inline styles, bgcolor, width, border, cellpadding attrs so our CSS controls appearance
  return bestHtml
    .replace(/\s+style="[^"]*"/gi, "")
    .replace(/\s+bgcolor="[^"]*"/gi, "")
    .replace(/\s+width="[^"]*"/gi, "")
    .replace(/\s+border="[^"]*"/gi, "")
    .replace(/\s+cellpadding="[^"]*"/gi, "")
    .replace(/\s+cellspacing="[^"]*"/gi, "")
    .replace(/\s+align="[^"]*"/gi, "");
}

// ─── MySailingResults API integration ─────────────────────────────────────────

const MYSAILINGRESULTS_API_URLS = [
  "https://mysailingresults.com/api/results/get_results.php",
  "http://mysailingresults.com/api/results/get_results.php",
];

interface MSRCompetitor {
  comppos: number;
  compname: string;
  compsailno: string;
  compclubname: string;
  compboatdesign: string;
  grossScore: string;
  nettScore: string;
  results: Record<string, string>;
  compgrp?: string;
}

interface MSREvent {
  eventname: string;
  eventlocation: string;
  eventstate: string;
  eventstartdate: string;
  eventenddate: string;
  eventclass: string;
  racescompleted: string;
  competitors: string;
}

function extractEventIdFromUrl(url: string): string | null {
  const m = url.match(/[?&]eventid=(\d+)/i);
  return m ? m[1] : null;
}

function isMySailingResultsSite(url: string): boolean {
  return url.includes("radiosailing.org.au") || url.includes("mysailingresults.com");
}

function buildResultsTableHtml(event: MSREvent, competitors: MSRCompetitor[]): string {
  if (!competitors.length) return "";

  const raceKeys = Object.keys(competitors[0]?.results || {})
    .filter(k => /^r\d+$/i.test(k))
    .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));

  let html = '<table><thead><tr>';
  html += '<th>Pos</th><th>Name</th><th>Club</th><th>Sail No</th><th>Design</th>';
  html += '<th>Nett</th><th>Total</th>';
  for (const rk of raceKeys) html += `<th>${rk.toUpperCase()}</th>`;
  html += '</tr></thead><tbody>';

  for (const c of competitors) {
    html += '<tr>';
    html += `<td>${c.comppos}</td>`;
    html += `<td>${c.compname || ""}</td>`;
    html += `<td>${c.compclubname || ""}</td>`;
    html += `<td>${c.compsailno || ""}</td>`;
    html += `<td>${c.compboatdesign || ""}</td>`;
    html += `<td>${c.nettScore || ""}</td>`;
    html += `<td>${c.grossScore || ""}</td>`;
    for (const rk of raceKeys) {
      const val = c.results?.[rk] ?? "";
      html += `<td>${val}</td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table>';
  return html;
}

function msrCompetitorsToParsed(competitors: MSRCompetitor[]): ParsedResult[] {
  const raceKeys = Object.keys(competitors[0]?.results || {})
    .filter(k => /^r\d+$/i.test(k))
    .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));

  return competitors.map(c => {
    const races: (string | null)[] = [];
    const isDiscard: boolean[] = [];
    for (const rk of raceKeys) {
      const raw = c.results?.[rk] ?? null;
      if (!raw || raw === "-") { races.push(null); isDiscard.push(false); continue; }
      const d = raw.match(/^\((.+)\)$/);
      if (d) { races.push(d[1]); isDiscard.push(true); }
      else { races.push(raw); isDiscard.push(false); }
    }
    return {
      position: c.comppos,
      name: c.compname || "",
      club: c.compclubname || "",
      sailNo: c.compsailno || "",
      boatDesign: c.compboatdesign || "",
      nett: c.nettScore ? parseFloat(c.nettScore) || null : null,
      total: c.grossScore ? parseFloat(c.grossScore) || null : null,
      races,
      isDiscard,
    };
  });
}

async function fetchFromMySailingResultsApi(eventId: string): Promise<{
  rawTableHtml: string | null;
  competitors: ParsedResult[];
  raceCount: number;
  eventName: string;
  venue: string;
  eventDate: string | null;
  eventEndDate: string | null;
  boatClassRaw: string;
  boatClassMapped: string | null;
} | null> {
  try {
    let text = "";
    let fetchSuccess = false;

    for (const baseUrl of MYSAILINGRESULTS_API_URLS) {
      const apiUrl = `${baseUrl}?eventid=${eventId}`;
      console.log("Trying MySailingResults API:", apiUrl);

      try {
        const resp = await fetch(apiUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Origin": "https://radiosailing.org.au",
            "Referer": "https://radiosailing.org.au/",
          },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          redirect: "follow",
        });

        console.log("MySailingResults API response status:", resp.status, "url:", resp.url);
        if (!resp.ok) {
          console.error("MySailingResults API HTTP error:", resp.status, resp.statusText);
          continue;
        }

        text = await resp.text();
        console.log("MySailingResults API response length:", text.length, "first 200 chars:", text.slice(0, 200));
        fetchSuccess = true;
        break;
      } catch (fetchErr) {
        console.error("MySailingResults API fetch error for", apiUrl, ":", fetchErr instanceof Error ? fetchErr.message : String(fetchErr));
        continue;
      }
    }

    if (!fetchSuccess || !text) {
      console.error("All MySailingResults API URLs failed for event:", eventId);
      return null;
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      console.error("MySailingResults API: failed to parse JSON, response starts with:", text.slice(0, 300));
      return null;
    }

    const eventInfo: MSREvent = (data.event || data.Event || {}) as MSREvent;
    const rawCompetitors: MSRCompetitor[] = (data.results || data.Results || []) as MSRCompetitor[];

    console.log("MySailingResults API: event name:", eventInfo.eventname, "competitors:", rawCompetitors.length);

    if (!rawCompetitors.length) return null;

    const raceKeys = Object.keys(rawCompetitors[0]?.results || {})
      .filter(k => /^r\d+$/i.test(k));

    const eventName = eventInfo.eventname || "";
    const venue = [eventInfo.eventlocation, eventInfo.eventstate].filter(Boolean).join(", ");
    const boatClassRaw = String(eventInfo.eventclass || "");
    const boatClassMapped = detectBoatClass(boatClassRaw || eventName);

    let eventDate: string | null = null;
    let eventEndDate: string | null = null;
    if (eventInfo.eventstartdate) {
      const d = new Date(eventInfo.eventstartdate);
      if (!isNaN(d.getTime())) eventDate = d.toISOString().slice(0, 10);
    }
    if (eventInfo.eventenddate) {
      const d = new Date(eventInfo.eventenddate);
      if (!isNaN(d.getTime())) eventEndDate = d.toISOString().slice(0, 10);
    }

    const rawTableHtml = buildResultsTableHtml(eventInfo, rawCompetitors);
    const competitors = msrCompetitorsToParsed(rawCompetitors);

    return {
      rawTableHtml,
      competitors,
      raceCount: raceKeys.length,
      eventName,
      venue,
      eventDate,
      eventEndDate,
      boatClassRaw,
      boatClassMapped,
    };
  } catch (e) {
    console.error("MySailingResults API error:", e instanceof Error ? e.message : String(e));
    return null;
  }
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
    const { source_id, manual, event_row_id, fix_bad_names } = body;

    // ── Fix bad names: re-fetch individual pages for records with generic names ──
    if (fix_bad_names) {
      const { data: badRows } = await supabase
        .from("external_result_events")
        .select("id, source_url, event_name, boat_class_raw, boat_class_mapped")
        .or("event_name.eq.Results,event_name.eq.,event_date.is.null")
        .limit(30);

      if (!badRows?.length) {
        return new Response(JSON.stringify({ success: true, fixed: 0, message: "No bad records found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let fixed = 0;
      for (const row of badRows) {
        try {
          const resp = await fetch(row.source_url, {
            headers: { "User-Agent": "Mozilla/5.0 AlfiePRO-Results-Scraper/1.0" },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });
          if (!resp.ok) continue;
          const html = await resp.text();
          const parsed = parseEventPage(html, row.event_name);
          if (!parsed) continue;

          const isStillGeneric = !parsed.eventName || parsed.eventName === "Results" || parsed.eventName.length < 4;
          const newName = isStillGeneric ? row.event_name : parsed.eventName;

          let boatClassId: string | null = null;
          const bClass = parsed.boatClassMapped || row.boat_class_mapped;
          if (bClass) {
            const { data: bc } = await supabase
              .from("boat_classes").select("id").ilike("name", `%${bClass}%`).maybeSingle();
            boatClassId = bc?.id || null;
          }

          const update: Record<string, unknown> = {
            event_name: newName,
            results_json: parsed.competitors.length ? parsed.competitors : undefined,
            competitor_count: parsed.competitors.length || undefined,
            race_count: parsed.raceCount || undefined,
            last_scraped_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          if (parsed.eventDate) update.event_date = parsed.eventDate;
          if (parsed.eventEndDate) update.event_end_date = parsed.eventEndDate;
          if (parsed.venue) update.venue = parsed.venue;
          if (parsed.boatClassRaw) update.boat_class_raw = parsed.boatClassRaw;
          if (parsed.boatClassMapped) update.boat_class_mapped = parsed.boatClassMapped;
          if (boatClassId) update.boat_class_id = boatClassId;

          const cleanUpdate = Object.fromEntries(Object.entries(update).filter(([, v]) => v !== undefined));
          await supabase.from("external_result_events").update(cleanUpdate).eq("id", row.id);
          fixed++;
        } catch {
          continue;
        }
      }

      return new Response(JSON.stringify({ success: true, fixed, total: badRows.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── On-demand single event fetch ──────────────────────────────────────────
    // When event_row_id is provided, fetch and parse that event's page on the
    // fly, update the DB row, and return the full parsed results immediately.
    if (event_row_id) {
      const { data: eventRow, error: eventErr } = await supabase
        .from("external_result_events")
        .select("id, source_id, source_url, event_name, display_category, boat_class_raw, boat_class_mapped, external_event_id")
        .eq("id", event_row_id)
        .maybeSingle();

      if (eventErr || !eventRow) {
        return new Response(JSON.stringify({ error: "Event not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if this is a MySailingResults-powered site (radiosailing.org.au)
      const msrEventId = extractEventIdFromUrl(eventRow.source_url);
      if (msrEventId && isMySailingResultsSite(eventRow.source_url)) {
        // First fetch the HTML page to discover the actual API event ID
        // (the page JS may reference a different event ID than the URL param)
        let resolvedApiEventId = msrEventId;
        const pageResp = await fetch(eventRow.source_url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        }).catch(() => null);

        if (pageResp?.ok) {
          const pageHtml = await pageResp.text();
          // Look for the mysailingresults API call in the page JS
          const apiMatch = pageHtml.match(/mysailingresults\.com\/api\/results\/get_results\.php\?eventid=(\d+)/i) ||
                           pageHtml.match(/get_results\.php\?eventid=(\d+)/i) ||
                           pageHtml.match(/eventid['"]\s*[:=]\s*['"]?(\d+)/i);
          if (apiMatch) resolvedApiEventId = apiMatch[1];
        }

        console.log("Resolved MSR event ID:", resolvedApiEventId, "from URL event ID:", msrEventId);

        const apiResult = await fetchFromMySailingResultsApi(resolvedApiEventId);

        if (apiResult && (apiResult.rawTableHtml || apiResult.competitors.length)) {
          let boatClassId: string | null = null;
          const bClass = apiResult.boatClassMapped || eventRow.boat_class_mapped;
          if (bClass) {
            const { data: bc } = await supabase
              .from("boat_classes").select("id").ilike("name", `%${bClass}%`).maybeSingle();
            boatClassId = bc?.id || null;
          }

          const updatePayload: Record<string, unknown> = {
            results_json: apiResult.competitors,
            competitor_count: apiResult.competitors.length,
            race_count: apiResult.raceCount,
            last_scraped_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          if (apiResult.eventDate) updatePayload.event_date = apiResult.eventDate;
          if (apiResult.eventEndDate) updatePayload.event_end_date = apiResult.eventEndDate;
          if (apiResult.venue) updatePayload.venue = apiResult.venue;
          if (apiResult.boatClassRaw || eventRow.boat_class_raw) updatePayload.boat_class_raw = apiResult.boatClassRaw || eventRow.boat_class_raw;
          if (apiResult.boatClassMapped || eventRow.boat_class_mapped) updatePayload.boat_class_mapped = apiResult.boatClassMapped || eventRow.boat_class_mapped;
          if (boatClassId) updatePayload.boat_class_id = boatClassId;

          await supabase.from("external_result_events").update(updatePayload).eq("id", event_row_id);

          return new Response(JSON.stringify({
            success: true,
            raw_table_html: apiResult.rawTableHtml,
            competitors: apiResult.competitors,
            race_count: apiResult.raceCount,
            competitor_count: apiResult.competitors.length,
            event_date: apiResult.eventDate,
            event_end_date: apiResult.eventEndDate,
            venue: apiResult.venue,
            boat_class_raw: apiResult.boatClassRaw,
            boat_class_mapped: apiResult.boatClassMapped,
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // API failed - return with a message
        return new Response(JSON.stringify({
          error: "No results available for this event yet. The event may not have started or results haven't been published.",
          competitors: [],
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fallback: fetch HTML page directly for non-API sources
      const fetchResp = await fetch(eventRow.source_url, {
        headers: {
          "User-Agent": "Mozilla/5.0 AlfiePRO-Results-Scraper/1.0",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!fetchResp.ok) {
        return new Response(JSON.stringify({ error: `HTTP ${fetchResp.status} fetching event page` }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const html = await fetchResp.text();

      const rawTableHtml = extractBestTableHtml(html);
      const parsed = parseEventPage(html, eventRow.event_name);

      if (!rawTableHtml && (!parsed || !parsed.competitors.length)) {
        return new Response(JSON.stringify({ error: "No results found on event page", competitors: [] }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let boatClassId: string | null = null;
      const bClass = (parsed?.boatClassMapped) || eventRow.boat_class_mapped;
      if (bClass) {
        const { data: bc } = await supabase
          .from("boat_classes").select("id").ilike("name", `%${bClass}%`).maybeSingle();
        boatClassId = bc?.id || null;
      }

      const competitors = parsed?.competitors || [];
      const updatePayload: Record<string, unknown> = {
        results_json: competitors,
        competitor_count: competitors.length,
        race_count: parsed?.raceCount ?? 0,
        last_scraped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (parsed?.eventDate) updatePayload.event_date = parsed.eventDate;
      if (parsed?.eventEndDate) updatePayload.event_end_date = parsed.eventEndDate;
      if (parsed?.venue) updatePayload.venue = parsed.venue;
      if (parsed?.boatClassRaw || eventRow.boat_class_raw) updatePayload.boat_class_raw = parsed?.boatClassRaw || eventRow.boat_class_raw;
      if (parsed?.boatClassMapped || eventRow.boat_class_mapped) updatePayload.boat_class_mapped = parsed?.boatClassMapped || eventRow.boat_class_mapped;
      if (boatClassId) updatePayload.boat_class_id = boatClassId;

      await supabase.from("external_result_events").update(updatePayload).eq("id", event_row_id);

      return new Response(JSON.stringify({
        success: true,
        raw_table_html: rawTableHtml || null,
        competitors,
        race_count: parsed?.raceCount ?? 0,
        competitor_count: competitors.length,
        event_date: parsed?.eventDate,
        event_end_date: parsed?.eventEndDate,
        venue: parsed?.venue,
        boat_class_raw: parsed?.boatClassRaw,
        boat_class_mapped: parsed?.boatClassMapped,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
        const { data: logData } = await supabase
          .from("external_result_scrape_logs")
          .insert({ source_id: source.id, status: "running" })
          .select("id")
          .single();
        logId = logData?.id || null;

        // Fetch the source page
        const fetchResponse = await fetch(source.url, {
          headers: {
            "User-Agent": "Mozilla/5.0 AlfiePRO-Results-Scraper/1.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!fetchResponse.ok) throw new Error(`HTTP ${fetchResponse.status} fetching ${source.url}`);
        const html = await fetchResponse.text();

        if (source.source_type === "single_event") {
          // ── Single event: parse results directly from this page ────────────
          const evId = source.id.slice(0, 8);
          const existing = await supabase
            .from("external_result_events")
            .select("id, last_scraped_at")
            .eq("source_id", source.id)
            .eq("external_event_id", evId)
            .maybeSingle();

          eventsFound = 1;

          if (existing.data && !manual) {
            const lastScrape = existing.data.last_scraped_at ? new Date(existing.data.last_scraped_at) : null;
            if (lastScrape && (Date.now() - lastScrape.getTime()) < 6 * 60 * 60 * 1000) {
              eventsSkipped = 1;
            }
          }

          if (eventsSkipped === 0) {
            const parsed = parseEventPage(html, source.name);
            if (parsed && parsed.competitors.length) {
              let boatClassId: string | null = null;
              if (parsed.boatClassMapped) {
                const { data: bc } = await supabase
                  .from("boat_classes").select("id").ilike("name", `%${parsed.boatClassMapped}%`).maybeSingle();
                boatClassId = bc?.id || null;
              }
              const payload = {
                source_id: source.id,
                external_event_id: evId,
                event_name: parsed.eventName || source.name,
                event_date: parsed.eventDate,
                event_end_date: parsed.eventEndDate,
                venue: parsed.venue,
                boat_class_raw: parsed.boatClassRaw,
                boat_class_id: boatClassId,
                boat_class_mapped: parsed.boatClassMapped,
                source_url: source.url,
                results_json: parsed.competitors,
                competitor_count: parsed.competitors.length,
                race_count: parsed.raceCount,
                display_category: source.display_category,
                last_scraped_at: new Date().toISOString(),
              };
              if (existing.data) {
                await supabase.from("external_result_events")
                  .update({ ...payload, updated_at: new Date().toISOString() })
                  .eq("id", existing.data.id);
                eventsUpdated = 1;
              } else {
                await supabase.from("external_result_events").insert(payload);
                eventsCreated = 1;
              }
            } else {
              eventsSkipped = 1;
            }
          }

        } else {
          // ── Event list: discover links and register them WITHOUT fetching each page ──
          const discovered = parseListPage(html, source.url);
          eventsFound = discovered.length;

          for (const ev of discovered) {
            try {
              const { data: existing } = await supabase
                .from("external_result_events")
                .select("id, last_scraped_at")
                .eq("source_id", source.id)
                .eq("external_event_id", ev.externalEventId)
                .maybeSingle();

              if (existing && !manual) {
                const lastScrape = existing.last_scraped_at ? new Date(existing.last_scraped_at) : null;
                if (lastScrape && (Date.now() - lastScrape.getTime()) < 6 * 60 * 60 * 1000) {
                  eventsSkipped++;
                  continue;
                }
              }

              let boatClassId: string | null = null;
              if (ev.boatClassMapped) {
                const { data: bc } = await supabase
                  .from("boat_classes").select("id").ilike("name", `%${ev.boatClassMapped}%`).maybeSingle();
                boatClassId = bc?.id || null;
              }

              const payload = {
                source_id: source.id,
                external_event_id: ev.externalEventId,
                event_name: ev.name,
                event_date: ev.eventDate,
                event_end_date: null,
                venue: ev.venue,
                boat_class_raw: ev.boatClassRaw,
                boat_class_id: boatClassId,
                boat_class_mapped: ev.boatClassMapped,
                source_url: ev.url,
                results_json: [],
                competitor_count: 0,
                race_count: 0,
                display_category: source.display_category,
                last_scraped_at: new Date().toISOString(),
              };

              if (existing) {
                await supabase.from("external_result_events")
                  .update({ ...payload, updated_at: new Date().toISOString() })
                  .eq("id", existing.id);
                eventsUpdated++;
              } else {
                await supabase.from("external_result_events").insert(payload);
                eventsCreated++;
              }
            } catch (evErr) {
              console.error("Error saving event", ev.url, evErr);
              eventsSkipped++;
            }
          }
        }

        // Update source counters
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

        results.push({
          source: source.name,
          found: eventsFound,
          created: eventsCreated,
          updated: eventsUpdated,
          skipped: eventsSkipped,
        });

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
