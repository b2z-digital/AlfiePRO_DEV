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
  published_at: string;
  scraped_author: string;
}

// ─── HTML utility helpers ────────────────────────────────────────────────────

function absoluteUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&ndash;/gi, "\u2013")
    .replace(/&mdash;/gi, "\u2014")
    .replace(/&lsquo;/gi, "\u2018")
    .replace(/&rsquo;/gi, "\u2019")
    .replace(/&ldquo;/gi, "\u201C")
    .replace(/&rdquo;/gi, "\u201D")
    .replace(/&hellip;/gi, "\u2026")
    .replace(/&trade;/gi, "\u2122")
    .replace(/&reg;/gi, "\u00AE")
    .replace(/&copy;/gi, "\u00A9")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function stripTags(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

function firstMatch(pattern: RegExp, html: string, group = 1): string | null {
  const m = pattern.exec(html);
  return m ? m[group].trim() : null;
}

function allMatches(pattern: RegExp, html: string, group = 1): string[] {
  const results: string[] = [];
  let m: RegExpExecArray | null;
  const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
  const re = new RegExp(pattern.source, flags);
  while ((m = re.exec(html)) !== null) {
    results.push(m[group].trim());
  }
  return results;
}

function extractById(html: string, id: string): string | null {
  const startTagRe = new RegExp(`<(\\w+)[^>]*\\sid=["']${id}["'][^>]*>`, "i");
  const startTagM = startTagRe.exec(html);
  if (!startTagM) return null;

  const tagName = startTagM[1];
  const startIdx = startTagM.index + startTagM[0].length;

  let depth = 1;
  let pos = startIdx;
  while (pos < html.length && depth > 0) {
    const nextOpen = html.indexOf(`<${tagName}`, pos);
    const nextClose = html.indexOf(`</${tagName}>`, pos);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + 1;
    } else {
      depth--;
      if (depth === 0) return html.slice(startIdx, nextClose);
      pos = nextClose + 1;
    }
  }
  return null;
}

// ─── Image storage helpers ───────────────────────────────────────────────────

function getMimeType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes(".png")) return "image/png";
  if (lower.includes(".gif")) return "image/gif";
  if (lower.includes(".webp")) return "image/webp";
  return "image/jpeg";
}

function getExtension(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes(".png")) return "png";
  if (lower.includes(".gif")) return "gif";
  if (lower.includes(".webp")) return "webp";
  return "jpg";
}

async function downloadAndStoreImage(
  supabaseClient: ReturnType<typeof createClient>,
  imageUrl: string,
  articleIdentifier: string
): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AlfieScraper/1.0)",
        Accept: "image/*",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength < 500) return null;

    const ext = getExtension(imageUrl);
    const mimeType = getMimeType(imageUrl);
    const storagePath = `scraped/news/${articleIdentifier}.${ext}`;

    const { error: uploadError } = await supabaseClient.storage
      .from("media")
      .upload(storagePath, arrayBuffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      console.error(`Upload error for ${imageUrl}:`, uploadError.message);
      return null;
    }

    const { data: publicUrlData } = supabaseClient.storage
      .from("media")
      .getPublicUrl(storagePath);

    return publicUrlData?.publicUrl || null;
  } catch (err) {
    console.error(`Failed to download/store image ${imageUrl}:`, err);
    return null;
  }
}

function generateArticleSlug(title: string, date: string): string {
  const datePrefix = date.substring(0, 10).replace(/-/g, "");
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .substring(0, 60);
  return `${datePrefix}_${slug}`;
}

// ─── News article link detection ────────────────────────────────────────────

interface ArticleLink {
  href: string;
  title: string;
  date: string | null;
}

function normaliseCmsUrl(rawHref: string, baseUrl: string): string {
  const href = absoluteUrl(baseUrl, rawHref.replace(/&amp;/g, "&"));
  try {
    const u = new URL(href);
    const articleId = u.searchParams.get("cntnt01articleid");
    const returnId = u.searchParams.get("cntnt01returnid") || u.searchParams.get("cntnt01origid") || "129";
    return `${u.origin}${u.pathname}?mact=News,cntnt01,detail,0&cntnt01articleid=${articleId}&cntnt01returnid=${returnId}`;
  } catch {
    return href;
  }
}

function detectArticleLinks(html: string, baseUrl: string): ArticleLink[] {
  const links: ArticleLink[] = [];
  const seen = new Set<string>();

  const cmsPattern = /href=["']([^"']*mact=News[^"']*detail[^"']*cntnt01articleid=\d+[^"']*)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = cmsPattern.exec(html)) !== null) {
    const href = normaliseCmsUrl(m[1], baseUrl);
    if (!seen.has(href)) {
      seen.add(href);
      links.push({ href, title: "", date: null });
    }
  }
  if (links.length > 0) {
    enrichCmsMakerLinks(links, html, baseUrl);
    return links;
  }

  const articleBlocks = html.match(/<article[^>]*>[\s\S]*?<\/article>/gi) || [];
  const base = new URL(baseUrl);
  for (const block of articleBlocks) {
    const href = firstMatch(/href=["']([^"']+)["']/, block);
    if (!href) continue;
    const abs = absoluteUrl(baseUrl, href);
    try { if (new URL(abs).hostname !== base.hostname) continue; } catch { continue; }
    if (seen.has(abs)) continue;
    seen.add(abs);
    const title = firstMatch(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i, block);
    const dateRaw = firstMatch(/datetime=["']([^"']+)["']/, block)
      || firstMatch(/<time[^>]*>([\s\S]*?)<\/time>/i, block);
    links.push({
      href: abs,
      title: title ? stripTags(title) : "",
      date: dateRaw,
    });
  }
  if (links.length > 0) return links;

  const base2 = new URL(baseUrl);
  const genericPattern = /href=["']([^"'#?][^"']*(?:\/\d{4}\/|\/news\/|\/article\/|\/post\/|\/blog\/)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = genericPattern.exec(html)) !== null) {
    const href = absoluteUrl(baseUrl, m[1]);
    const linkText = stripTags(m[2]);
    try { if (new URL(href).hostname !== base2.hostname) continue; } catch { continue; }
    if (seen.has(href) || linkText.length < 10) continue;
    seen.add(href);
    links.push({ href, title: linkText, date: null });
  }
  return links;
}

function enrichCmsMakerLinks(links: ArticleLink[], html: string, baseUrl: string) {
  const blocks = html.split(/<h5>/i);
  for (const block of blocks) {
    const hrefM = /href=["']([^"']*mact=News[^"']*detail[^"']*cntnt01articleid=\d+[^"']*)["']/i.exec(block);
    if (!hrefM) continue;
    const href = normaliseCmsUrl(hrefM[1], baseUrl);
    const link = links.find(l => l.href === href);
    if (!link) continue;

    const titleM = /<a[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (titleM) link.title = stripTags(titleM[1]);

    const dateM = /Posted:\s*([A-Za-z]+ +\d{1,2},?\s*\d{4}(?:\s+\d{1,2}:\d{2})?)/i.exec(block)
      || /Posted:\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4}(?:\s+\d{1,2}:\d{2})?)/i.exec(block);
    if (dateM) link.date = dateM[1].trim();
  }
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AlfieScraper/1.0)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-AU,en;q=0.9",
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ─── Article field extractors ─────────────────────────────────────────────────

function extractTitle(html: string, hintTitle: string): string {
  const byId = extractById(html, "NewsPostDetailTitle");
  if (byId) { const t = stripTags(byId); if (t.length > 5) return t; }

  const og = firstMatch(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i, html)
    || firstMatch(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i, html);
  if (og && og.length > 5) return og;

  for (const tag of ["h1", "h2", "h3"]) {
    const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(html);
    if (m) { const t = stripTags(m[1]); if (t.length > 5) return t; }
  }

  const title = firstMatch(/<title[^>]*>([\s\S]*?)<\/title>/i, html);
  if (title) return title.split(/[|\-–—]/)[0].trim();

  return hintTitle;
}

function extractDate(html: string, hintDate: string | null): string {
  const byId = extractById(html, "NewsPostDetailDate");
  if (byId) {
    const text = stripTags(byId).trim();
    if (text) {
      try { const d = new Date(text); if (!isNaN(d.getTime())) return d.toISOString(); } catch { /* continue */ }
    }
  }

  for (const p of [
    /<meta[^>]*property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']article:published_time["']/i,
    /<time[^>]*datetime=["']([^"']+)["'][^>]*>/i,
  ]) {
    const m = p.exec(html);
    if (m) { try { return new Date(m[1]).toISOString(); } catch { /* continue */ } }
  }

  if (hintDate) {
    try { const d = new Date(hintDate); if (!isNaN(d.getTime())) return d.toISOString(); } catch { /* continue */ }
  }

  return new Date().toISOString();
}

function extractAuthor(html: string, sourceName: string): string {
  const byId = extractById(html, "NewsPostDetailAuthor");
  if (byId) {
    const text = stripTags(byId).replace(/^Posted\s+by:\s*/i, "").trim();
    if (text.length > 1) return text;
  }
  return sourceName;
}

function extractCoverImage(html: string, baseUrl: string): string | null {
  const contentHtml = extractById(html, "NewsPostDetailContent") || extractById(html, "NewsPostDetailSummary") || "";
  if (contentHtml) {
    const imgSrc = firstMatch(/<img[^>]*src=["']([^"']+)["'][^>]*>/i, contentHtml);
    if (imgSrc && !imgSrc.startsWith("data:") && !/logo|icon|avatar|pixel|sprite/i.test(imgSrc)) {
      return absoluteUrl(baseUrl, imgSrc);
    }
  }

  const og = firstMatch(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i, html)
    || firstMatch(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i, html);
  if (og && !og.startsWith("data:")) return absoluteUrl(baseUrl, og);

  const imgSrcs = allMatches(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, html);
  for (const src of imgSrcs) {
    if (src.startsWith("data:")) continue;
    if (/logo|icon|avatar|button|pixel|tracking|sprite|rss|social|facebook|twitter/i.test(src)) continue;
    const abs = absoluteUrl(baseUrl, src);
    if (/\.(jpe?g|png|webp|jfif)/i.test(abs)) return abs;
  }
  return null;
}

function extractContent(html: string, baseUrl: string): string {
  const summary = extractById(html, "NewsPostDetailSummary") || "";
  const body = extractById(html, "NewsPostDetailContent") || "";
  let combined = (summary + "\n" + body).trim();

  if (combined.length > 100) {
    combined = combined
      .replace(/src=["'](?!https?:\/\/|\/\/|data:)([^"']+)["']/gi, (_, p) => `src="${absoluteUrl(baseUrl, p)}"`)
      .replace(/href=["'](?!https?:\/\/|\/\/|#|mailto:)([^"']+)["']/gi, (_, p) => `href="${absoluteUrl(baseUrl, p)}"`)
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .trim()
      .substring(0, 80000);
    return combined;
  }

  for (const selector of [
    /<div[^>]*class=["'][^"']*(?:entry|post|article|single)[_-]content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
  ]) {
    const m = selector.exec(html);
    if (m && stripTags(m[1]).length > 100) {
      return m[1]
        .replace(/src=["'](?!https?:\/\/|\/\/|data:)([^"']+)["']/gi, (_, p) => `src="${absoluteUrl(baseUrl, p)}"`)
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .trim()
        .substring(0, 80000);
    }
  }

  return html.substring(0, 80000);
}

// ─── Per-article scraper ──────────────────────────────────────────────────────

async function scrapeArticlePage(
  url: string,
  hintTitle: string,
  hintDate: string | null,
  sourceName: string,
): Promise<ScrapedArticle | null> {
  const html = await fetchHtml(url);
  if (!html) return null;

  const title = extractTitle(html, hintTitle);
  if (!title || title.length < 5) return null;

  const published_at = extractDate(html, hintDate);
  const scraped_author = extractAuthor(html, sourceName);
  const cover_image = extractCoverImage(html, url);
  const contentHtml = extractContent(html, url);
  const plainText = stripTags(contentHtml);
  if (plainText.length < 30) return null;

  const excerpt = plainText.substring(0, 400).replace(/\s+/g, " ").trim();
  const content = contentHtml;

  return { title, content, excerpt, cover_image, published_at, scraped_author };
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
      const { data: logRow } = await supabase
        .from("news_scrape_logs")
        .insert({ source_id: source.id, status: "running" })
        .select("id")
        .single();
      const logId = logRow?.id as string | undefined;

      let articlesCreated = 0;
      let articlesSkipped = 0;

      try {
        const indexHtml = await fetchHtml(source.url);
        if (!indexHtml) throw new Error("Failed to fetch index page");

        const articleLinks = detectArticleLinks(indexHtml, source.url);
        const unique = [...new Map(articleLinks.map(l => [l.href, l])).values()].slice(0, 50);

        if (unique.length === 0) {
          throw new Error("No article links found on index page");
        }

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

        for (const link of unique) {
          const { data: existing } = await supabase
            .from("articles")
            .select("id")
            .eq("scraped_url", link.href)
            .maybeSingle();
          if (existing) { articlesSkipped++; continue; }

          const article = await scrapeArticlePage(link.href, link.title, link.date, source.name);
          if (!article || article.title.length < 5) { articlesSkipped++; continue; }

          let storedCoverImage = article.cover_image;
          if (article.cover_image) {
            const slug = generateArticleSlug(article.title, article.published_at);
            const stored = await downloadAndStoreImage(supabase, article.cover_image, slug);
            if (stored) {
              storedCoverImage = stored;
            }
          }

          for (const target of targets) {
            await supabase.from("articles").insert({
              title: article.title,
              content: article.content,
              excerpt: article.excerpt,
              cover_image: storedCoverImage,
              scraped_author: article.scraped_author,
              status: "published",
              published_at: article.published_at,
              scraped_url: link.href,
              is_scraped: true,
              ...target,
            });
          }
          articlesCreated++;

          await new Promise(r => setTimeout(r, 800));
        }

        if (logId) {
          await supabase.from("news_scrape_logs").update({
            completed_at: new Date().toISOString(),
            articles_found: unique.length,
            articles_created: articlesCreated,
            articles_skipped: articlesSkipped,
            status: "success",
          }).eq("id", logId);
        }
        const { data: srcRow } = await supabase
          .from("news_scrape_sources")
          .select("article_count")
          .eq("id", source.id)
          .maybeSingle();
        const newTotal = ((srcRow?.article_count as number) ?? 0) + articlesCreated;

        await supabase.from("news_scrape_sources").update({
          last_scraped_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          article_count: newTotal,
        }).eq("id", source.id);

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
