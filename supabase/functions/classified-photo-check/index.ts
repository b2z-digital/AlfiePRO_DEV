import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

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
 *   limit         most photos to check in this call (default 6, max 8)
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

// The model is shown the photo four times, turned 0°, 90°, 180° and 270°
// clockwise, and picks the one that is the right way up. (Asked directly
// "which edge is the top?", models mix up left and right.)
const PROMPT = `This picture shows ONE photo four times, each copy turned a different way:
1 = top-left, 2 = top-right, 3 = bottom-left, 4 = bottom-right.
The photo is from a classifieds listing for radio-controlled model yachts and sailing gear.

Which copy shows the scene the right way up, as the photographer saw it?
Clues: writing and sail numbers read normally (not sideways or upside down); floors, ground, grass, gravel and water are at the bottom; sky, ceilings and tree tops are at the top; people, furniture, stands and tables stand upright; a boat on its stand has its mast pointing up.
A boat lying on its side on a table or floor, or photographed from straight above, can look right in more than one copy: then prefer copy 1 unless the surroundings clearly show it is turned.

Reply with JSON only: {"clues": "a few words", "upright": 1|2|3|4, "confidence": 0.0-1.0}`;

const COPY_TURN = [0, 90, 180, 270];

/**
 * Reads the start of a JPEG: its stored orientation flag (EXIF 0x0112, which
 * browsers apply when they show the photo), its pixel size and the file size.
 */
async function photoInfo(url: string): Promise<{ len?: number; orientation: number; w?: number; h?: number }> {
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-262143" }, signal: AbortSignal.timeout(15000) });
    const total = (res.headers.get("content-range") || "").split("/")[1];
    const lenHeader = Number(total || res.headers.get("content-length"));
    const b = new Uint8Array(await res.arrayBuffer());
    const len = Number.isFinite(lenHeader) && lenHeader > 0 ? lenHeader : undefined;
    let orientation = 1;
    let w: number | undefined;
    let h: number | undefined;
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const marker = b[i + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) { i += marker === 0xff ? 1 : 2; continue; }
        const segLen = (b[i + 2] << 8) | b[i + 3];
        if (marker === 0xe1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) {
          const t = i + 10;
          const le = b[t] === 0x49;
          const r16 = (o: number) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
          const r32 = (o: number) => (le
            ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
            : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);
          const ifd = t + r32(t + 4);
          if (ifd + 2 < b.length) {
            const n = r16(ifd);
            for (let k = 0; k < n && ifd + 2 + k * 12 + 10 < b.length; k++) {
              const e = ifd + 2 + k * 12;
              if (r16(e) === 0x0112) orientation = r16(e + 8) || 1;
            }
          }
        }
        const isSof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
        if (isSof) {
          h = (b[i + 5] << 8) | b[i + 6];
          w = (b[i + 7] << 8) | b[i + 8];
          break;
        }
        i += 2 + segLen;
      }
    }
    return { len, orientation, w, h };
  } catch {
    return { orientation: 1 };
  }
}

/** Turn an image 90° clockwise, `times` times */
function turnClockwise(src: Image, times: number): Image {
  let img = src;
  for (let t = 0; t < times; t++) {
    const w = img.width;
    const h = img.height;
    const out = new Image(h, w);
    const a = img.bitmap;
    const o = out.bitmap;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // (x, y) -> (h - 1 - y, x)
        const si = (y * w + x) * 4;
        const di = (x * h + (h - 1 - y)) * 4;
        o[di] = a[si]; o[di + 1] = a[si + 1]; o[di + 2] = a[si + 2]; o[di + 3] = a[si + 3];
      }
    }
    img = out;
  }
  return img;
}

/** One JPEG with the photo turned 0/90/180/270° in a 2×2 grid, as a data URL */
async function fourWays(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Photo ${res.status}`);
  const decoded = await Image.decode(new Uint8Array(await res.arrayBuffer()));
  const scale = 300 / Math.max(decoded.width, decoded.height);
  const base = scale < 1 ? decoded.resize(Math.round(decoded.width * scale), Math.round(decoded.height * scale)) : decoded;
  const cell = 316;
  const grid = new Image(cell * 2, cell * 2);
  grid.fill(0xffffffff);
  for (let k = 0; k < 4; k++) {
    const c = turnClockwise(base, k);
    const x = (k % 2) * cell + Math.round((cell - c.width) / 2);
    const y = Math.floor(k / 2) * cell + Math.round((cell - c.height) / 2);
    grid.composite(c, x, y);
  }
  const jpg = await grid.encodeJPEG(82);
  return `data:image/jpeg;base64,${encodeBase64(jpg)}`;
}

async function checkPhoto(url: string, apiKey: string) {
  const gridUrl = await fourWays(url);
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
            { type: "image_url", image_url: { url: gridUrl, detail: "high" } },
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
  const pick = Math.round(Number(out.upright));
  const confidence = Math.min(1, Math.max(0, Number(out.confidence) || 0));
  const turn = pick >= 1 && pick <= 4 ? COPY_TURN[pick - 1] : 0;
  return {
    r: confidence >= MIN_CONFIDENCE ? turn : 0,
    suggested: turn,
    confidence,
    x: 50,
    y: 50,
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
    probeOnly?: boolean;
  };
  const probeOnly = !!body.probeOnly;
  const dryRun = !!body.dryRun || probeOnly;
  const force = !!body.force;
  // Turning photos costs CPU time, which edge functions have little of: check
  // a few per call (the import calls this every run, so the rest follow).
  const limit = Math.min(probeOnly ? 60 : 8, Math.max(1, Number(body.limit) || 6));

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

  await pool(jobs, 2, async (job) => {
    try {
      const info = await photoInfo(job.url);
      if (probeOnly) {
        results.push({ id: job.id, url: job.url, ...info });
        return;
      }
      const check = await checkPhoto(job.url, apiKey);
      const len = info.len;
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
      results.push({ id: job.id, url: job.url, ...m, suggested: check.suggested, clues: check.clues, exif: info.orientation, w: info.w, h: info.h });
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
