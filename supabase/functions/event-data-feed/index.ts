import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Skipper {
  name: string;
  sailNo?: string;
  club?: string;
}

interface EventData {
  event_name: string;
  boat_class: string;
  race_format: string;
  scoring_type: string;
  skippers: Skipper[];
  race_results: Record<string, number[]>;
  created_at: string;
  last_completed_race: number;
}

interface Standing {
  position: number;
  name: string;
  sail_number: string;
  club: string;
  races: (number | null)[];
  total_points: number;
  races_completed: number;
}

function calculateStandings(eventData: EventData): Standing[] {
  const skippers = Array.isArray(eventData.skippers)
    ? eventData.skippers
    : [];
  const raceResults = eventData.race_results || {};
  const totalRaces = eventData.last_completed_race || 0;

  const standings = skippers.map((skipper: Skipper, idx: number) => {
    let totalPoints = 0;
    let racesCompleted = 0;
    const races: (number | null)[] = [];

    for (let r = 1; r <= totalRaces; r++) {
      const raceKey = `race_${r}`;
      const results = raceResults[raceKey];
      if (results && results[idx] !== undefined && results[idx] !== null) {
        const pts =
          typeof results[idx] === "number"
            ? results[idx]
            : parseFloat(String(results[idx]));
        if (!isNaN(pts)) {
          totalPoints += pts;
          racesCompleted++;
          races.push(pts);
        } else {
          races.push(null);
        }
      } else {
        races.push(null);
      }
    }

    return {
      position: 0,
      name: skipper.name || "Unknown",
      sail_number: skipper.sailNo || "",
      club: skipper.club || "",
      races,
      total_points: totalPoints,
      races_completed: racesCompleted,
    };
  });

  standings.sort((a, b) => a.total_points - b.total_points);
  standings.forEach((s, i) => (s.position = i + 1));

  return standings;
}

function generateJSON(eventData: EventData, feedName: string, includeRaceDetails: boolean) {
  const standings = calculateStandings(eventData);
  const totalRaces = eventData.last_completed_race || 0;

  const result: Record<string, unknown> = {
    feed_name: feedName,
    event_name: eventData.event_name,
    boat_class: eventData.boat_class || null,
    race_format: eventData.race_format || null,
    scoring_type: eventData.scoring_type || null,
    total_races: totalRaces,
    total_competitors: standings.length,
    generated_at: new Date().toISOString(),
    standings: standings.map((s) => {
      const entry: Record<string, unknown> = {
        position: s.position,
        name: s.name,
        sail_number: s.sail_number,
        club: s.club,
        total_points: s.total_points,
        races_completed: s.races_completed,
      };
      if (includeRaceDetails) {
        entry.race_scores = s.races;
      }
      return entry;
    }),
  };

  return JSON.stringify(result, null, 2);
}

function generateCSV(eventData: EventData, includeRaceDetails: boolean): string {
  const standings = calculateStandings(eventData);
  const totalRaces = eventData.last_completed_race || 0;

  const headers = ["Position", "Name", "Sail Number", "Club"];
  if (includeRaceDetails) {
    for (let i = 1; i <= totalRaces; i++) {
      headers.push(`R${i}`);
    }
  }
  headers.push("Total Points", "Races Completed");

  const rows = standings.map((s) => {
    const row = [
      String(s.position),
      `"${s.name.replace(/"/g, '""')}"`,
      `"${s.sail_number.replace(/"/g, '""')}"`,
      `"${s.club.replace(/"/g, '""')}"`,
    ];
    if (includeRaceDetails) {
      for (const score of s.races) {
        row.push(score !== null ? String(score) : "");
      }
    }
    row.push(String(s.total_points), String(s.races_completed));
    return row.join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

function generateHTML(eventData: EventData, feedName: string, includeRaceDetails: boolean): string {
  const standings = calculateStandings(eventData);
  const totalRaces = eventData.last_completed_race || 0;

  let raceHeaders = "";
  if (includeRaceDetails) {
    for (let i = 1; i <= totalRaces; i++) {
      raceHeaders += `<th>R${i}</th>`;
    }
  }

  const rows = standings
    .map((s) => {
      let raceCells = "";
      if (includeRaceDetails) {
        raceCells = s.races
          .map((score) => `<td>${score !== null ? score : "-"}</td>`)
          .join("");
      }
      return `<tr>
        <td>${s.position}</td>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.sail_number)}</td>
        <td>${escapeHtml(s.club)}</td>
        ${raceCells}
        <td><strong>${s.total_points}</strong></td>
      </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(eventData.event_name)} - Results</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 24px; background: #f8fafc; color: #1e293b; }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 4px; }
    .meta { color: #64748b; font-size: 0.875rem; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    th { background: #1e293b; color: white; padding: 10px 12px; text-align: left; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
    td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 0.875rem; }
    tr:last-child td { border-bottom: none; }
    tr:hover { background: #f1f5f9; }
    .footer { margin-top: 16px; text-align: center; color: #94a3b8; font-size: 0.75rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${escapeHtml(eventData.event_name)}</h1>
    <div class="meta">
      ${eventData.boat_class ? `Class: ${escapeHtml(eventData.boat_class)} | ` : ""}${standings.length} competitors | ${totalRaces} race${totalRaces !== 1 ? "s" : ""} | Generated: ${new Date().toLocaleDateString()}
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Skipper</th>
          <th>Sail</th>
          <th>Club</th>
          ${raceHeaders}
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <div class="footer">Data feed: ${escapeHtml(feedName)} | Powered by AlfiePRO</div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    // Expected: /event-data-feed/{token}
    const token = pathParts[pathParts.length - 1];
    const formatParam = url.searchParams.get("format");

    if (!token || token === "event-data-feed") {
      return new Response(
        JSON.stringify({ error: "Feed token is required. Use: /event-data-feed/{token}?format=json|csv|html" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Look up the feed
    const { data: feed, error: feedError } = await supabase
      .from("event_data_feeds")
      .select("*")
      .eq("feed_token", token)
      .eq("is_active", true)
      .maybeSingle();

    if (feedError) {
      return new Response(
        JSON.stringify({ error: "Error looking up feed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!feed) {
      return new Response(
        JSON.stringify({ error: "Feed not found or inactive" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load event data
    const { data: eventData, error: eventError } = await supabase
      .from("quick_races")
      .select("event_name, boat_class, race_format, scoring_type, skippers, race_results, created_at, last_completed_race")
      .eq("id", feed.event_id)
      .maybeSingle();

    if (eventError || !eventData) {
      return new Response(
        JSON.stringify({ error: "Event data not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Track access
    await supabase.rpc("increment_feed_access", { p_feed_token: token });

    // Determine format (use feed default if not specified in query)
    const format = formatParam || feed.format || "json";

    switch (format) {
      case "csv": {
        const csv = generateCSV(eventData, feed.include_race_details);
        return new Response(csv, {
          headers: {
            ...corsHeaders,
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `inline; filename="${eventData.event_name.replace(/[^a-zA-Z0-9]/g, '_')}_results.csv"`,
          },
        });
      }
      case "html": {
        const html = generateHTML(eventData, feed.feed_name, feed.include_race_details);
        return new Response(html, {
          headers: {
            ...corsHeaders,
            "Content-Type": "text/html; charset=utf-8",
          },
        });
      }
      default: {
        const json = generateJSON(eventData, feed.feed_name, feed.include_race_details);
        return new Response(json, {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json; charset=utf-8",
          },
        });
      }
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
