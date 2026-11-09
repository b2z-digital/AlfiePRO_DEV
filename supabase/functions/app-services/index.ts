// app-services: maps and weather for the apps, using keys kept in Supabase secrets.
// The apps never hold the weather keys: this function calls OpenWeatherMap and Stormglass for them.
// The Google Maps JavaScript key has to reach the browser to draw a map, so it is handed to
// signed-in users only (restrict it to the Maps JavaScript API in Google Cloud).
//
// POST { action: 'status' }                                   → which services are set up (no keys)
// POST { action: 'maps-key' }                                 → { key }
// POST { action: 'weather', kind: 'weather'|'forecast', lat, lon }        → OpenWeatherMap JSON
// POST { action: 'marine', kind: 'point'|'tides', lat, lon, start?, end? } → Stormglass JSON
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Secret names already in use differ between projects; take the first one that's set.
const NAMES = {
  maps: ["GOOGLE_MAPS_API_KEY", "VITE_GOOGLE_MAPS_API_KEY", "GOOGLE_MAPS_KEY", "GOOGLE_API_KEY", "GOOGLE_PLACES_API_KEY", "MAPS_API_KEY"],
  weather: ["OPENWEATHER_API_KEY", "OPENWEATHERMAP_API_KEY", "OPEN_WEATHER_API_KEY", "VITE_OPENWEATHER_API_KEY", "VITE_WEATHER_API_KEY", "WEATHER_API_KEY", "OWM_API_KEY"],
  marine: ["STORMGLASS_API_KEY", "VITE_STORMGLASS_API_KEY", "STORM_GLASS_API_KEY", "STORMGLASS_KEY"],
} as const;

function secret(kind: keyof typeof NAMES): { name: string; value: string } | null {
  for (const name of NAMES[kind]) {
    const value = Deno.env.get(name);
    if (value) return { name, value };
  }
  return null;
}

function cors(req: Request) {
  return {
    "Access-Control-Allow-Origin": req.headers.get("Origin") || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

const coord = (v: unknown, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= max ? Math.round(n * 1e4) / 1e4 : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(req, { error: "invalid_json" }, 400); }
  const action = String(body.action || "");

  if (action === "status") {
    const s = { maps: secret("maps"), weather: secret("weather"), marine: secret("marine") };
    return json(req, {
      maps: !!s.maps, weather: !!s.weather, marine: !!s.marine,
      secretNames: { maps: s.maps?.name ?? null, weather: s.weather?.name ?? null, marine: s.marine?.name ?? null },
    });
  }

  // Everything else is for signed-in members only
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return json(req, { error: "sign_in_required" }, 401);

  if (action === "maps-key") {
    const k = secret("maps");
    return k ? json(req, { key: k.value }) : json(req, { error: "not_configured" }, 503);
  }

  const lat = coord(body.lat, 90), lon = coord(body.lon, 180);
  if (lat === null || lon === null) return json(req, { error: "bad_location" }, 400);

  if (action === "weather") {
    const k = secret("weather");
    if (!k) return json(req, { error: "not_configured" }, 503);
    const kind = body.kind === "forecast" ? "forecast" : "weather";
    const r = await fetch(`https://api.openweathermap.org/data/2.5/${kind}?lat=${lat}&lon=${lon}&appid=${encodeURIComponent(k.value)}&units=metric`);
    return new Response(await r.text(), { status: r.status, headers: { ...cors(req), "Content-Type": "application/json" } });
  }

  if (action === "marine") {
    const k = secret("marine");
    if (!k) return json(req, { error: "not_configured" }, 503);
    const now = Math.floor(Date.now() / 1000);
    const start = Number.isFinite(Number(body.start)) ? Math.floor(Number(body.start)) : now;
    const end = Number.isFinite(Number(body.end)) ? Math.floor(Number(body.end)) : now + 86400;
    const url = body.kind === "tides"
      ? `https://api.stormglass.io/v2/tide/extremes/point?lat=${lat}&lng=${lon}`
      : `https://api.stormglass.io/v2/weather/point?lat=${lat}&lng=${lon}&params=waterTemperature,waveHeight,waveDirection,wavePeriod&start=${start}&end=${end}`;
    const r = await fetch(url, { headers: { Authorization: k.value } });
    return new Response(await r.text(), { status: r.status, headers: { ...cors(req), "Content-Type": "application/json" } });
  }

  return json(req, { error: "unknown_action" }, 400);
});
