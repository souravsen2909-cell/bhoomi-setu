import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Tier } from "@/lib/profile.functions";

export const DASHBOARD_TIERS: Tier[] = ["central_ministry", "state_government"];

export type DashboardTotals = {
  area_notified: number;
  area_acquired: number;
  compensation_disbursed: number;
  affected_families: number;
};

export type StateProgress = {
  state: string;
  identified: number;
  notified: number;
  award_declared: number;
  possession_taken: number;
};

export type ProjectRow = {
  id: string;
  name: string;
  status: string;
  sector: string | null;
  requiring_body: string;
  state_name: string | null;
  district_name: string | null;
  estimated_area_ha: number | null;
  created_at: string | null;
};

export type DashboardData = {
  totals: DashboardTotals;
  byState: StateProgress[];
  projects: ProjectRow[];
};

const NOTIFIED_ONWARDS = [
  "notified",
  "under_survey",
  "award_declared",
  "compensation_paid",
  "possession_taken",
  "disputed",
];

async function assertAllowed(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, roles(tier)")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const role = (data?.roles ?? null) as unknown as { tier: Tier } | null;
  const tier = role?.tier ?? "public";
  if (!DASHBOARD_TIERS.includes(tier)) throw new Error("Forbidden");
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v) || 0);

export const getDashboardData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardData> => {
    await assertAllowed(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [parcelsRes, compensationRes, familiesRes, projectsRes, jurisdictionsRes] =
      await Promise.all([
        supabaseAdmin.from("parcels").select("id, project_id, state_id, area_hectares, status"),
        supabaseAdmin.from("compensation").select("disbursed_amount, disbursement_status"),
        supabaseAdmin.from("affected_families").select("id, members_count"),
        supabaseAdmin
          .from("projects")
          .select(
            "id, name, status, sector, requiring_body, state_id, district_id, estimated_area_ha, created_at",
          )
          .order("created_at", { ascending: false }),
        supabaseAdmin.from("jurisdictions").select("id, name"),
      ]);

    for (const res of [parcelsRes, compensationRes, familiesRes, projectsRes, jurisdictionsRes]) {
      if (res.error) throw new Error(res.error.message);
    }

    const names = new Map((jurisdictionsRes.data ?? []).map((j) => [j.id, j.name]));
    const parcels = parcelsRes.data ?? [];

    const totals: DashboardTotals = {
      area_notified: parcels
        .filter((p) => NOTIFIED_ONWARDS.includes(String(p.status)))
        .reduce((sum, p) => sum + num(p.area_hectares), 0),
      area_acquired: parcels
        .filter((p) => String(p.status) === "possession_taken")
        .reduce((sum, p) => sum + num(p.area_hectares), 0),
      compensation_disbursed: (compensationRes.data ?? []).reduce(
        (sum, c) => sum + num(c.disbursed_amount),
        0,
      ),
      affected_families: (familiesRes.data ?? []).length,
    };

    const stateMap = new Map<string, StateProgress>();
    for (const p of parcels) {
      const key = p.state_id ? (names.get(p.state_id) ?? "Unassigned") : "Unassigned";
      const row =
        stateMap.get(key) ??
        ({
          state: key,
          identified: 0,
          notified: 0,
          award_declared: 0,
          possession_taken: 0,
        } satisfies StateProgress);
      const status = String(p.status);
      if (status === "possession_taken") row.possession_taken += 1;
      else if (status === "award_declared" || status === "compensation_paid")
        row.award_declared += 1;
      else if (status === "identified") row.identified += 1;
      else row.notified += 1;
      stateMap.set(key, row);
    }

    const projects: ProjectRow[] = (projectsRes.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status ?? "unknown",
      sector: p.sector ?? null,
      requiring_body: p.requiring_body,
      state_name: p.state_id ? (names.get(p.state_id) ?? null) : null,
      district_name: p.district_id ? (names.get(p.district_id) ?? null) : null,
      estimated_area_ha: p.estimated_area_ha === null ? null : num(p.estimated_area_ha),
      created_at: p.created_at ?? null,
    }));

    return {
      totals,
      byState: [...stateMap.values()].sort((a, b) => a.state.localeCompare(b.state)),
      projects,
    };
  });
