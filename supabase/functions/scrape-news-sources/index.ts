import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ScrapeSource {
  id: string;
  name: string;
  url: string;
  target_type: "state" | "national" | "all_states";
  target_national_association_id: string | null;
  target_state_association_id: string | null;
}

interface ScrapedArticle {
  title: string;
  content: string;
  excerpt: string;
  cover_image: string | null;
  original_url: string;
  published_at: string;
}

// ─── HTML utility helpers ────────────────────────────────────────────────────

function absoluteUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Extract value of a named capture from a regex against a string
function firstMatch(pattern: RegExp, html: string, group = 1): string | null {
  const m = pattern.exec(html);
  return m ? m[group].trim() : null;
}

// Pull all regex matches into an array
function allMatches(pattern: RegExp, html: string, group = 1): string[] {
  const results: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  while ((m = re.exec(html)) !== null) {
    results.push(m[group].trim());
  }
  return results;
}

// ─── News article link detection ────────────────────────────────────────────

interface ArticleLink {
  href: string;
  title: string;
  date: string | null;
  thumbnail: string | null;
}

/**
 * Detects which URL pattern this source uses and returns
 * a list of article page URLs with any metadata available on the index page.
 */
function detectArticleLinks(html: string, baseUrl: string): ArticleLink[] {
  const base = new URL(baseUrl);
  const links: ArticleLink[] = [];
  const seen = new Set<string>();

  // ── Strategy 1: CMS Maker / CMSMS sites (radiosailing.org.au pattern)
  // href="index.php?mact=News,cntnt01,detail,0&cntnt01articleid=NNN..."
  const cmsNewsPattern = /href=["']([^"']*mact=News[^"']*detail[^"']*cntnt01articleid=\d+[^"']*)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = cmsNewsPattern.exec(html)) !== null) {
    const href = absoluteUrl(baseUrl, m[1].replace(/&amp;/g, "&"));
    if (!seen.has(href)) {
      seen.add(href);
      links.push({ href, title: "", date: null, thumbnail: null });
    }
  }
  if (links.length > 0) {
    // Try to enrich with surrounding h5 title & date text
    // The page HTML has: <h5>Title</h5><p>excerpt</p><p>Posted: date</p> near the link
    enrichCmsMakerLinks(links, html, baseUrl);
    return links;
  }

  // ── Strategy 2: WordPress / common blog patterns
  // <article ...><a href="...">...</a></article>
  const articleBlocks = html.match(/<article[^>]*>[\s\S]*?<\/article>/gi) || [];
  for (const block of articleBlocks) {
    const href = firstMatch(/href=["']([^"']+)["']/, block);
    if (!href) continue;
    const abs = absoluteUrl(baseUrl, href);
    if (seen.has(abs) || new URL(abs).hostname !== base.hostname) continue;
    seen.add(abs);
    const title = firstMatch(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i, block);
    const dateRaw = firstMatch(/datetime=["']([^"']+)["']/, block)
      || firstMatch(/<time[^>]*>([\s\S]*?)<\/time>/i, block);
    const img = firstMatch(/<img[^>]*src=["']([^"']+)["'][^>]*>/i, block);
    links.push({
      href: abs,
      title: title ? stripTags(title) : "",
      date: dateRaw,
      thumbnail: img ? absoluteUrl(baseUrl, img) : null,
    });
  }
  if (links.length > 0) return links;

  // ── Strategy 3: Generic — find links that look like article permalinks
  const genericPattern = /href=["']([^"'#?][^"']*(?:\/\d{4}\/|\/news\/|\/article\/|\/post\/|\/blog\/)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = genericPattern.exec(html)) !== null) {
    const href = absoluteUrl(baseUrl, m[1]);
    const linkText = stripTags(m[2]);
    if (seen.has(href) || new URL(href).hostname !== base.hostname) continue;
    if (linkText.length < 10) continue;
    seen.add(href);
    links.push({ href, title: linkText, date: null, thumbnail: null });
  }

  return links;
}

/**
 * For CMS Maker sites (radiosailing.org.au), the index page lists articles as:
 *   <h5><a href="...">Title</a></h5>
 *   <p>Excerpt</p>
 *   <p>Posted: DD Mon YYYY HH:MM</p>
 * We parse those blocks to enrich our link list with titles & dates.
 */
function enrichCmsMakerLinks(links: ArticleLink[], html: string, baseUrl: string) {
  // Split on <h5> blocks
  const blocks = html.split(/<h5>/i);
  for (const block of blocks) {
    // Extract the href inside this block
    const hrefM = /href=["']([^"']*mact=News[^"']*detail[^"']*cntnt01articleid=\d+[^"']*)["']/i.exec(block);
    if (!hrefM) continue;
    const href = absoluteUrl(baseUrl, hrefM[1].replace(/&amp;/g, "&"));
    const link = links.find(l => l.href === href);
    if (!link) continue;

    // Title: text inside <a>...</a> within the h5
    const titleM = /<a[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (titleM) link.title = stripTags(titleM[1]);

    // Date: "Posted: DD Mon YYYY HH:MM" pattern
    const dateM = /Posted:\s*([A-Za-z]+ \d{1,2},?\s*\d{4}[\s\d:]*)/i.exec(block)
      || /Posted:\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4}[\s\d:]*)/i.exec(block);
    if (dateM) link.date = dateM[1].trim();
  }
}

// ─── Individual article page scraper ────────────────────────────────────────

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AlfieScraper/1.0; +https://alfiepro.app)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-AU,en;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractArticleTitle(html: string): string {
  // og:title first
  const og = firstMatch(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i, html)
    || firstMatch(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i, html);
  if (og && og.length > 5) return og;

  // CMS Maker: article title is in <h3> inside the content div
  const h3 = firstMatch(/<h3[^>]*>([\s\S]*?)<\/h3>/i, html);
  if (h3) { const t = stripTags(h3); if (t.length > 5) return t; }

  const h1 = firstMatch(/<h1[^>]*>([\s\S]*?)<\/h1>/i, html);
  if (h1) { const t = stripTags(h1); if (t.length > 5) return t; }

  const h2 = firstMatch(/<h2[^>]*>([\s\S]*?)<\/h2>/i, html);
  if (h2) { const t = stripTags(h2); if (t.length > 5) return t; }

  // <title> tag fallback — strip site name
  const title = firstMatch(/<title[^>]*>([\s\S]*?)<\/title>/i, html);
  if (title) {
    return title.split(/[|\-–—]/)[0].trim();
  }
  return "";
}

function extractPublishedDate(html: string, hintDate: string | null): string {
  // og / schema dates
  const patterns = [
    /<meta[^>]*property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']article:published_time["']/i,
    /<time[^>]*datetime=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]*name=["']date["'][^>]*content=["']([^"']+)["']/i,
  ];
  for (const p of patterns) {
    const m = p.exec(html);
    if (m) {
      try { return new Date(m[1]).toISOString(); } catch { /* continue */ }
    }
  }

  // CMS Maker: "Posted: Mar 11, 2026 18:52" or similar
  const postedM = /Posted:\s*([A-Za-z]+ \d{1,2},?\s*\d{4}(?:\s+\d{1,2}:\d{2})?)/i.exec(html)
    || /Posted:\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4}(?:\s+\d{1,2}:\d{2})?)/i.exec(html);
  if (postedM) {
    try { return new Date(postedM[1]).toISOString(); } catch { /* continue */ }
  }

  // Use hint date from index page
  if (hintDate) {
    try { return new Date(hintDate).toISOString(); } catch { /* continue */ }
  }

  return new Date().toISOString();
}

function extractCoverImage(html: string, baseUrl: string): string | null {
  // og:image is most reliable
  const og = firstMatch(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i, html)
    || firstMatch(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i, html);
  if (og && !og.startsWith("data:")) return absoluteUrl(baseUrl, og);

  const twitter = firstMatch(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i, html);
  if (twitter && !twitter.startsWith("data:")) return absoluteUrl(baseUrl, twitter);

  // Article body images — skip tiny icons, logos, tracking pixels
  const imgSrcs = allMatches(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, html);
  for (const src of imgSrcs) {
    if (src.startsWith("data:")) continue;
    if (/logo|icon|avatar|banner|button|pixel|tracking|sprite|rss|social|facebook|twitter/i.test(src)) continue;
    const abs = absoluteUrl(baseUrl, src);
    // Prefer .jpg/.jpeg/.png/.webp
    if (/\.(jpe?g|png|webp|jfif)/i.test(abs)) return abs;
  }

  return null;
}

function extractMainContent(html: string): string {
  // CMS Maker: content sits inside div with class containing "cntnt01" or "cmsmasters_post_content"
  const cmsContent = /<div[^>]*class=["'][^"']*cntnt01[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(html);
  if (cmsContent && cmsContent[1].length > 100) return cmsContent[1];

  // WordPress: .entry-content, .post-content, .article-content
  const wpContent = /<div[^>]*class=["'][^"']*(?:entry|post|article|single)[_-]content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(html);
  if (wpContent && wpContent[1].length > 100) return wpContent[1];

  // <article> tag
  const articleTag = /<article[^>]*>([\s\S]*?)<\/article>/i.exec(html);
  if (articleTag && articleTag[1].length > 100) return articleTag[1];

  // <main> tag
  const mainTag = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html);
  if (mainTag && mainTag[1].length > 100) return mainTag[1];

  // Largest <div> block heuristic
  let best = "";
  const divPattern = /<div[^>]*>([\s\S]*?)<\/div>/gi;
  let m: RegExpExecArray | null;
  while ((m = divPattern.exec(html)) !== null) {
    const text = stripTags(m[1]);
    if (text.length > best.length && text.length > 200) best = m[1];
  }
  return best || html;
}

async function scrapeArticlePage(url: string, hintTitle: string, hintDate: string | null): Promise<ScrapedArticle | null> {
  const html = await fetchHtml(url);
  if (!html) return null;

  const title = extractArticleTitle(html) || hintTitle;
  if (!title || title.length < 5) return null;

  const publishedAt = extractPublishedDate(html, hintDate);
  const coverImage = extractCoverImage(html, url);
  const contentRaw = extractMainContent(html);
  const plainText = stripTags(contentRaw);
  if (plainText.length < 30) return null;

  const excerpt = plainText.substring(0, 400).replace(/\s+/g, " ").trim();

  // Clean content HTML
  const content = contentRaw
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .trim()
    .substring(0, 60000);

  return { title, content, excerpt, cover_image: coverImage, original_url: url, published_at: publishedAt };
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const { source_id } = body as { source_id?: string };

    let query = supabase
      .from("news_scrape_sources")
      .select("id, name, url, target_type, target_national_association_id, target_state_association_id")
      .eq("is_active", true);
    if (source_id) query = query.eq("id", source_id);

    const { data: sources, error: sourcesErr } = await query;
    if (sourcesErr) throw sourcesErr;
    if (!sources || sources.length === 0) {
      return new Response(JSON.stringify({ message: "No active sources" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ source: string; created: number; skipped: number; error?: string }> = [];

    for (const source of sources as ScrapeSource[]) {
      // Insert run log
      const { data: logRow } = await supabase
        .from("news_scrape_logs")
        .insert({ source_id: source.id, status: "running" })
        .select("id")
        .single();
      const logId = logRow?.id as string | undefined;

      let articlesCreated = 0;
      let articlesSkipped = 0;

      try {
        // ── 1. Fetch & parse index page
        const indexHtml = await fetchHtml(source.url);
        if (!indexHtml) throw new Error("Failed to fetch index page");

        const articleLinks = detectArticleLinks(indexHtml, source.url);
        // Deduplicate and cap at 50 per run
        const unique = [...new Map(articleLinks.map(l => [l.href, l])).values()].slice(0, 50);

        if (unique.length === 0) throw new Error("No article links found on index page — the scraper may need a custom selector for this site");

        // ── 2. Determine publish targets
        const targets: Array<{ state_association_id?: string; national_association_id?: string }> = [];
        if (source.target_type === "national" && source.target_national_association_id) {
          targets.push({ national_association_id: source.target_national_association_id });
        } else if (source.target_type === "state" && source.target_state_association_id) {
          targets.push({ state_association_id: source.target_state_association_id });
        } else if (source.target_type === "all_states" && source.target_national_association_id) {
          const { data: stateRows } = await supabase
            .from("state_associations")
            .select("id")
            .eq("national_association_id", source.target_national_association_id);
          for (const s of stateRows ?? []) targets.push({ state_association_id: s.id });
        }

        // ── 3. Scrape each article
        for (const link of unique) {
          // Check global dedup (same URL, any target)
          const { data: existing } = await supabase
            .from("articles")
            .select("id")
            .eq("scraped_url", link.href)
            .maybeSingle();
          if (existing) { articlesSkipped++; continue; }

          const article = await scrapeArticlePage(link.href, link.title, link.date);
          if (!article || article.title.length < 5) { articlesSkipped++; continue; }

          for (const target of targets) {
            await supabase.from("articles").insert({
              title: article.title,
              content: article.content,
              excerpt: article.excerpt,
              cover_image: article.cover_image,
              status: "published",
              published_at: article.published_at,
              scraped_url: link.href,
              is_scraped: true,
              ...target,
            });
          }
          articlesCreated++;

          // Polite delay between article fetches
          await new Promise(r => setTimeout(r, 800));
        }

        // ── 4. Update log & source metadata
        if (logId) {
          await supabase.from("news_scrape_logs").update({
            completed_at: new Date().toISOString(),
            articles_found: unique.length,
            articles_created: articlesCreated,
            articles_skipped: articlesSkipped,
            status: "success",
          }).eq("id", logId);
        }
        await supabase.from("news_scrape_sources").update({
          last_scraped_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", source.id);
        await supabase.rpc("increment_scrape_source_count", {
          p_source_id: source.id,
          p_increment: articlesCreated,
        }).catch(() => {});

        results.push({ source: source.name, created: articlesCreated, skipped: articlesSkipped });

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (logId) {
          await supabase.from("news_scrape_logs").update({
            completed_at: new Date().toISOString(),
            status: "error",
            error_message: msg,
          }).eq("id", logId);
        }
        results.push({ source: source.name, created: 0, skipped: 0, error: msg });
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
