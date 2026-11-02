import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface BillingRate {
  id: string;
  name: string;
  rate_per_member: number;
  annual_rate: number | null;
  billing_target: string;
  billing_frequency: string;
  target_entity_id: string | null;
  target_entity_name: string | null;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
}

const FREQUENCY_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  annually: 12,
};

// Periods align to the Australian financial year (July start).
function isPeriodStartMonth(frequency: string, monthIndex: number): boolean {
  const len = FREQUENCY_MONTHS[frequency];
  if (!len) return false;
  return ((monthIndex - 6 + 12) % 12) % len === 0;
}

const toDateStr = (d: Date) => d.toISOString().split("T")[0];

function periodFraction(startStr: string, endStr: string): number {
  const start = new Date(startStr + "T00:00:00Z");
  const end = new Date(endStr + "T00:00:00Z");
  const dayAfterEnd = new Date(end.getTime() + 86400000);
  if (start.getUTCDate() === 1 && dayAfterEnd.getUTCDate() === 1) {
    const months =
      (dayAfterEnd.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (dayAfterEnd.getUTCMonth() - start.getUTCMonth());
    return months / 12;
  }
  return (dayAfterEnd.getTime() - start.getTime()) / 86400000 / 365;
}

function frequencyForRange(startStr: string, endStr: string): string {
  const fraction = periodFraction(startStr, endStr);
  const match = Object.entries(FREQUENCY_MONTHS).find(
    ([, m]) => Math.abs(m / 12 - fraction) < 0.0001
  );
  return match ? match[0] : "custom";
}

async function isAuthorized(
  req: Request,
  adminClient: SupabaseClient,
  serviceRoleKey: string
): Promise<boolean> {
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  if (!token) return false;
  if (token === serviceRoleKey) return true;
  const { data: { user } } = await adminClient.auth.getUser(token);
  if (!user) return false;
  const { data: profile } = await adminClient
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.is_super_admin === true;
}

async function loadEntities(adminClient: SupabaseClient, targetType: string) {
  const table =
    targetType === "club"
      ? "clubs"
      : targetType === "state_association"
        ? "state_associations"
        : "national_associations";
  const columns = targetType === "club" ? "id, name" : "id, name, email";
  const { data, error } = await adminClient.from(table).select(columns).order("name");
  if (error) throw new Error(`Failed to load ${table}: ${error.message}`);
  return ((data || []) as { id: string; name: string; email?: string | null }[]).map((e) => ({
    id: e.id,
    name: e.name,
    email: e.email ?? null,
  }));
}

async function clubIdsFor(
  adminClient: SupabaseClient,
  targetType: string,
  entityId: string
): Promise<string[]> {
  if (targetType === "club") return [entityId];
  if (targetType === "state_association") {
    const { data } = await adminClient
      .from("clubs")
      .select("id")
      .eq("state_association_id", entityId);
    return (data || []).map((c: { id: string }) => c.id);
  }
  const { data: states } = await adminClient
    .from("state_associations")
    .select("id")
    .eq("national_association_id", entityId);
  const stateIds = (states || []).map((s: { id: string }) => s.id);
  if (stateIds.length === 0) return [];
  const { data: clubs } = await adminClient
    .from("clubs")
    .select("id")
    .in("state_association_id", stateIds);
  return (clubs || []).map((c: { id: string }) => c.id);
}

interface GeneratedRecord {
  id: string;
  target_name: string;
  email: string | null;
}

async function generatePeriod(
  adminClient: SupabaseClient,
  periodStartStr: string,
  periodEndStr: string,
  frequencyFilter: string | null
) {
  const { data: existingPeriod } = await adminClient
    .from("platform_billing_periods")
    .select("*")
    .eq("period_start", periodStartStr)
    .eq("period_end", periodEndStr)
    .maybeSingle();

  if (existingPeriod) {
    if (frequencyFilter) {
      return { skipped: true, period_id: existingPeriod.id, total_records: 0, total_amount: 0, records: [] as GeneratedRecord[] };
    }
    if (existingPeriod.status === "finalized" && existingPeriod.total_records > 0) {
      throw new Error("This billing period has been finalized and cannot be regenerated");
    }
    const { count: sentCount } = await adminClient
      .from("platform_billing_records")
      .select("id", { count: "exact", head: true })
      .eq("billing_period_id", existingPeriod.id)
      .or("invoice_sent_at.not.is.null,payment_status.eq.paid");
    if ((sentCount || 0) > 0) {
      throw new Error("Invoices for this period have already been sent or paid, so it cannot be regenerated");
    }
  }

  const { data: rates } = await adminClient
    .from("platform_billing_rates")
    .select("*")
    .eq("is_active", true)
    .lte("effective_from", periodEndStr)
    .or(`effective_to.is.null,effective_to.gte.${periodStartStr}`);

  const activeRates = ((rates || []) as BillingRate[]).filter(
    (r) => !frequencyFilter || (r.billing_frequency || "monthly") === frequencyFilter
  );

  if (activeRates.length === 0) {
    return { skipped: false, period_id: existingPeriod?.id || null, total_records: 0, total_amount: 0, records: [] as GeneratedRecord[] };
  }

  let periodId: string;
  if (existingPeriod) {
    await adminClient.from("platform_billing_member_snapshots").delete().eq("billing_period_id", existingPeriod.id);
    await adminClient.from("platform_billing_records").delete().eq("billing_period_id", existingPeriod.id);
    await adminClient
      .from("platform_billing_periods")
      .update({
        status: "generating",
        billing_frequency: frequencyForRange(periodStartStr, periodEndStr),
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingPeriod.id);
    periodId = existingPeriod.id;
  } else {
    const { data: created, error } = await adminClient
      .from("platform_billing_periods")
      .insert({
        period_start: periodStartStr,
        period_end: periodEndStr,
        billing_frequency: frequencyForRange(periodStartStr, periodEndStr),
        status: "generating",
        generated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error || !created) throw new Error("Could not create billing period");
    periodId = created.id;
  }

  const fraction = periodFraction(periodStartStr, periodEndStr);
  const dueDate = toDateStr(new Date(Date.now() + 14 * 86400000));
  const periodEndExclusive = toDateStr(new Date(new Date(periodEndStr + "T00:00:00Z").getTime() + 86400000));
  const generated: GeneratedRecord[] = [];
  let totalAmount = 0;

  for (const targetType of ["club", "state_association", "national_association"]) {
    const typeRates = activeRates.filter((r) => r.billing_target === targetType);
    if (typeRates.length === 0) continue;

    const entities = await loadEntities(adminClient, targetType);
    for (const entity of entities) {
      const applicableRate =
        typeRates.find((r) => r.target_entity_id === entity.id) ||
        typeRates.find((r) => r.target_entity_id === null);
      if (!applicableRate) continue;

      const clubIds = await clubIdsFor(adminClient, targetType, entity.id);
      let memberCount = 0;
      let newMembersCount = 0;
      if (clubIds.length > 0) {
        const { data: counts, error: countError } = await adminClient.rpc("count_billable_people", {
          p_club_ids: clubIds,
          p_period_start: periodStartStr,
          p_period_end: periodEndExclusive,
        });
        if (countError) throw new Error(`Failed to count members for ${entity.name}: ${countError.message}`);
        const row = Array.isArray(counts) ? counts[0] : counts;
        memberCount = row?.total_people || 0;
        newMembersCount = row?.new_people || 0;
      }

      const annualRate = Number(applicableRate.annual_rate) || Number(applicableRate.rate_per_member) * 12;
      const periodRatePerMember = annualRate * fraction;
      const existingMembers = memberCount - newMembersCount;
      const billingTotal = parseFloat(
        (existingMembers * periodRatePerMember + newMembersCount * annualRate).toFixed(2)
      );

      const { data: record } = await adminClient
        .from("platform_billing_records")
        .insert({
          billing_rate_id: applicableRate.id,
          billing_period_id: periodId,
          target_type: targetType,
          target_id: entity.id,
          target_name: entity.name,
          billing_period_start: periodStartStr,
          billing_period_end: periodEndStr,
          member_count: memberCount,
          rate_per_member: parseFloat(periodRatePerMember.toFixed(4)),
          annual_rate: annualRate,
          total_amount: billingTotal,
          payment_status: "pending",
          due_date: dueDate,
        })
        .select()
        .single();

      await adminClient.from("platform_billing_member_snapshots").insert({
        billing_period_id: periodId,
        billing_record_id: record?.id || null,
        target_type: targetType,
        target_id: entity.id,
        target_name: entity.name,
        total_active_members: memberCount,
        new_members_this_period: newMembersCount,
        snapshot_date: periodStartStr,
      });

      if (record) generated.push({ id: record.id, target_name: entity.name, email: entity.email });
      totalAmount += billingTotal;
    }
  }

  await adminClient
    .from("platform_billing_periods")
    .update({
      status: "generated",
      total_records: generated.length,
      total_amount: parseFloat(totalAmount.toFixed(2)),
      updated_at: new Date().toISOString(),
    })
    .eq("id", periodId);

  return {
    skipped: false,
    period_id: periodId,
    total_records: generated.length,
    total_amount: parseFloat(totalAmount.toFixed(2)),
    records: generated,
  };
}

async function sendInvoices(
  supabaseUrl: string,
  serviceRoleKey: string,
  records: GeneratedRecord[]
) {
  const results: { target: string; sent: boolean; reason?: string }[] = [];
  for (const record of records) {
    if (!record.email) {
      results.push({ target: record.target_name, sent: false, reason: "No email on file" });
      continue;
    }
    const res = await fetch(`${supabaseUrl}/functions/v1/send-platform-billing-invoice`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        record_id: record.id,
        recipient_email: record.email,
        recipient_name: record.target_name,
      }),
    });
    results.push({ target: record.target_name, sent: res.ok, reason: res.ok ? undefined : await res.text() });
  }
  return results;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    if (!(await isAuthorized(req, adminClient, serviceRoleKey))) {
      return jsonResponse({ error: "Not authorised" }, 403);
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    let periodStart: string | undefined = body.period_start;
    let periodEnd: string | undefined = body.period_end;

    if (!periodStart && body.month) {
      const [year, month] = String(body.month).split("-").map(Number);
      periodStart = toDateStr(new Date(Date.UTC(year, month - 1, 1)));
      periodEnd = toDateStr(new Date(Date.UTC(year, month, 0)));
    }

    if (periodStart && periodEnd) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || periodEnd < periodStart) {
        return jsonResponse({ error: "Invalid billing period" }, 400);
      }
      const result = await generatePeriod(adminClient, periodStart, periodEnd, null);
      return jsonResponse({
        success: true,
        period_id: result.period_id,
        period: `${periodStart} to ${periodEnd}`,
        total_records: result.total_records,
        total_amount: result.total_amount,
      });
    }

    // Scheduled run on the 1st of each month: start each rate's period when due and email the invoices.
    const now = new Date();
    const year = now.getUTCFullYear();
    const monthIndex = now.getUTCMonth();
    const runs = [];
    for (const [frequency, length] of Object.entries(FREQUENCY_MONTHS)) {
      if (!isPeriodStartMonth(frequency, monthIndex)) continue;
      const start = toDateStr(new Date(Date.UTC(year, monthIndex, 1)));
      const end = toDateStr(new Date(Date.UTC(year, monthIndex + length, 0)));
      const result = await generatePeriod(adminClient, start, end, frequency);
      const emails = result.skipped ? [] : await sendInvoices(supabaseUrl, serviceRoleKey, result.records);
      runs.push({ frequency, period: `${start} to ${end}`, ...result, records: undefined, emails });
    }

    return jsonResponse({ success: true, runs });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500
    );
  }
});
