import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BASE_URL = "https://radiosailing.org.au/";
const FETCH_TIMEOUT_MS = 20000;

const CATEGORY_MAP: Record<string, string> = {
  "international one metre": "yachts",
  "ten rater": "yachts",
  marblehead: "yachts",
  "a class": "yachts",
  df65: "yachts",
  df95: "yachts",
  "rc laser": "yachts",
  "radio/electrical": "electronics",
  "miscellaneous/other": "other",
};

const BOAT_CLASS_MAP: Record<string, string> = {
  "international one metre": "IOM",
  "ten rater": "10R",
  marblehead: "Marblehead",
  "a class": "A Class",
  df65: "DF65",
  df95: "DF95",
  "rc laser": "RC Laser",
};

function detectBoatClassFromText(text: string): string | null {
  const lower = text.toLowerCase();
  const keywords: Record<string, string> = {
    "international one metre": "IOM",
    iom: "IOM",
    "one metre": "IOM",
    proteus: "IOM",
    "ten rater": "10R",
    "10 rater": "10R",
    "10r": "10R",
    marblehead: "Marblehead",
    "a class": "A Class",
    df65: "DF65",
    "df 65": "DF65",
    "dragon force 65": "DF65",
    df95: "DF95",
    "df 95": "DF95",
    "dragon force 95": "DF95",
    "rc laser": "RC Laser",
    footy: "Footy",
    rg65: "RG65",
    "36r": "36R",
  };
  for (const [kw, mapped] of Object.entries(keywords)) {
    if (lower.includes(kw)) return mapped;
  }
  return null;
}

function stripTags(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function absoluteUrl(href: string): string {
  if (href.startsWith("http")) return href;
  if (href.startsWith("//")) return "https:" + href;
  if (href.startsWith("/")) return BASE_URL + href.slice(1);
  return BASE_URL + href;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AlfieScraper/1.0)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-AU,en;q=0.9",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

interface ListingLink {
  id: string;
  url: string;
  title: string;
}

function parseListPage(html: string): ListingLink[] {
  const links: ListingLink[] = [];
  const seen = new Set<string>();

  const pattern =
    /href=["']([^"']*arcade=classifieds-list[^"']*page=details[^"']*id=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null) {
    const id = m[2];
    if (seen.has(id)) continue;
    seen.add(id);
    const title = stripTags(m[3]);
    if (title.length < 3) continue;
    const href = m[1].replace(/&amp;/g, "&");
    links.push({ id, url: absoluteUrl(href), title });
  }

  const pattern2 =
    /href=["']([^"']*arcade=classifieds-list[^"']*id=(\d+)[^"']*page=details[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = pattern2.exec(html)) !== null) {
    const id = m[2];
    if (seen.has(id)) continue;
    seen.add(id);
    const title = stripTags(m[3]);
    if (title.length < 3) continue;
    const href = m[1].replace(/&amp;/g, "&");
    links.push({ id, url: absoluteUrl(href), title });
  }

  return links;
}

interface ParsedListing {
  title: string;
  description: string;
  price: number;
  location: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  images: string[];
  boatClass: string | null;
  category: string;
}

function parseDetailPage(html: string, fallbackTitle: string): ParsedListing | null {
  try {
    let title = fallbackTitle;
    const h3Match = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const h5Matches: string[] = [];
    const h5Pattern = /<h5[^>]*>([\s\S]*?)<\/h5>/gi;
    let h5m: RegExpExecArray | null;
    while ((h5m = h5Pattern.exec(html)) !== null) {
      h5Matches.push(stripTags(h5m[1]));
    }

    if (h3Match) {
      const t = stripTags(h3Match[1]);
      if (t.length > 3) title = t;
    }

    let price = 0;
    const priceMatch =
      html.match(/\$\s*([\d,]+(?:\.\d{2})?)/i) ||
      html.match(/Price[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i);
    if (priceMatch) {
      price = parseFloat(priceMatch[1].replace(/,/g, "")) || 0;
    }

    let location = "";
    for (const h5 of h5Matches) {
      if (
        h5.match(
          /\((?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT|NZ)?\)/i
        ) ||
        h5.match(/[A-Za-z\s]+\(/) ||
        h5.match(
          /(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT|NZ)/i
        )
      ) {
        location = h5.trim();
        break;
      }
    }

    let contactName = "";
    let contactEmail = "";
    let contactPhone = "";

    const contactMatch = html.match(
      /<strong>\s*Contact\s*<\/strong>\s*(?:<br\s*\/?>)?\s*([^<\n]+)/i
    );
    if (contactMatch) contactName = stripTags(contactMatch[1]).trim();

    const emailMatch = html.match(
      /mailto:([^"'\s<>]+)/i
    );
    if (emailMatch) contactEmail = emailMatch[1].trim();
    if (!contactEmail) {
      const emailMatch2 = html.match(
        /<strong>\s*Email\s*<\/strong>\s*(?:<br\s*\/?>)?\s*([^<\n]+)/i
      );
      if (emailMatch2) contactEmail = stripTags(emailMatch2[1]).trim();
    }

    const phoneMatch = html.match(
      /<strong>\s*Phone\s*<\/strong>\s*(?:<br\s*\/?>)?\s*([^<\n]+)/i
    );
    if (phoneMatch) contactPhone = stripTags(phoneMatch[1]).trim();

    const images: string[] = [];
    const imgPattern =
      /classifieds\/(?:uploaded_images|thumbnails)\/([^"'\s]+\.(?:jpg|jpeg|png|gif|webp))/gi;
    const seenImgs = new Set<string>();
    let imgM: RegExpExecArray | null;
    while ((imgM = imgPattern.exec(html)) !== null) {
      const filename = imgM[1];
      if (seenImgs.has(filename)) continue;
      seenImgs.add(filename);
      images.push(absoluteUrl("classifieds/uploaded_images/" + filename));
    }

    const descCandidates: string[] = [];
    const pPattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let pM: RegExpExecArray | null;
    while ((pM = pPattern.exec(html)) !== null) {
      const text = stripTags(pM[1]).trim();
      if (text.length < 20) continue;
      if (/^Price:/i.test(text)) continue;
      if (/^Contact\b/i.test(text)) continue;
      if (/^Email\b/i.test(text)) continue;
      if (/^Phone\b/i.test(text)) continue;
      if (/select category/i.test(text)) continue;
      descCandidates.push(text);
    }
    let description = descCandidates.join("\n\n").trim();
    if (!description) description = title;

    const selectMatch = html.match(
      /<select[^>]*id=["']?category_select["']?[^>]*>([\s\S]*?)<\/select>/i
    );
    let detectedCategory = "other";
    let detectedBoatClass: string | null = null;

    if (selectMatch) {
      const selectedMatch = selectMatch[1].match(
        /<option[^>]*selected[^>]*>([\s\S]*?)<\/option>/i
      );
      if (selectedMatch) {
        const catName = stripTags(selectedMatch[1]).trim().toLowerCase();
        if (catName && catName !== "show all adverts") {
          detectedCategory = CATEGORY_MAP[catName] || "yachts";
          detectedBoatClass = BOAT_CLASS_MAP[catName] || null;
        }
      }
    }

    if (!detectedBoatClass) {
      detectedBoatClass = detectBoatClassFromText(title + " " + description);
    }

    if (detectedBoatClass && detectedCategory === "other") {
      detectedCategory = "yachts";
    }

    return {
      title,
      description,
      price,
      location,
      contactName,
      contactEmail,
      contactPhone,
      images,
      boatClass: detectedBoatClass,
      category: detectedCategory,
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

    const body =
      req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const { source_id } = body as { source_id?: string };

    let query = supabase
      .from("classified_scrape_sources")
      .select("id, name, url")
      .eq("is_active", true);
    if (source_id) query = query.eq("id", source_id);

    const { data: sources, error: sourcesErr } = await query;
    if (sourcesErr) throw sourcesErr;
    if (!sources || sources.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active sources" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: adminUser } = await supabase
      .from("user_clubs")
      .select("user_id")
      .in("role", ["super_admin", "admin"])
      .limit(1)
      .maybeSingle();
    const systemUserId = adminUser?.user_id;
    if (!systemUserId) {
      return new Response(
        JSON.stringify({ error: "No admin user found to own scraped listings" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{
      source: string;
      found: number;
      created: number;
      updated: number;
      removed: number;
      error?: string;
    }> = [];

    for (const source of sources) {
      const { data: logRow } = await supabase
        .from("classified_scrape_logs")
        .insert({ source_id: source.id, status: "running" })
        .select("id")
        .single();
      const logId = logRow?.id as string | undefined;

      let listingsFound = 0;
      let listingsCreated = 0;
      let listingsUpdated = 0;
      let listingsRemoved = 0;

      try {
        const indexHtml = await fetchHtml(source.url);
        if (!indexHtml) throw new Error("Failed to fetch index page");

        const listingLinks = parseListPage(indexHtml);
        listingsFound = listingLinks.length;

        if (listingsFound === 0) {
          throw new Error("No listing links found on index page");
        }

        const currentExternalIds = new Set(listingLinks.map((l) => l.id));

        for (const link of listingLinks) {
          const externalSourceId = `arya_${link.id}`;

          const { data: existing } = await supabase
            .from("classifieds")
            .select("id, title, price, description, images, updated_at")
            .eq("external_source_id", externalSourceId)
            .eq("is_scraped", true)
            .maybeSingle();

          const detailHtml = await fetchHtml(link.url);
          if (!detailHtml) {
            continue;
          }

          const parsed = parseDetailPage(detailHtml, link.title);
          if (!parsed) {
            continue;
          }

          if (existing) {
            const hasChanges =
              existing.title !== parsed.title ||
              existing.price !== parsed.price ||
              existing.description !== parsed.description;

            if (hasChanges) {
              await supabase
                .from("classifieds")
                .update({
                  title: parsed.title,
                  description: parsed.description,
                  price: parsed.price,
                  location: parsed.location || existing.title,
                  images: parsed.images.length > 0 ? parsed.images : existing.images,
                  external_contact_name: parsed.contactName || undefined,
                  external_contact_email: parsed.contactEmail || undefined,
                  external_contact_phone: parsed.contactPhone || undefined,
                  contact_email: parsed.contactEmail || "scraped@alfiepro.com",
                  boat_class: parsed.boatClass || undefined,
                  category: parsed.category,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", existing.id);
              listingsUpdated++;
            }
          } else {
            await supabase.from("classifieds").insert({
              title: parsed.title,
              description: parsed.description,
              price: parsed.price,
              location: parsed.location || "Australia",
              category: parsed.category,
              condition: "used",
              images: parsed.images,
              contact_email: parsed.contactEmail || "scraped@alfiepro.com",
              contact_phone: parsed.contactPhone || null,
              user_id: systemUserId,
              status: "active",
              is_public: true,
              is_external: true,
              is_scraped: true,
              external_contact_name: parsed.contactName || null,
              external_contact_email: parsed.contactEmail || null,
              external_contact_phone: parsed.contactPhone || null,
              created_by_user_id: systemUserId,
              source_url: link.url,
              external_source_id: `arya_${link.id}`,
              boat_class: parsed.boatClass || null,
            });
            listingsCreated++;
          }

          await new Promise((r) => setTimeout(r, 500));
        }

        const { data: allScraped } = await supabase
          .from("classifieds")
          .select("id, external_source_id")
          .eq("is_scraped", true)
          .like("external_source_id", "arya_%");

        if (allScraped) {
          for (const scraped of allScraped) {
            const aryaId = scraped.external_source_id?.replace("arya_", "");
            if (aryaId && !currentExternalIds.has(aryaId)) {
              await supabase
                .from("classifieds")
                .delete()
                .eq("id", scraped.id);
              listingsRemoved++;
            }
          }
        }

        const { count: totalCount } = await supabase
          .from("classifieds")
          .select("*", { count: "exact", head: true })
          .eq("is_scraped", true)
          .like("external_source_id", "arya_%");

        await supabase
          .from("classified_scrape_sources")
          .update({
            last_scraped_at: new Date().toISOString(),
            listing_count: totalCount ?? 0,
            updated_at: new Date().toISOString(),
          })
          .eq("id", source.id);

        if (logId) {
          await supabase
            .from("classified_scrape_logs")
            .update({
              completed_at: new Date().toISOString(),
              listings_found: listingsFound,
              listings_created: listingsCreated,
              listings_updated: listingsUpdated,
              listings_removed: listingsRemoved,
              status: "success",
            })
            .eq("id", logId);
        }

        results.push({
          source: source.name,
          found: listingsFound,
          created: listingsCreated,
          updated: listingsUpdated,
          removed: listingsRemoved,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (logId) {
          await supabase
            .from("classified_scrape_logs")
            .update({
              completed_at: new Date().toISOString(),
              status: "error",
              error_message: msg,
            })
            .eq("id", logId);
        }
        results.push({
          source: source.name,
          found: listingsFound,
          created: 0,
          updated: 0,
          removed: 0,
          error: msg,
        });
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
