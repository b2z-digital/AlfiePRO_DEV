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
  scrape_selector: string | null;
}

interface ScrapedArticle {
  title: string;
  content: string;
  excerpt: string;
  cover_image: string | null;
  original_url: string;
  published_at: string;
}

function absoluteUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function extractText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractLinks(html: string, baseUrl: string): Array<{ href: string; text: string }> {
  const links: Array<{ href: string; text: string }> = [];
  const linkPattern = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkPattern.exec(html)) !== null) {
    const href = absoluteUrl(baseUrl, match[1]);
    const text = extractText(match[2]).trim();
    if (text.length > 10 && href.startsWith("http")) {
      links.push({ href, text });
    }
  }
  return links;
}

function extractFirstImage(html: string, baseUrl: string): string | null {
  const imgPattern = /<img\s[^>]*src=["']([^"']+)["'][^>]*>/i;
  const match = imgPattern.exec(html);
  if (match) {
    const src = match[1];
    if (src.startsWith("data:")) return null;
    return absoluteUrl(baseUrl, src);
  }
  return null;
}

function extractMetaImage(html: string, baseUrl: string): string | null {
  const ogPattern = /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i;
  const ogPattern2 = /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i;
  const twitterPattern = /<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i;

  let match = ogPattern.exec(html) || ogPattern2.exec(html) || twitterPattern.exec(html);
  if (match) return absoluteUrl(baseUrl, match[1]);
  return null;
}

function extractTitle(html: string): string {
  const ogTitle = /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i.exec(html)
    || /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["'][^>]*>/i.exec(html);
  if (ogTitle) return ogTitle[1].trim();

  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1) return extractText(h1[1]).trim();

  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (titleTag) return extractText(titleTag[1]).split("|")[0].split("-")[0].trim();

  return "";
}

function extractMainContent(html: string): string {
  const articleMatch = /<article[^>]*>([\s\S]*?)<\/article>/i.exec(html);
  if (articleMatch) return articleMatch[1];

  const mainMatch = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html);
  if (mainMatch) return mainMatch[1];

  const contentPatterns = [
    /<div[^>]*class=["'][^"']*(?:article|post|content|entry|body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*id=["'][^"']*(?:article|post|content|entry|body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  ];
  for (const p of contentPatterns) {
    const m = p.exec(html);
    if (m && m[1].length > 200) return m[1];
  }

  return html;
}

function extractPublishedDate(html: string): string {
  const patterns = [
    /<meta[^>]*property=["']article:published_time["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<time[^>]*datetime=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]*name=["']date["'][^>]*content=["']([^"']+)["'][^>]*>/i,
  ];
  for (const p of patterns) {
    const m = p.exec(html);
    if (m) {
      try {
        return new Date(m[1]).toISOString();
      } catch {
        // continue
      }
    }
  }
  return new Date().toISOString();
}

function isArticleLink(href: string, baseUrl: string, linkText: string): boolean {
  const base = new URL(baseUrl);
  try {
    const url = new URL(href);
    if (url.hostname !== base.hostname) return false;
  } catch {
    return false;
  }

  const path = new URL(href).pathname.toLowerCase();
  const articleIndicators = ["news", "article", "post", "blog", "story", "read", "content"];
  const nonArticle = ["login", "register", "signup", "cart", "checkout", "contact", "about", "search", "tag", "category", "page", "feed", "rss", "#"];
  if (nonArticle.some(n => path.includes(n))) return false;
  if (articleIndicators.some(a => path.includes(a))) return true;
  if (linkText.length > 20 && path.split("/").length >= 2) return true;

  return false;
}

async function scrapeArticleIndex(url: string): Promise<Array<{ href: string; text: string }>> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; AlfieScraper/1.0)" },
  });
  if (!res.ok) throw new Error(`Failed to fetch index: ${res.status}`);
  const html = await res.text();
  const links = extractLinks(html, url);
  return links.filter(l => isArticleLink(l.href, url, l.text));
}

async function scrapeArticlePage(url: string): Promise<ScrapedArticle | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AlfieScraper/1.0)" },
    });
    if (!res.ok) return null;
    const html = await res.text();

    const title = extractTitle(html);
    if (!title || title.length < 5) return null;

    const coverImage = extractMetaImage(html, url) || extractFirstImage(extractMainContent(html), url);
    const rawContent = extractMainContent(html);
    const plainText = extractText(rawContent);
    const excerpt = plainText.substring(0, 300).trim();
    const publishedAt = extractPublishedDate(html);

    const contentHtml = rawContent
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/\s{3,}/g, " ")
      .trim();

    return {
      title,
      content: contentHtml.substring(0, 50000),
      excerpt,
      cover_image: coverImage,
      original_url: url,
      published_at: publishedAt,
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

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const { source_id, manual = false } = body;

    // Fetch active sources (or a specific one)
    let query = supabase
      .from("news_scrape_sources")
      .select("id, name, url, target_type, target_national_association_id, target_state_association_id, scrape_selector")
      .eq("is_active", true);

    if (source_id) query = query.eq("id", source_id);

    const { data: sources, error: sourcesErr } = await query;
    if (sourcesErr) throw sourcesErr;
    if (!sources || sources.length === 0) {
      return new Response(JSON.stringify({ message: "No active sources found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ source: string; created: number; skipped: number; error?: string }> = [];

    for (const source of sources as ScrapeSource[]) {
      const logInsert = await supabase
        .from("news_scrape_logs")
        .insert({ source_id: source.id, status: "running" })
        .select("id")
        .single();

      const logId = logInsert.data?.id;
      let articlesCreated = 0;
      let articlesSkipped = 0;

      try {
        const articleLinks = await scrapeArticleIndex(source.url);
        const uniqueLinks = [...new Map(articleLinks.map(l => [l.href, l])).values()].slice(0, 30);

        for (const link of uniqueLinks) {
          // Check if already scraped
          const { data: existing } = await supabase
            .from("articles")
            .select("id")
            .eq("scraped_url", link.href)
            .maybeSingle();

          if (existing) {
            articlesSkipped++;
            continue;
          }

          const article = await scrapeArticlePage(link.href);
          if (!article || article.title.length < 5) {
            articlesSkipped++;
            continue;
          }

          // Determine targets
          const targets: Array<{ state_association_id?: string; national_association_id?: string }> = [];

          if (source.target_type === "national" && source.target_national_association_id) {
            targets.push({ national_association_id: source.target_national_association_id });
          } else if (source.target_type === "state" && source.target_state_association_id) {
            targets.push({ state_association_id: source.target_state_association_id });
          } else if (source.target_type === "all_states" && source.target_national_association_id) {
            const { data: states } = await supabase
              .from("state_associations")
              .select("id")
              .eq("national_association_id", source.target_national_association_id);
            if (states) {
              for (const s of states) {
                targets.push({ state_association_id: s.id });
              }
            }
          }

          for (const target of targets) {
            // Check dedup per target
            const dupCheck = await supabase
              .from("articles")
              .select("id")
              .eq("scraped_url", link.href)
              .eq(
                target.state_association_id ? "state_association_id" : "national_association_id",
                target.state_association_id || target.national_association_id
              )
              .maybeSingle();

            if (dupCheck.data) continue;

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
          await new Promise(r => setTimeout(r, 500));
        }

        // Update log and source
        if (logId) {
          await supabase
            .from("news_scrape_logs")
            .update({
              completed_at: new Date().toISOString(),
              articles_found: uniqueLinks.length,
              articles_created: articlesCreated,
              articles_skipped: articlesSkipped,
              status: "success",
            })
            .eq("id", logId);
        }

        await supabase
          .from("news_scrape_sources")
          .update({
            last_scraped_at: new Date().toISOString(),
            article_count: supabase.rpc ? undefined : undefined,
            updated_at: new Date().toISOString(),
          })
          .eq("id", source.id);

        await supabase.rpc("increment_scrape_source_count", {
          p_source_id: source.id,
          p_increment: articlesCreated,
        }).catch(() => {});

        results.push({ source: source.name, created: articlesCreated, skipped: articlesSkipped });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (logId) {
          await supabase
            .from("news_scrape_logs")
            .update({
              completed_at: new Date().toISOString(),
              status: "error",
              error_message: errMsg,
            })
            .eq("id", logId);
        }
        results.push({ source: source.name, created: 0, skipped: 0, error: errMsg });
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
