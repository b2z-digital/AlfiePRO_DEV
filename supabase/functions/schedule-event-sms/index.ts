import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const { data: enabledClubs, error: clubsError } = await supabase
      .from("sms_club_settings")
      .select("club_id, auto_send_days_before, send_time, include_boat_class_filter")
      .eq("is_enabled", true)
      .eq("auto_send_enabled", true);

    if (clubsError) throw clubsError;
    if (!enabledClubs || enabledClubs.length === 0) {
      return new Response(
        JSON.stringify({ message: "No clubs with auto-send enabled", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalSent = 0;
    const results: Array<{ club_id: string; events_processed: number; error?: string }> = [];

    for (const clubSettings of enabledClubs) {
      try {
        const { data: balance } = await supabase
          .from("sms_token_balances")
          .select("balance")
          .eq("club_id", clubSettings.club_id)
          .maybeSingle();

        if (!balance || balance.balance <= 0) {
          results.push({ club_id: clubSettings.club_id, events_processed: 0, error: "No tokens" });
          continue;
        }

        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + clubSettings.auto_send_days_before);
        const targetDateStr = targetDate.toISOString().split("T")[0];

        const { data: quickRaces } = await supabase
          .from("quick_races")
          .select("id, event_name, date, race_class, club_id")
          .eq("club_id", clubSettings.club_id)
          .eq("date", targetDateStr)
          .eq("completed", false)
          .eq("cancelled", false);

        const { data: series } = await supabase
          .from("race_series")
          .select("id, name, club_id, rounds, boat_class")
          .eq("club_id", clubSettings.club_id);

        const eventsToNotify: Array<{
          event_id: string;
          event_name: string;
          event_date: string;
          boat_class: string;
          venue: string;
        }> = [];

        if (quickRaces) {
          for (const race of quickRaces) {
            const { data: venue } = await supabase
              .from("venues")
              .select("name")
              .eq("club_id", clubSettings.club_id)
              .limit(1)
              .maybeSingle();

            eventsToNotify.push({
              event_id: race.id,
              event_name: race.event_name || "Club Race",
              event_date: race.date,
              boat_class: race.race_class || "",
              venue: venue?.name || "",
            });
          }
        }

        if (series) {
          for (const s of series) {
            if (!s.rounds) continue;
            let rounds: any[] = [];
            try {
              rounds = typeof s.rounds === "string" ? JSON.parse(s.rounds) : s.rounds;
            } catch {
              continue;
            }

            for (const round of rounds) {
              const roundDate = round.date || round.round_date;
              if (roundDate === targetDateStr && !round.completed && !round.cancelled) {
                eventsToNotify.push({
                  event_id: `${s.id}__${round.name || round.round_name}`,
                  event_name: `${s.name} - ${round.name || round.round_name}`,
                  event_date: roundDate,
                  boat_class: s.boat_class || "",
                  venue: round.venue || "",
                });
              }
            }
          }
        }

        let clubEventsSent = 0;
        for (const event of eventsToNotify) {
          const { data: existing } = await supabase
            .from("sms_event_logs")
            .select("id")
            .eq("club_id", clubSettings.club_id)
            .eq("event_id", event.event_id)
            .in("status", ["sending", "completed"])
            .maybeSingle();

          if (existing) continue;

          try {
            const response = await fetch(
              `${supabaseUrl}/functions/v1/send-event-sms`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${serviceRoleKey}`,
                },
                body: JSON.stringify({
                  club_id: clubSettings.club_id,
                  event_id: event.event_id,
                  event_name: event.event_name,
                  event_date: event.event_date,
                  boat_class: event.boat_class,
                  venue: event.venue,
                  trigger_type: "auto",
                }),
              }
            );

            const result = await response.json();
            if (result.success) {
              clubEventsSent++;
              totalSent += result.sent || 0;
            }
          } catch (err: any) {
            console.error(`Failed to send SMS for event ${event.event_id}:`, err.message);
          }
        }

        results.push({ club_id: clubSettings.club_id, events_processed: clubEventsSent });
      } catch (err: any) {
        results.push({ club_id: clubSettings.club_id, events_processed: 0, error: err.message });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        clubs_processed: enabledClubs.length,
        total_sms_sent: totalSent,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in schedule-event-sms:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
