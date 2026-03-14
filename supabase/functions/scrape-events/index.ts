import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_EVENTS_PER_RUN = 500;
const FETCH_TIMEOUT_MS = 20000;
const DETAIL_FETCH_DELAY_MS = 300;

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

const CLASS_ICON_MAP: Record<string, string> = {
  "1": "IOM",
  "2": "10R",
  "3": "A Class",
  "4": "Marblehead",
  "8": "DF65",
  "10": "DF95",
};

const STATE_ABBREVS = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"];

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

function detectEventType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("australian") || lower.includes("national")) return "national";
  if (lower.includes("world") || lower.includes("international")) return "world";
  if (lower.includes("invitational") || lower.includes("open")) return "invitational";
  if (lower.includes("state") || lower.includes("championship")) return "state";
  return "state";
}

function detectState(text: string): string | null {
  for (const st of STATE_ABBREVS) {
    const patterns = [
      new RegExp(`\\b${st}\\b`),
      new RegExp(`,\\s*${st}[\\s,]`),
      new RegExp(`\\s${st}\\s+AUS`),
    ];
    for (const p of patterns) {
      if (p.test(text)) return st;
    }
  }
  return null;
}

function parseMonthDate(text: string): string | null {
  const months: Record<string, number> = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, august: 7, sep: 8, september: 8, oct: 9, october: 9,
    nov: 10, november: 10, dec: 11, december: 11,
  };

  const m = text.match(/(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[,]?\s+(20\d{2})/i);
  if (m) {
    const day = parseInt(m[1]);
    const month = months[m[2].toLowerCase().slice(0, 3)];
    const year = parseInt(m[3]);
    if (month !== undefined) {
      const d = new Date(year, month, day);
      return d.toISOString().slice(0, 10);
    }
  }

  const m2 = text.match(/(\d{1,2})[-\/](\d{1,2})[-\/](20\d{2})/);
  if (m2) {
    const d = new Date(parseInt(m2[3]), parseInt(m2[2]) - 1, parseInt(m2[1]));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  return null;
}

interface DiscoveredEvent {
  externalEventId: string;
  url: string;
  name: string;
  eventDate: string | null;
  venue: string | null;
  stateCode: string | null;
  countryCode: string;
  boatClassRaw: string | null;
  boatClassMapped: string | null;
  eventStatus: string;
  eventType: string;
}

function parseEventsListPage(html: string, baseUrl: string): DiscoveredEvent[] {
  const events: DiscoveredEvent[] = [];
  const seen = new Set<string>();
  const urlObj = new URL(baseUrl);
  const origin = urlObj.origin;

  const rowMatches = extractAllMatches(html, /<tr[^>]*>([\s\S]*?)<\/tr>/i);

  for (const rm of rowMatches) {
    const rowHtml = rm[1];
    const cells = extractAllMatches(rowHtml, /<td[^>]*>([\s\S]*?)<\/td>/i);
    if (cells.length < 4) continue;

    const linkMatch = rowHtml.match(/<a[^>]+href=["']([^"']*eventid=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    const href = linkMatch[1].replace(/&amp;/g, "&").replace(/&#38;/g, "&");
    const externalEventId = linkMatch[2];
    const linkText = stripTags(linkMatch[3]);

    if (seen.has(externalEventId)) continue;
    seen.add(externalEventId);

    let fullUrl = href;
    if (href.startsWith("//")) fullUrl = urlObj.protocol + href;
    else if (href.startsWith("/")) fullUrl = origin + href;
    else if (!href.startsWith("http")) fullUrl = origin + "/" + href;

    const dateCell = cells.length > 1 ? stripTags(cells[1][1]) : "";
    const venueCell = cells.length > 2 ? stripTags(cells[2][1]) : "";

    let eventDate = parseMonthDate(dateCell);
    let eventStatus: string = "active";
    if (/postponed/i.test(dateCell) || /postponed/i.test(rowHtml)) eventStatus = "postponed";
    if (/cancel/i.test(rowHtml)) eventStatus = "cancelled";

    const boatClassMapped = detectBoatClass(linkText);

    const imgMatch = rowHtml.match(/images\/logos\/(\d+)_\d+x\d+\.png/);
    let boatClassFromIcon: string | null = null;
    if (imgMatch) {
      boatClassFromIcon = CLASS_ICON_MAP[imgMatch[1]] || null;
    }

    const finalBoatClass = boatClassMapped || boatClassFromIcon;

    let stateCode: string | null = null;
    const stateCell = cells.length > 4 ? stripTags(cells[4][1]) : "";
    if (stateCell && STATE_ABBREVS.includes(stateCell.trim().toUpperCase())) {
      stateCode = stateCell.trim().toUpperCase();
    }
    if (!stateCode) stateCode = detectState(venueCell || linkText);

    const countryCell = cells.length > 5 ? stripTags(cells[5][1]) : "";
    const countryCode = countryCell.trim().toUpperCase() || "AUS";

    const eventType = detectEventType(linkText);

    events.push({
      externalEventId,
      url: fullUrl,
      name: linkText.replace(/EVENT CANCELLED\s*/i, "").trim() || `Event ${externalEventId}`,
      eventDate,
      venue: venueCell || null,
      stateCode,
      countryCode,
      boatClassRaw: finalBoatClass,
      boatClassMapped: finalBoatClass,
      eventStatus,
      eventType,
    });

    if (events.length >= MAX_EVENTS_PER_RUN) break;
  }

  return events;
}

interface EventDetail {
  eventName: string | null;
  eventDate: string | null;
  eventEndDate: string | null;
  venue: string | null;
  location: string | null;
  stateCode: string | null;
  boatClassRaw: string | null;
  boatClassMapped: string | null;
  eventType: string | null;
  eventStatus: string;
  rankingEvent: boolean;
  documents: Array<{ name: string; url: string }>;
  registrationUrl: string | null;
}

function parseEventDetailPage(html: string, baseUrl: string): EventDetail {
  const h3 = extractText(html, "h3");
  const h2 = extractText(html, "h2");
  const h1 = extractText(html, "h1");
  const eventName = h3 || h2 || h1 || null;

  let venue: string | null = null;
  let location: string | null = null;
  let eventDate: string | null = null;
  let eventEndDate: string | null = null;

  const greenBoxMatch = html.match(/<div[^>]*class="[^"]*event[_-]?(?:hero|banner|header|detail|info)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const heroSection = greenBoxMatch ? greenBoxMatch[1] : "";

  const textBlocks = stripTags(heroSection || html.slice(0, 5000)).split(/\n|<br\s*\/?>/i).map(s => s.trim()).filter(Boolean);

  for (const block of textBlocks) {
    if (!eventDate && parseMonthDate(block)) {
      eventDate = parseMonthDate(block);

      const rangeMatch = block.match(/(\d{1,2})\s*[-~]\s*(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[,]?\s+(20\d{2})/i);
      if (rangeMatch) {
        const months: Record<string, number> = {
          jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
          jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
        };
        const startDay = parseInt(rangeMatch[1]);
        const endDay = parseInt(rangeMatch[2]);
        const month = months[rangeMatch[3].toLowerCase().slice(0, 3)];
        const year = parseInt(rangeMatch[4]);
        if (month !== undefined) {
          eventDate = new Date(year, month, startDay).toISOString().slice(0, 10);
          eventEndDate = new Date(year, month, endDay).toISOString().slice(0, 10);
        }
      }
    }

    if (!venue && /club|yacht|sailing|marina/i.test(block) && block.length < 100) {
      venue = block;
    }

    if (!location && /,\s*(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)/i.test(block)) {
      location = block;
    }
  }

  const stateCode = detectState(location || venue || eventName || "");

  const boatClass = detectBoatClass(eventName || "");

  const fieldLabelMatches = extractAllMatches(html, /(?:Event\s*Class|Event\s*Type|Event\s*Status)\s*[:<]?\s*[^<]*?(?:<[^>]*>)?\s*([^<]+)/gi);
  let eventType: string | null = null;
  let rankingEvent = false;
  let eventStatus = "active";
  let detailBoatClass: string | null = null;

  const classMatch = html.match(/Event\s*Class[\s\S]{0,200}?<\/\w+>\s*(?:<\w+[^>]*>)?\s*([^<]+)/i);
  if (classMatch) {
    detailBoatClass = detectBoatClass(classMatch[1]) || classMatch[1].trim();
  }

  const typeMatch = html.match(/Event\s*Type[\s\S]{0,200}?<\/\w+>\s*(?:<\w+[^>]*>)?\s*([^<]+)/i);
  if (typeMatch) {
    const typeVal = typeMatch[1].trim().toLowerCase();
    if (typeVal.includes("national")) eventType = "national";
    else if (typeVal.includes("state")) eventType = "state";
    else if (typeVal.includes("world") || typeVal.includes("international")) eventType = "world";
    else if (typeVal.includes("invitational")) eventType = "invitational";
    else eventType = "state";
  }

  const statusMatch = html.match(/Event\s*Status[\s\S]{0,200}?<\/\w+>\s*(?:<\w+[^>]*>)?\s*([^<]+)/i);
  if (statusMatch) {
    const statusVal = statusMatch[1].trim().toLowerCase();
    if (statusVal.includes("ranking")) rankingEvent = true;
    if (statusVal.includes("cancel")) eventStatus = "cancelled";
    if (statusVal.includes("postpone")) eventStatus = "postponed";
  }

  if (/cancel/i.test(html.slice(0, 2000))) eventStatus = "cancelled";
  if (/postpone/i.test(html.slice(0, 2000)) && eventStatus === "active") eventStatus = "postponed";

  const documents: Array<{ name: string; url: string }> = [];
  const docTabMatch = html.match(/(?:document|download)[\s\S]{0,5000}/i);
  if (docTabMatch) {
    const docLinks = extractAllMatches(
      docTabMatch[0],
      /<a[^>]+href=["']([^"']+(?:\.pdf|\.doc|\.docx|\.xls|\.xlsx)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
    );
    for (const dl of docLinks) {
      let docUrl = dl[1].replace(/&amp;/g, "&");
      if (docUrl.startsWith("/")) docUrl = new URL(baseUrl).origin + docUrl;
      const docName = stripTags(dl[2]) || "Document";
      if (!documents.find(d => d.url === docUrl)) {
        documents.push({ name: docName, url: docUrl });
      }
    }
  }

  const docTextLinks = extractAllMatches(html, /<a[^>]+href=["']([^"']*(?:Notice|Sailing|document|Document)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi);
  for (const dl of docTextLinks) {
    let docUrl = dl[1].replace(/&amp;/g, "&");
    if (docUrl.startsWith("/")) docUrl = new URL(baseUrl).origin + docUrl;
    const docName = stripTags(dl[2]) || "Document";
    if (!documents.find(d => d.url === docUrl)) {
      documents.push({ name: docName, url: docUrl });
    }
  }

  const regMatch = html.match(/<a[^>]+href=["']([^"']*(?:registration|register|entry|enter)[^"']*)["']/i);
  const registrationUrl = regMatch ? regMatch[1].replace(/&amp;/g, "&") : null;

  return {
    eventName,
    eventDate,
    eventEndDate,
    venue,
    location,
    stateCode,
    boatClassRaw: detailBoatClass || boatClass,
    boatClassMapped: detailBoatClass ? (detectBoatClass(detailBoatClass) || detailBoatClass) : boatClass,
    eventType,
    eventStatus,
    rankingEvent,
    documents,
    registrationUrl,
  };
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "AlfiePRO-EventScraper/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let body: any = {};
    try { body = await req.json(); } catch { /* empty body ok */ }

    const { source_id, manual, event_row_id } = body;

    if (event_row_id) {
      const { data: eventRow, error: eventErr } = await supabase
        .from("external_events")
        .select("*")
        .eq("id", event_row_id)
        .maybeSingle();

      if (eventErr || !eventRow) {
        return new Response(JSON.stringify({ error: "Event not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const html = await fetchWithTimeout(eventRow.source_url, FETCH_TIMEOUT_MS);
      const detail = parseEventDetailPage(html, eventRow.source_url);

      const updates: Record<string, any> = { last_scraped_at: new Date().toISOString() };
      if (detail.eventName) updates.event_name = detail.eventName;
      if (detail.eventDate) updates.event_date = detail.eventDate;
      if (detail.eventEndDate) updates.event_end_date = detail.eventEndDate;
      if (detail.venue) updates.venue = detail.venue;
      if (detail.location) updates.location = detail.location;
      if (detail.stateCode) updates.state_code = detail.stateCode;
      if (detail.boatClassMapped) updates.boat_class_mapped = detail.boatClassMapped;
      if (detail.boatClassRaw) updates.boat_class_raw = detail.boatClassRaw;
      if (detail.eventType) updates.event_type = detail.eventType;
      updates.event_status = detail.eventStatus;
      updates.ranking_event = detail.rankingEvent;
      if (detail.documents.length > 0) updates.documents_json = detail.documents;
      if (detail.registrationUrl) updates.registration_url = detail.registrationUrl;

      await supabase.from("external_events").update(updates).eq("id", event_row_id);

      return new Response(JSON.stringify({ success: true, detail }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sources: any[];
    if (source_id) {
      const { data, error } = await supabase
        .from("external_event_sources")
        .select("*")
        .eq("id", source_id)
        .maybeSingle();
      if (error || !data) {
        return new Response(JSON.stringify({ error: "Source not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      sources = [data];
    } else {
      const { data, error } = await supabase
        .from("external_event_sources")
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      sources = data || [];
    }

    const results: any[] = [];

    for (const source of sources) {
      if (!manual && source.last_scraped_at) {
        const lastScraped = new Date(source.last_scraped_at).getTime();
        const cooldown = 55 * 60 * 1000;
        if (Date.now() - lastScraped < cooldown) {
          results.push({ source: source.name, skipped: true, reason: "Recently scraped" });
          continue;
        }
      }

      const { data: logRow } = await supabase
        .from("external_event_scrape_logs")
        .insert({ source_id: source.id, status: "running" })
        .select("id")
        .single();
      const logId = logRow?.id;

      try {
        const html = await fetchWithTimeout(source.url, FETCH_TIMEOUT_MS);
        const discovered = parseEventsListPage(html, source.url);

        let created = 0, updated = 0, skipped = 0;

        for (const evt of discovered) {
          const existing = await supabase
            .from("external_events")
            .select("id, event_status")
            .eq("source_id", source.id)
            .eq("external_event_id", evt.externalEventId)
            .maybeSingle();

          if (existing.data) {
            const updates: Record<string, any> = {
              event_name: evt.name,
              event_status: evt.eventStatus,
              updated_at: new Date().toISOString(),
            };
            if (evt.eventDate) updates.event_date = evt.eventDate;
            if (evt.venue) updates.venue = evt.venue;
            if (evt.stateCode) updates.state_code = evt.stateCode;
            if (evt.boatClassMapped) updates.boat_class_mapped = evt.boatClassMapped;
            updates.event_type = evt.eventType;

            await supabase.from("external_events").update(updates).eq("id", existing.data.id);
            updated++;
          } else {
            const { error: insertErr } = await supabase.from("external_events").insert({
              source_id: source.id,
              external_event_id: evt.externalEventId,
              event_name: evt.name,
              event_date: evt.eventDate,
              event_end_date: null,
              venue: null,
              location: evt.venue,
              state_code: evt.stateCode,
              country_code: evt.countryCode,
              boat_class_raw: evt.boatClassRaw,
              boat_class_mapped: evt.boatClassMapped,
              event_type: evt.eventType,
              event_status: evt.eventStatus,
              source_url: evt.url,
              display_category: source.display_category,
              is_visible: true,
            });
            if (insertErr) { skipped++; } else { created++; }
          }
        }

        const existingIds = discovered.map(e => e.externalEventId);
        if (existingIds.length > 0) {
          const { data: allExisting } = await supabase
            .from("external_events")
            .select("id, external_event_id")
            .eq("source_id", source.id);

          if (allExisting) {
            const removedEvents = allExisting.filter(
              e => e.external_event_id && !existingIds.includes(e.external_event_id)
            );
            for (const removed of removedEvents) {
              await supabase.from("external_events")
                .update({ is_visible: false, event_status: "cancelled" })
                .eq("id", removed.id);
            }
          }
        }

        const { count } = await supabase
          .from("external_events")
          .select("id", { count: "exact", head: true })
          .eq("source_id", source.id);

        await supabase
          .from("external_event_sources")
          .update({
            event_count: count || 0,
            last_scraped_at: new Date().toISOString(),
          })
          .eq("id", source.id);

        if (logId) {
          await supabase.from("external_event_scrape_logs").update({
            status: "success",
            completed_at: new Date().toISOString(),
            events_found: discovered.length,
            events_created: created,
            events_updated: updated,
            events_skipped: skipped,
          }).eq("id", logId);
        }

        results.push({
          source: source.name,
          found: discovered.length,
          created,
          updated,
          skipped,
        });

      } catch (err: any) {
        if (logId) {
          await supabase.from("external_event_scrape_logs").update({
            status: "error",
            completed_at: new Date().toISOString(),
            error_message: err.message?.slice(0, 1000) || "Unknown error",
          }).eq("id", logId);
        }
        results.push({ source: source.name, error: err.message });
      }
    }

    if (body.fetch_details) {
      const { data: eventsToFetch } = await supabase
        .from("external_events")
        .select("id, source_url")
        .is("venue", null)
        .eq("is_visible", true)
        .limit(20);

      if (eventsToFetch) {
        for (const evt of eventsToFetch) {
          try {
            await new Promise(r => setTimeout(r, DETAIL_FETCH_DELAY_MS));
            const html = await fetchWithTimeout(evt.source_url, FETCH_TIMEOUT_MS);
            const detail = parseEventDetailPage(html, evt.source_url);

            const updates: Record<string, any> = { last_scraped_at: new Date().toISOString() };
            if (detail.eventName) updates.event_name = detail.eventName;
            if (detail.eventDate) updates.event_date = detail.eventDate;
            if (detail.eventEndDate) updates.event_end_date = detail.eventEndDate;
            if (detail.venue) updates.venue = detail.venue;
            if (detail.location) updates.location = detail.location;
            if (detail.stateCode) updates.state_code = detail.stateCode;
            if (detail.boatClassMapped) updates.boat_class_mapped = detail.boatClassMapped;
            if (detail.boatClassRaw) updates.boat_class_raw = detail.boatClassRaw;
            if (detail.eventType) updates.event_type = detail.eventType;
            updates.event_status = detail.eventStatus;
            updates.ranking_event = detail.rankingEvent;
            if (detail.documents.length > 0) updates.documents_json = detail.documents;
            if (detail.registrationUrl) updates.registration_url = detail.registrationUrl;

            await supabase.from("external_events").update(updates).eq("id", evt.id);
          } catch {
            // skip individual event fetch errors
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
