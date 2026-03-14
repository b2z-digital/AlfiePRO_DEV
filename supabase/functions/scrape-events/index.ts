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
  documents: Array<{ name: string; url: string; type?: string }>;
  registrationUrl: string | null;
  websiteUrl: string | null;
}

function makeAbsoluteUrl(url: string, origin: string): string {
  const cleaned = url.replace(/&amp;/g, "&").replace(/&#38;/g, "&");
  if (cleaned.startsWith("http")) return cleaned;
  if (cleaned.startsWith("//")) return "https:" + cleaned;
  if (cleaned.startsWith("/")) return origin + cleaned;
  return origin + "/" + cleaned;
}

function classifyDocType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("amendment")) return "amendment";
  if (lower.includes("notice of race") || lower.includes("nor")) return "nor";
  if (lower.includes("sailing instruction") || lower.includes("si ") || lower === "si") return "si";
  return "document";
}

function extractDocumentsFromHtml(html: string, origin: string): Array<{ name: string; url: string; type?: string }> {
  const documents: Array<{ name: string; url: string; type?: string }> = [];

  const allLinks = extractAllMatches(
    html,
    /<a[^>]+href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
  );

  for (const dl of allLinks) {
    const href = dl[1];
    const linkText = stripTags(dl[2]);
    const lower = linkText.toLowerCase();
    const hrefLower = href.toLowerCase();

    const isDocFile = /\.(?:pdf|doc|docx|xls|xlsx)(?:\?|$|#)/i.test(href);
    const isDocText =
      lower.includes("notice of race") ||
      lower.includes("sailing instruction") ||
      lower.includes("amendment to notice") ||
      lower.includes("amendment to sailing") ||
      lower.includes("supplementary") ||
      lower.includes("nor ") || lower === "nor" ||
      (lower.includes("si ") && !lower.includes("site")) || lower === "si";

    if (isDocFile || isDocText) {
      const docUrl = makeAbsoluteUrl(href, origin);
      const docName = linkText || "Document";
      if (!documents.find(d => d.url === docUrl) && docUrl.length > 10) {
        documents.push({ name: docName, url: docUrl, type: classifyDocType(docName) });
      }
    }
  }

  return documents;
}

function extractRegistrationFromHtml(html: string, origin: string): string | null {
  const enterBtnMatch = html.match(/<a[^>]+href=["']([^"']*)["'][^>]*>[\s\S]*?(?:Enter\s*Online|Enter\s*Now|Register\s*Now|Register\s*Online|Enter\s*Event|ENTER\s*HERE)[\s\S]*?<\/a>/i);
  if (enterBtnMatch) {
    return makeAbsoluteUrl(enterBtnMatch[1], origin);
  }

  const entryLinkMatch = html.match(/<a[^>]+href=["']([^"']*(?:event-entry|event_entry)[^"']*)["']/i);
  if (entryLinkMatch) {
    return makeAbsoluteUrl(entryLinkMatch[1], origin);
  }

  const regLinkMatch = html.match(/<a[^>]+href=["']([^"']*(?:registration|register)[^"']*)["']/i);
  if (regLinkMatch) {
    return makeAbsoluteUrl(regLinkMatch[1], origin);
  }

  return null;
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
  const origin = new URL(baseUrl).origin;

  const headerHtml = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const textChunks = headerHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:div|p|h[1-6]|td|th|li|span|a|strong|em|b|i)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#\d+;/g, "")
    .split("\n")
    .map(s => s.replace(/\s+/g, " ").trim())
    .filter(s => s.length > 2 && s.length < 200);

  for (const chunk of textChunks) {
    if (!eventDate) {
      const months: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
      };
      const monthPattern = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";

      const fullRangeMatch = chunk.match(new RegExp(`(\\d{1,2})\\s+${monthPattern}[,.]?\\s*(20\\d{2})\\s*[-–]\\s*(\\d{1,2})\\s+(${monthPattern})[,.]?\\s*(20\\d{2})`, "i"));
      if (fullRangeMatch) {
        const startMonth = months[chunk.match(new RegExp(`\\d{1,2}\\s+(${monthPattern})`, "i"))![1].toLowerCase().slice(0, 3)];
        const endMonth = months[fullRangeMatch[4].toLowerCase().slice(0, 3)];
        if (startMonth !== undefined && endMonth !== undefined) {
          eventDate = new Date(parseInt(fullRangeMatch[2]), startMonth, parseInt(fullRangeMatch[1])).toISOString().slice(0, 10);
          eventEndDate = new Date(parseInt(fullRangeMatch[5]), endMonth, parseInt(fullRangeMatch[3])).toISOString().slice(0, 10);
        }
      }

      if (!eventDate) {
        const shortRangeMatch = chunk.match(new RegExp(`(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})\\s+(${monthPattern})[,.]?\\s*(20\\d{2})`, "i"));
        if (shortRangeMatch) {
          const month = months[shortRangeMatch[3].toLowerCase().slice(0, 3)];
          if (month !== undefined) {
            eventDate = new Date(parseInt(shortRangeMatch[4]), month, parseInt(shortRangeMatch[1])).toISOString().slice(0, 10);
            eventEndDate = new Date(parseInt(shortRangeMatch[4]), month, parseInt(shortRangeMatch[2])).toISOString().slice(0, 10);
          }
        }
      }

      if (!eventDate) {
        const singleDate = parseMonthDate(chunk);
        if (singleDate) eventDate = singleDate;
      }
    }

    if (!venue && /(?:yacht|sailing|radio|model|rc)\s*(?:club|squadron)/i.test(chunk) && chunk !== eventName) {
      venue = chunk;
    }

    if (!location && /,\s*(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\s*(?:,?\s*AUS)?/i.test(chunk) && chunk !== eventName) {
      let loc = chunk;
      if (eventName && loc.startsWith(eventName)) loc = loc.slice(eventName.length).trim();
      if (loc.length > 3) location = loc;
    }
  }

  if (!venue && location) venue = location;

  const stateCode = detectState(location || venue || eventName || "");
  const boatClass = detectBoatClass(eventName || "");

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

  const documents = extractDocumentsFromHtml(html, origin);
  const registrationUrl = extractRegistrationFromHtml(html, origin);

  let websiteUrl: string | null = null;
  const websiteMatch = html.match(/<a[^>]+href=["']([^"']*)["'][^>]*>[\s\S]*?(?:Event\s*Website|Official\s*Website|Website|Visit\s*Website)[\s\S]*?<\/a>/i);
  if (websiteMatch) {
    websiteUrl = makeAbsoluteUrl(websiteMatch[1], origin);
  }

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
    websiteUrl,
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

function getEventTabUrl(sourceUrl: string, tabName: string): string | null {
  const eventIdMatch = sourceUrl.match(/eventid=(\d+)/i);
  if (!eventIdMatch) return null;
  const eventId = eventIdMatch[1];
  const urlObj = new URL(sourceUrl);
  return `${urlObj.origin}/index.php?arcade=event-${tabName}&eventid=${eventId}`;
}

async function fetchEventSubPages(sourceUrl: string, detail: EventDetail): Promise<void> {
  const origin = new URL(sourceUrl).origin;

  const docsTabUrl = getEventTabUrl(sourceUrl, "documents");
  if (docsTabUrl) {
    try {
      const docsHtml = await fetchWithTimeout(docsTabUrl, FETCH_TIMEOUT_MS);
      const tabDocs = extractDocumentsFromHtml(docsHtml, origin);
      if (tabDocs.length > 0) {
        detail.documents = tabDocs;
      }
    } catch { /* documents tab fetch failed, keep main page docs */ }
  }

  const regTabUrl = getEventTabUrl(sourceUrl, "registration");
  if (regTabUrl) {
    try {
      const regHtml = await fetchWithTimeout(regTabUrl, FETCH_TIMEOUT_MS);
      const regUrl = extractRegistrationFromHtml(regHtml, origin);
      if (regUrl) {
        detail.registrationUrl = regUrl;
      } else {
        const entryUrl = getEventTabUrl(sourceUrl, "entry");
        if (entryUrl) {
          detail.registrationUrl = entryUrl;
        }
      }
    } catch { /* registration tab fetch failed */ }
  }

  if (!detail.registrationUrl) {
    detail.registrationUrl = sourceUrl;
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

    const STATE_CODE_TO_FULL: Record<string, string[]> = {
      "NSW": ["NSW", "New South Wales"],
      "VIC": ["Victoria"],
      "QLD": ["Queensland"],
      "SA": ["South Australia"],
      "WA": ["Western Australia"],
      "TAS": ["Tasmania"],
      "NT": ["Northern Territory"],
      "ACT": ["Canberra", "ACT", "Australian Capital Territory"],
    };

    const { data: stateAssocs } = await supabase
      .from("state_associations")
      .select("id, state, abbreviation");

    const stateCodeToAssocId: Record<string, string> = {};
    if (stateAssocs) {
      for (const sa of stateAssocs) {
        for (const [code, names] of Object.entries(STATE_CODE_TO_FULL)) {
          if (names.some(n => n.toLowerCase() === sa.state?.toLowerCase())) {
            stateCodeToAssocId[code] = sa.id;
          }
        }
      }
    }

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
      await fetchEventSubPages(eventRow.source_url, detail);

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
      updates.documents_json = detail.documents;
      updates.registration_url = detail.registrationUrl || detail.websiteUrl;

      const resolvedState = detail.stateCode || eventRow.state_code;
      const resolvedType = detail.eventType || eventRow.event_type;
      if (resolvedType === 'state' && resolvedState && stateCodeToAssocId[resolvedState]) {
        updates.display_category = `state_${stateCodeToAssocId[resolvedState]}`;
      }

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
            if (evt.stateCode) updates.state_code = evt.stateCode;
            if (evt.boatClassMapped) updates.boat_class_mapped = evt.boatClassMapped;
            updates.event_type = evt.eventType;

            if (evt.eventType === 'state' && evt.stateCode && stateCodeToAssocId[evt.stateCode]) {
              updates.display_category = `state_${stateCodeToAssocId[evt.stateCode]}`;
            }

            await supabase.from("external_events").update(updates).eq("id", existing.data.id);
            updated++;
          } else {
            let eventDisplayCategory = source.display_category;
            if (evt.eventType === 'state' && evt.stateCode && stateCodeToAssocId[evt.stateCode]) {
              eventDisplayCategory = `state_${stateCodeToAssocId[evt.stateCode]}`;
            }

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
              display_category: eventDisplayCategory,
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
        .select("id, source_url, state_code, event_type")
        .eq("is_visible", true)
        .limit(50);

      if (eventsToFetch) {
        for (const evt of eventsToFetch) {
          try {
            await new Promise(r => setTimeout(r, DETAIL_FETCH_DELAY_MS));
            const html = await fetchWithTimeout(evt.source_url, FETCH_TIMEOUT_MS);
            const detail = parseEventDetailPage(html, evt.source_url);
            await fetchEventSubPages(evt.source_url, detail);

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
            updates.documents_json = detail.documents;
            updates.registration_url = detail.registrationUrl || detail.websiteUrl;

            const resolvedState = detail.stateCode || evt.state_code;
            const resolvedType = detail.eventType || evt.event_type;
            if (resolvedType === 'state' && resolvedState && stateCodeToAssocId[resolvedState]) {
              updates.display_category = `state_${stateCodeToAssocId[resolvedState]}`;
            }

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
