import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SendSmsRequest {
  club_id: string;
  event_id: string;
  event_name: string;
  event_date: string;
  boat_class: string;
  venue: string;
  trigger_type?: "manual" | "auto";
}

function maskPhone(phone: string): string {
  if (phone.length <= 4) return "****";
  return phone.slice(0, 3) + "****" + phone.slice(-3);
}

function normalizePhone(phone: string): string | null {
  let cleaned = phone.replace(/[\s\-\(\)\.]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("0") && cleaned.length === 10) {
    return "+61" + cleaned.slice(1);
  }
  if (cleaned.length >= 9 && cleaned.length <= 12 && !cleaned.startsWith("+")) {
    return "+61" + cleaned;
  }
  return null;
}

async function sendTwilioSms(
  to: string,
  body: string,
  accountSid: string,
  apiKeySid: string,
  apiKeySecret: string,
  fromNumber: string
): Promise<{ success: boolean; messageSid?: string; error?: string }> {
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const credentials = btoa(`${apiKeySid}:${apiKeySecret}`);

    const params = new URLSearchParams();
    params.append("To", to);
    params.append("From", fromNumber);
    params.append("Body", body);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.message || `Twilio error: ${response.status}`,
      };
    }

    return { success: true, messageSid: data.sid };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
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

    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioApiKeySid = Deno.env.get("TWILIO_API_KEY_SID");
    const twilioApiKeySecret = Deno.env.get("TWILIO_API_KEY_SECRET");
    const twilioFromNumber = Deno.env.get("TWILIO_FROM_NUMBER");

    if (!twilioAccountSid || !twilioApiKeySid || !twilioApiKeySecret || !twilioFromNumber) {
      return new Response(
        JSON.stringify({ error: "Twilio credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    let callerUserId: string | null = null;

    if (token && token !== Deno.env.get("SUPABASE_ANON_KEY")) {
      const { data: userData } = await supabase.auth.getUser(token);
      callerUserId = userData?.user?.id || null;
    }

    const body: SendSmsRequest = await req.json();
    const {
      club_id,
      event_id,
      event_name,
      event_date,
      boat_class,
      venue,
      trigger_type = "manual",
    } = body;

    if (!club_id || !event_id || !event_name) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: club_id, event_id, event_name" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: settings } = await supabase
      .from("sms_club_settings")
      .select("*")
      .eq("club_id", club_id)
      .maybeSingle();

    if (!settings?.is_enabled) {
      return new Response(
        JSON.stringify({ error: "SMS attendance is not enabled for this club" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: tokenBalance } = await supabase
      .from("sms_token_balances")
      .select("balance")
      .eq("club_id", club_id)
      .maybeSingle();

    if (!tokenBalance || tokenBalance.balance <= 0) {
      return new Response(
        JSON.stringify({ error: "Insufficient SMS tokens. Please purchase more tokens." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let membersQuery = supabase
      .from("members")
      .select("id, first_name, last_name, phone, email, user_id")
      .eq("club_id", club_id)
      .not("phone", "is", null)
      .neq("phone", "");

    const { data: members, error: membersError } = await membersQuery;

    if (membersError) throw membersError;

    let eligibleMembers = members || [];

    if (boat_class && settings.include_boat_class_filter) {
      const memberIds = eligibleMembers.map((m) => m.id);
      if (memberIds.length > 0) {
        const { data: boats } = await supabase
          .from("member_boats")
          .select("member_id, boat_type")
          .in("member_id", memberIds)
          .eq("boat_type", boat_class);

        if (boats && boats.length > 0) {
          const boatMemberIds = new Set(boats.map((b: any) => b.member_id));
          eligibleMembers = eligibleMembers.filter((m) =>
            boatMemberIds.has(m.id)
          );
        }
      }
    }

    if (eligibleMembers.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No eligible members found with phone numbers for this event class",
          sent: 0,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (tokenBalance.balance < eligibleMembers.length) {
      return new Response(
        JSON.stringify({
          error: `Insufficient tokens. Need ${eligibleMembers.length} but only have ${tokenBalance.balance}.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: existingLog } = await supabase
      .from("sms_event_logs")
      .select("id, status")
      .eq("club_id", club_id)
      .eq("event_id", event_id)
      .in("status", ["sending", "completed"])
      .maybeSingle();

    if (existingLog) {
      return new Response(
        JSON.stringify({
          error: "SMS has already been sent for this event",
          existing_log_id: existingLog.id,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: eventLog, error: logError } = await supabase
      .from("sms_event_logs")
      .insert({
        club_id,
        event_id,
        event_name,
        event_date: event_date || null,
        boat_class: boat_class || null,
        venue: venue || null,
        total_sent: 0,
        status: "sending",
        trigger_type,
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (logError) throw logError;

    let sentCount = 0;
    let failedCount = 0;
    const messageTemplate = settings.message_template ||
      "Hi {first_name}, {event_name} is on {event_date} at {venue}. Will you be sailing? Reply YES, NO, or MAYBE.";

    for (const member of eligibleMembers) {
      const normalizedPhone = normalizePhone(member.phone);
      if (!normalizedPhone) {
        failedCount++;
        continue;
      }

      const formattedDate = event_date
        ? new Date(event_date).toLocaleDateString("en-AU", {
            weekday: "short",
            day: "numeric",
            month: "short",
          })
        : "TBC";

      const message = messageTemplate
        .replace("{first_name}", member.first_name || "")
        .replace("{last_name}", member.last_name || "")
        .replace("{event_name}", event_name)
        .replace("{event_date}", formattedDate)
        .replace("{venue}", venue || "your club")
        .replace("{boat_class}", boat_class || "");

      const result = await sendTwilioSms(
        normalizedPhone,
        message,
        twilioAccountSid,
        twilioApiKeySid,
        twilioApiKeySecret,
        twilioFromNumber
      );

      await supabase.from("sms_message_log").insert({
        event_log_id: eventLog.id,
        club_id,
        member_id: member.id,
        member_name: `${member.first_name} ${member.last_name}`,
        phone_number_masked: maskPhone(normalizedPhone),
        twilio_message_sid: result.messageSid || null,
        status: result.success ? "sent" : "failed",
        error_code: result.error || null,
        sent_at: result.success ? new Date().toISOString() : null,
      });

      if (result.success) {
        sentCount++;
      } else {
        failedCount++;
      }
    }

    await supabase
      .from("sms_event_logs")
      .update({
        total_sent: sentCount,
        tokens_used: sentCount,
        status: sentCount > 0 ? "completed" : "failed",
        completed_at: new Date().toISOString(),
        error_message: failedCount > 0 ? `${failedCount} messages failed to send` : null,
      })
      .eq("id", eventLog.id);

    if (sentCount > 0) {
      await supabase.rpc("", {}).catch(() => {});

      await supabase
        .from("sms_token_balances")
        .update({
          balance: tokenBalance.balance - sentCount,
          total_used: (tokenBalance as any).total_used
            ? (tokenBalance as any).total_used + sentCount
            : sentCount,
          updated_at: new Date().toISOString(),
        })
        .eq("club_id", club_id);

      await supabase.from("sms_token_transactions").insert({
        club_id,
        transaction_type: "usage",
        amount: -sentCount,
        description: `SMS sent for "${event_name}" - ${sentCount} messages`,
        reference_id: eventLog.id,
        created_by: callerUserId,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        event_log_id: eventLog.id,
        sent: sentCount,
        failed: failedCount,
        total_eligible: eligibleMembers.length,
        tokens_remaining: tokenBalance.balance - sentCount,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-event-sms:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
