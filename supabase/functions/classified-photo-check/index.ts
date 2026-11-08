import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Checks classifieds photos and works out how to show them:
 *   r     clockwise turn needed to stand the photo upright (0, 90, 180, 270)
 *   x, y  centre of the item for sale, in % of the photo as stored
 * Results go into classifieds.image_meta (keyed by photo URL). The photo
 * files are never changed. Settings a person made (by: "manual") are never
 * touched.
 *
 * Who may call it: the service role (the classifieds import calls it after
 * each run) or a super admin.
 *
 * POST body (all optional):
 *   classifiedId  check one listing (otherwise: imported listings)
 *   limit         most photos to check in this call (default 24, max 60)
 *   force         check again even if Alfie already checked it
 *   dryRun        work it out but don't save (returns the results)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const META_VERSION = 1;
const MIN_CONFIDENCE = 0.65;

interface PhotoMeta {
  r?: number;
  x?: number;
  y?: number;
  by?: "ai" | "manual";
  len?: number;
  at?: string;
  v?: number;
  c?: number;
}

const PROMPT = `This photo is from a classifieds listing for radio-controlled model yachts and sailing gear.

1. Photos are often saved sideways or upside down. Look for clues: writing and sail numbers should read normally; floors, ground, grass, gravel and water belong at the bottom; sky, ceilings and trees' tops at the top; people, furniture, stands and tables stand upright; masts on a boat sitting on its stand point up.
   Which edge of this image is the real TOP of the scene: "top", "right", "bottom" or "left"?
   A boat lying on its side on a table or the floor, or photographed from straight above, is not a rotated photo: answer "top" unless the surroundings show the photo itself is turned. If you can't tell, answer "top".

2. Where is the centre of the main item for sale (usually the boat, otherwise the gear), as percentages of this image exactly as you see it now: x from the left edge, y from the top edge?

Reply with JSON only:
{"clues": "a few words", "up": "top|right|bottom|left", "confidence": 0.0-1.0, "x": 0-100, "y": 0-100}`;

const UP_TO_TURN: Record<string, number> = { top: 0, left: 90, bottom: 180, right: 270 };

const clampPct = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(Math.min(100, Math.max(0, n))) : 50;
};

async function photoSize(url: string): Promise<number | undefined> {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(10000) });
    const n = Number(res.headers.get("content-length"));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

async function checkPhoto(url: string, apiKey: string) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You check photos for a sailing marketplace. You answer with JSON only." },
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url, detail: "high" } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "{}";
  const out = JSON.parse(text);
  const up = String(out.up || "top").toLowerCase();
  const confidence = Math.min(1, Math.max(0, Number(out.confidence) || 0));
  const turn = UP_TO_TURN[up] ?? 0;
  return {
    r: confidence >= MIN_CONFIDENCE ? turn : 0,
    suggested: turn,
    confidence,
    x: clampPct(out.x),
    y: clampPct(out.y),
    clues: String(out.clues || "").slice(0, 160),
  };
}

/** Run jobs a few at a time */
async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

function jwtRole(token: string): string | null {
  try {
    const part = token.split(".")[1];
    const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // The gateway has already checked the token's signature (verify_jwt).
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Not signed in" }, 401);
  if (jwtRole(token) !== "service_role") {
    const { data: userData } = await supabase.auth.getUser(token);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Not signed in" }, 401);
    const { data: prof } = await supabase.from("profiles").select("is_super_admin").eq("id", uid).maybeSingle();
    if (!prof?.is_super_admin) return json({ error: "Only super admins can run this" }, 403);
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json({ error: "OPENAI_API_KEY is not set" }, 500);

  const body = await req.json().catch(() => ({})) as {
    classifiedId?: string;
    limit?: number;
    force?: boolean;
    dryRun?: boolean;
  };
  const limit = Math.min(60, Math.max(1, Number(body.limit) || 24));
  const force = !!body.force;
  const dryRun = !!body.dryRun;

  let q = supabase
    .from("classifieds")
    .select("id, title, images, image_meta, created_at")
    .order("created_at", { ascending: false })
    .limit(400);
  if (body.classifiedId) q = q.eq("id", body.classifiedId);
  else q = q.eq("is_scraped", true);
  const { data: rows, error } = await q;
  if (error) return json({ error: error.message }, 500);

  // Photos that still need checking (newest listings first)
  const jobs: Array<{ id: string; url: string }> = [];
  for (const row of rows || []) {
    const images: string[] = Array.isArray(row.images) ? row.images : [];
    const meta = (row.image_meta && typeof row.image_meta === "object" ? row.image_meta : {}) as Record<string, PhotoMeta>;
    for (const url of images) {
      if (typeof url !== "string" || !/^https?:\/\//.test(url)) continue;
      const m = meta[url];
      if (m?.by === "manual") continue;
      if (m && !force && (m.v || 0) >= META_VERSION) continue;
      jobs.push({ id: row.id, url });
      if (jobs.length >= limit) break;
    }
    if (jobs.length >= limit) break;
  }

  const results: Array<Record<string, unknown>> = [];
  const byListing = new Map<string, Record<string, PhotoMeta>>();

  await pool(jobs, 4, async (job) => {
    try {
      const [check, len] = await Promise.all([checkPhoto(job.url, apiKey), photoSize(job.url)]);
      const m: PhotoMeta = {
        r: check.r,
        x: check.x,
        y: check.y,
        by: "ai",
        len,
        c: Math.round(check.confidence * 100) / 100,
        v: META_VERSION,
        at: new Date().toISOString(),
      };
      if (!byListing.has(job.id)) byListing.set(job.id, {});
      byListing.get(job.id)![job.url] = m;
      results.push({ id: job.id, url: job.url, ...m, suggested: check.suggested, clues: check.clues });
    } catch (err) {
      results.push({ id: job.id, url: job.url, error: err instanceof Error ? err.message : String(err) });
    }
  });

  let saved = 0;
  if (!dryRun) {
    for (const [id, found] of byListing) {
      // Read again just before saving so a change someone made meanwhile wins
      const { data: cur } = await supabase.from("classifieds").select("images, image_meta").eq("id", id).maybeSingle();
      if (!cur) continue;
      const images: string[] = Array.isArray(cur.images) ? cur.images : [];
      const meta = { ...((cur.image_meta && typeof cur.image_meta === "object") ? cur.image_meta : {}) } as Record<string, PhotoMeta>;
      for (const [url, m] of Object.entries(found)) {
        if (!images.includes(url)) continue;
        if (meta[url]?.by === "manual") continue;
        meta[url] = m;
      }
      const { error: upErr } = await supabase.from("classifieds").update({ image_meta: meta }).eq("id", id);
      if (!upErr) saved++;
    }
  }

  return json({ success: true, checked: jobs.length, saved, dryRun, results });
});
