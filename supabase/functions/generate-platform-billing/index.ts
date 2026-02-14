import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const body =
      req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const targetMonth: string | undefined = body.month;

    const now = new Date();
    let periodStart: Date;
    let periodEnd: Date;

    if (targetMonth) {
      const [year, month] = targetMonth.split("-").map(Number);
      periodStart = new Date(Date.UTC(year, month - 1, 1));
      periodEnd = new Date(Date.UTC(year, month, 0));
    } else {
      periodStart = new Date(
        Date.UTC(now.getFullYear(), now.getMonth(), 1)
      );
      periodEnd = new Date(
        Date.UTC(now.getFullYear(), now.getMonth() + 1, 0)
      );
    }

    const periodStartStr = periodStart.toISOString().split("T")[0];
    const periodEndStr = periodEnd.toISOString().split("T")[0];

    const { data: existingPeriod } = await adminClient
      .from("platform_billing_periods")
      .select("*")
      .eq("period_start", periodStartStr)
      .eq("period_end", periodEndStr)
      .maybeSingle();

    if (existingPeriod?.status === "finalized") {
      return jsonResponse(
        {
          error: "This billing period has been finalized and cannot be regenerated",
        },
        400
      );
    }

    let billingPeriod: { id: string };

    if (existingPeriod) {
      await adminClient
        .from("platform_billing_records")
        .delete()
        .eq("billing_period_id", existingPeriod.id);
      await adminClient
        .from("platform_billing_member_snapshots")
        .delete()
        .eq("billing_period_id", existingPeriod.id);

      const { data: updated } = await adminClient
        .from("platform_billing_periods")
        .update({
          status: "generating",
          generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingPeriod.id)
        .select()
        .single();
      billingPeriod = updated!;
    } else {
      const { data: created } = await adminClient
        .from("platform_billing_periods")
        .insert({
          period_start: periodStartStr,
          period_end: periodEndStr,
          billing_frequency: "monthly",
          status: "generating",
          generated_at: new Date().toISOString(),
        })
        .select()
        .single();
      billingPeriod = created!;
    }

    const { data: rates } = await adminClient
      .from("platform_billing_rates")
      .select("*")
      .eq("is_active", true)
      .lte("effective_from", periodEndStr)
      .or(`effective_to.is.null,effective_to.gte.${periodStartStr}`);

    const activeRates = (rates || []) as BillingRate[];
    let totalRecords = 0;
    let totalAmount = 0;

    const dueDateObj = new Date(
      Date.UTC(periodEnd.getFullYear(), periodEnd.getMonth() + 1, 14)
    );
    const dueDate = dueDateObj.toISOString().split("T")[0];

    for (const targetType of [
      "club",
      "state_association",
      "national_association",
    ]) {
      const typeRates = activeRates.filter(
        (r) => r.billing_target === targetType
      );
      if (typeRates.length === 0) continue;

      let entities: { id: string; name: string }[] = [];

      if (targetType === "club") {
        const { data } = await adminClient
          .from("clubs")
          .select("id, name")
          .order("name");
        entities = data || [];
      } else if (targetType === "state_association") {
        const { data } = await adminClient
          .from("state_associations")
          .select("id, name")
          .order("name");
        entities = data || [];
      } else {
        const { data } = await adminClient
          .from("national_associations")
          .select("id, name")
          .order("name");
        entities = data || [];
      }

      for (const entity of entities) {
        const specificRate = typeRates.find(
          (r) => r.target_entity_id === entity.id
        );
        const genericRate = typeRates.find(
          (r) => r.target_entity_id === null
        );
        const applicableRate = specificRate || genericRate;
        if (!applicableRate) continue;

        let memberCount = 0;
        let newMembersCount = 0;

        if (targetType === "club") {
          const { count } = await adminClient
            .from("members")
            .select("id", { count: "exact", head: true })
            .eq("club_id", entity.id)
            .eq("membership_status", "active");
          memberCount = count || 0;

          const { count: newCount } = await adminClient
            .from("members")
            .select("id", { count: "exact", head: true })
            .eq("club_id", entity.id)
            .eq("membership_status", "active")
            .gte("created_at", periodStartStr)
            .lte("created_at", periodEndStr);
          newMembersCount = newCount || 0;
        } else if (targetType === "state_association") {
          const { data: clubs } = await adminClient
            .from("clubs")
            .select("id")
            .eq("state_association_id", entity.id);
          const clubIds = (clubs || []).map((c) => c.id);

          if (clubIds.length > 0) {
            const { count } = await adminClient
              .from("members")
              .select("id", { count: "exact", head: true })
              .in("club_id", clubIds)
              .eq("membership_status", "active");
            memberCount = count || 0;

            const { count: newCount } = await adminClient
              .from("members")
              .select("id", { count: "exact", head: true })
              .in("club_id", clubIds)
              .eq("membership_status", "active")
              .gte("created_at", periodStartStr)
              .lte("created_at", periodEndStr);
            newMembersCount = newCount || 0;
          }
        } else {
          const { data: states } = await adminClient
            .from("state_associations")
            .select("id")
            .eq("national_association_id", entity.id);
          const stateIds = (states || []).map((s) => s.id);

          if (stateIds.length > 0) {
            const { data: clubs } = await adminClient
              .from("clubs")
              .select("id")
              .in("state_association_id", stateIds);
            const clubIds = (clubs || []).map((c) => c.id);

            if (clubIds.length > 0) {
              const { count } = await adminClient
                .from("members")
                .select("id", { count: "exact", head: true })
                .in("club_id", clubIds)
                .eq("membership_status", "active");
              memberCount = count || 0;

              const { count: newCount } = await adminClient
                .from("members")
                .select("id", { count: "exact", head: true })
                .in("club_id", clubIds)
                .eq("membership_status", "active")
                .gte("created_at", periodStartStr)
                .lte("created_at", periodEndStr);
              newMembersCount = newCount || 0;
            }
          }
        }

        if (memberCount === 0) continue;

        const annualRate =
          applicableRate.annual_rate || applicableRate.rate_per_member * 12;
        const monthlyRatePerMember = annualRate / 12;
        const billingTotal = parseFloat(
          (memberCount * monthlyRatePerMember).toFixed(2)
        );

        const { data: record } = await adminClient
          .from("platform_billing_records")
          .insert({
            billing_rate_id: applicableRate.id,
            billing_period_id: billingPeriod.id,
            target_type: targetType,
            target_id: entity.id,
            target_name: entity.name,
            billing_period_start: periodStartStr,
            billing_period_end: periodEndStr,
            member_count: memberCount,
            rate_per_member: parseFloat(monthlyRatePerMember.toFixed(2)),
            annual_rate: annualRate,
            total_amount: billingTotal,
            payment_status: "pending",
            due_date: dueDate,
          })
          .select()
          .single();

        await adminClient.from("platform_billing_member_snapshots").insert({
          billing_period_id: billingPeriod.id,
          billing_record_id: record?.id || null,
          target_type: targetType,
          target_id: entity.id,
          target_name: entity.name,
          total_active_members: memberCount,
          new_members_this_period: newMembersCount,
          snapshot_date: periodStartStr,
        });

        totalRecords++;
        totalAmount += billingTotal;
      }
    }

    await adminClient
      .from("platform_billing_periods")
      .update({
        status: "generated",
        total_records: totalRecords,
        total_amount: parseFloat(totalAmount.toFixed(2)),
        updated_at: new Date().toISOString(),
      })
      .eq("id", billingPeriod.id);

    return jsonResponse({
      success: true,
      period_id: billingPeriod.id,
      period: `${periodStartStr} to ${periodEndStr}`,
      total_records: totalRecords,
      total_amount: parseFloat(totalAmount.toFixed(2)),
    });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500
    );
  }
});
