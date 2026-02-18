import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function parseResponse(body: string): "yes" | "no" | "maybe" | null {
  const cleaned = body.trim().toLowerCase();
  if (["yes", "y", "yep", "yeah", "sailing", "in", "1"].includes(cleaned)) return "yes";
  if (["no", "n", "nope", "nah", "out", "0"].includes(cleaned)) return "no";
  if (["maybe", "m", "unsure", "possibly", "perhaps", "2"].includes(cleaned)) return "maybe";
  if (cleaned.startsWith("yes")) return "yes";
  if (cleaned.startsWith("no")) return "no";
  if (cleaned.startsWith("maybe")) return "maybe";
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const contentType = req.headers.get("content-type") || "";
    let fromNumber = "";
    let messageBody = "";
    let messageSid = "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      fromNumber = formData.get("From")?.toString() || "";
      messageBody = formData.get("Body")?.toString() || "";
      messageSid = formData.get("MessageSid")?.toString() || "";
    } else {
      const json = await req.json();
      fromNumber = json.From || json.from || "";
      messageBody = json.Body || json.body || "";
      messageSid = json.MessageSid || json.messageSid || "";
    }

    if (!fromNumber || !messageBody) {
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { status: 200, headers: { ...corsHeaders, "Content-Type": "text/xml" } }
      );
    }

    const parsedResponse = parseResponse(messageBody);

    const phoneDigits = fromNumber.replace(/\D/g, "");
    const phoneSuffixes = [
      phoneDigits,
      phoneDigits.slice(-9),
      phoneDigits.slice(-10),
    ].filter(Boolean);

    let matchedMessage = null;

    for (const suffix of phoneSuffixes) {
      const { data: messages } = await supabase
        .from("sms_message_log")
        .select(`
          id, member_id, club_id, event_log_id,
          sms_event_logs!inner(event_id, event_name, club_id)
        `)
        .in("status", ["sent", "delivered"])
        .order("created_at", { ascending: false })
        .limit(20);

      if (messages) {
        for (const msg of messages) {
          const { data: member } = await supabase
            .from("members")
            .select("phone")
            .eq("id", msg.member_id)
            .maybeSingle();

          if (member?.phone) {
            const memberDigits = member.phone.replace(/\D/g, "");
            if (
              memberDigits === phoneDigits ||
              memberDigits.endsWith(suffix) ||
              phoneDigits.endsWith(memberDigits.slice(-9))
            ) {
              matchedMessage = msg;
              break;
            }
          }
        }
      }
      if (matchedMessage) break;
    }

    if (!matchedMessage) {
      const twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Thanks for your reply. We couldn\'t match your number to a recent event SMS. Please contact your club directly.</Message></Response>';
      return new Response(twiml, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/xml" },
      });
    }

    if (!parsedResponse) {
      const twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Please reply with YES, NO, or MAYBE to confirm your attendance.</Message></Response>';
      return new Response(twiml, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/xml" },
      });
    }

    await supabase
      .from("sms_message_log")
      .update({
        status: "responded",
        response: parsedResponse,
        response_raw: messageBody.trim(),
        responded_at: new Date().toISOString(),
      })
      .eq("id", matchedMessage.id);

    const eventLog = (matchedMessage as any).sms_event_logs;

    const responseField =
      parsedResponse === "yes"
        ? "yes_count"
        : parsedResponse === "no"
        ? "no_count"
        : "maybe_count";

    await supabase.rpc("increment_sms_response_count", {
      p_event_log_id: matchedMessage.event_log_id,
      p_response_field: responseField,
    }).catch(async () => {
      const { data: currentLog } = await supabase
        .from("sms_event_logs")
        .select("total_responses, yes_count, no_count, maybe_count")
        .eq("id", matchedMessage.event_log_id)
        .maybeSingle();

      if (currentLog) {
        const updates: Record<string, number> = {
          total_responses: (currentLog.total_responses || 0) + 1,
        };
        updates[responseField] = ((currentLog as any)[responseField] || 0) + 1;
        await supabase
          .from("sms_event_logs")
          .update(updates)
          .eq("id", matchedMessage.event_log_id);
      }
    });

    if (matchedMessage.member_id && eventLog) {
      const { data: member } = await supabase
        .from("members")
        .select("user_id")
        .eq("id", matchedMessage.member_id)
        .maybeSingle();

      if (member?.user_id) {
        const eventId = eventLog.event_id;
        const clubId = matchedMessage.club_id;

        const isSeriesRound = eventId.includes("__");
        let seriesId: string | null = null;
        let roundName: string | null = null;
        let singleEventId: string | null = null;

        if (isSeriesRound) {
          const parts = eventId.split("__");
          seriesId = parts[0];
          roundName = parts[1];
        } else {
          singleEventId = eventId;
        }

        const baseWhere: Record<string, string> = {
          user_id: member.user_id,
          club_id: clubId,
        };

        if (isSeriesRound) {
          const { data: existing } = await supabase
            .from("event_attendance")
            .select("id")
            .eq("user_id", member.user_id)
            .eq("club_id", clubId)
            .eq("series_id", seriesId!)
            .eq("round_name", roundName!)
            .maybeSingle();

          if (existing) {
            await supabase
              .from("event_attendance")
              .update({
                status: parsedResponse,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existing.id);
          } else {
            await supabase.from("event_attendance").insert({
              user_id: member.user_id,
              club_id: clubId,
              series_id: seriesId,
              round_name: roundName,
              status: parsedResponse,
            });
          }
        } else {
          const { data: existing } = await supabase
            .from("event_attendance")
            .select("id")
            .eq("user_id", member.user_id)
            .eq("club_id", clubId)
            .eq("event_id", singleEventId!)
            .maybeSingle();

          if (existing) {
            await supabase
              .from("event_attendance")
              .update({
                status: parsedResponse,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existing.id);
          } else {
            await supabase.from("event_attendance").insert({
              user_id: member.user_id,
              club_id: clubId,
              event_id: singleEventId,
              status: parsedResponse,
            });
          }
        }
      }
    }

    const responseMessages: Record<string, string> = {
      yes: `Awesome! You're marked as SAILING for ${eventLog?.event_name || "the event"}. See you on the water!`,
      no: `Got it. You're marked as NOT SAILING for ${eventLog?.event_name || "the event"}. Hope to see you next time!`,
      maybe: `Noted as MAYBE for ${eventLog?.event_name || "the event"}. Let us know when you decide!`,
    };

    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${responseMessages[parsedResponse]}</Message></Response>`;
    return new Response(twiml, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/xml" },
    });
  } catch (error: any) {
    console.error("Error in sms-attendance-webhook:", error);
    const twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Thanks for your reply. We had a technical issue processing it. Please try again.</Message></Response>';
    return new Response(twiml, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/xml" },
    });
  }
});
