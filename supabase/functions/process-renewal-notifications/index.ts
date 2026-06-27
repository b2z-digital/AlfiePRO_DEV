import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const notificationDays = [30, 14, 7, 1, 0];

    const { data: clubs, error: clubsError } = await supabase
      .from("clubs")
      .select("id, name, renewal_notification_days")
      .eq("is_test", false);

    if (clubsError) {
      console.error("Error fetching clubs:", clubsError);
      throw new Error("Failed to fetch clubs");
    }

    let totalSent = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    const results: { club: string; sent: number; skipped: number; errors: number }[] = [];

    for (const club of (clubs || [])) {
      let clubSent = 0;
      let clubSkipped = 0;
      let clubErrors = 0;

      for (const daysAhead of notificationDays) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + daysAhead);
        const targetDateStr = targetDate.toISOString().split("T")[0];

        const { data: members, error: membersError } = await supabase
          .from("members")
          .select("id, first_name, last_name, email, user_id, renewal_date, membership_level")
          .eq("club_id", club.id)
          .eq("renewal_date", targetDateStr)
          .or("membership_status.eq.active,membership_status.is.null");

        if (membersError) {
          console.error(`Error fetching members for club ${club.id}:`, membersError);
          clubErrors++;
          continue;
        }

        for (const member of (members || [])) {
          if (!member.email && !member.user_id) {
            clubSkipped++;
            continue;
          }

          let notificationType: string;
          if (daysAhead === 30) notificationType = "30_days";
          else if (daysAhead === 14) notificationType = "14_days";
          else if (daysAhead === 7) notificationType = "7_days";
          else if (daysAhead === 1) notificationType = "1_day";
          else notificationType = "expired";

          const { data: existing } = await supabase
            .from("membership_renewal_notifications")
            .select("id")
            .eq("member_id", member.id)
            .eq("notification_type", notificationType)
            .eq("renewal_date", member.renewal_date)
            .maybeSingle();

          if (existing) {
            clubSkipped++;
            continue;
          }

          try {
            const response = await fetch(
              `${supabaseUrl}/functions/v1/send-renewal-reminder`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${serviceRoleKey}`,
                },
                body: JSON.stringify({
                  member_id: member.id,
                  club_id: club.id,
                }),
              }
            );

            if (response.ok) {
              clubSent++;
            } else {
              const errorText = await response.text();
              console.error(`Failed to send reminder for member ${member.id}:`, errorText);
              clubErrors++;
            }
          } catch (err) {
            console.error(`Error calling send-renewal-reminder for ${member.id}:`, err);
            clubErrors++;
          }
        }
      }

      if (clubSent > 0 || clubErrors > 0) {
        results.push({ club: club.name, sent: clubSent, skipped: clubSkipped, errors: clubErrors });
      }

      totalSent += clubSent;
      totalSkipped += clubSkipped;
      totalErrors += clubErrors;
    }

    console.log(`Renewal notifications processed: ${totalSent} sent, ${totalSkipped} skipped, ${totalErrors} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        total_sent: totalSent,
        total_skipped: totalSkipped,
        total_errors: totalErrors,
        club_results: results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Process renewal notifications error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
