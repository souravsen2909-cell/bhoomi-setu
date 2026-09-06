import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { GeoJsonGeometry } from "@/lib/public-map.functions";
import type { Tier } from "@/lib/profile.functions";

/** Agencies own their projects; the ministry can look over the same board. */
export const AGENCY_TIERS: Tier[] = ["implementing_agency", "central_ministry"];

/** Only the implementing agency edits the record; the ministry is read-only. */
export const PROJECT_EDIT_TIERS: Tier[] = ["implementing_agency"];

/** Tiers that get a project board: agencies, the ministry and the district office. */
export const PROJECT_BOARD_TIERS: Tier[] = [
  ...AGENCY_TIERS,
  "district_authority",
  "state_government",
];

export type AgencyProjectCard = {
  id: string;
  name: string;
  sector: string | null;
  requiring_body: string;
  status: string;
  stage: string;
  state_name: string | null;
  district_name: string | null;
  created_at: string | null;
  parcels: number;
  area_notified: number;
  area_taken: number;
  families: number;
  declared: number;
  paid: number;
  pending: number;
  disputes: number;
};

export type AgencyPayment = {
  compensation_id: string;
  award_id: string;
  parcel_id: string;
  survey_number: string;
  landowner_name: string;
  landowner_email: string | null;
  assessed_amount: number;
  disbursed_amount: number | null;
  status: string;
  disbursed_date: string | null;
  transaction_ref: string | null;
};

export type AgencyParcelRow = {
  id: string;
  survey_number: string;
  village: string | null;
  area_hectares: number | null;
  status: string;
  families: number;
  acquired: boolean;
  geometry: GeoJsonGeometry | null;
};

const asGeometry = (value: unknown): GeoJsonGeometry | null => {
  let candidate: unknown = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  if (
    candidate &&
    typeof candidate === "object" &&
    "type" in candidate &&
    "coordinates" in candidate
  ) {
    return candidate as GeoJsonGeometry;
  }
  return null;
};

export type AgencyIssue = {
  id: string;
  parcel_id: string;
  survey_number: string;
  dispute_type: string;
  description: string | null;
  status: string;
  filed_at: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  raised_by_name: string | null;
};

export type AgencyProjectDetail = {
  project: AgencyProjectCard;
  parcels: AgencyParcelRow[];
  payments: AgencyPayment[];
  issues: AgencyIssue[];
};

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v) || 0);

const NOTIFIED_ONWARDS = [
  "notified",
  "under_survey",
  "award_declared",
  "compensation_paid",
  "possession_taken",
  "disputed",
];

const STAGE_FOR_PROPOSAL: Record<string, string> = {
  draft: "Raised by agency",
  submitted: "With state for verification",
  under_scrutiny: "With central ministry for approval",
  returned_for_correction: "Returned for correction",
  approved: "Approved — parcels & families",
  rejected: "Rejected",
};

type Caller = { userId: string; tier: Tier; jurisdictionId: string | null };

async function loadCaller(userId: string): Promise<Caller> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, jurisdiction_id, roles(tier)")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const role = (data?.roles ?? null) as unknown as { tier: Tier } | null;
  const tier = role?.tier ?? "public";
  if (!data || !PROJECT_BOARD_TIERS.includes(tier)) throw new Error("Forbidden");
  return { userId, tier, jurisdictionId: data.jurisdiction_id ?? null };
}

/** Ids of the projects this caller may see on the project board. */
async function scopedProjectIds(caller: Caller): Promise<string[] | null> {
  if (caller.tier === "central_ministry") return null; // all projects
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (caller.tier === "district_authority" || caller.tier === "state_government") {
    if (!caller.jurisdictionId) return [];
    const { data, error } = await supabaseAdmin
      .from("projects")
      .select("id")
      .or(`district_id.eq.${caller.jurisdictionId},state_id.eq.${caller.jurisdictionId}`);
    if (error) throw new Error(error.message);
    return (data ?? []).map((p) => p.id);
  }

  const [created, submitted] = await Promise.all([
    supabaseAdmin.from("projects").select("id").eq("created_by", caller.userId),
    supabaseAdmin.from("proposals").select("project_id").eq("submitted_by", caller.userId),
  ]);
  if (created.error) throw new Error(created.error.message);
  if (submitted.error) throw new Error(submitted.error.message);
  return [
    ...new Set([
      ...(created.data ?? []).map((p) => p.id),
      ...(submitted.data ?? []).map((p) => p.project_id),
    ]),
  ];
}

async function buildCards(ids: string[] | null): Promise<AgencyProjectCard[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (ids && ids.length === 0) return [];

  let projectQuery = supabaseAdmin
    .from("projects")
    .select("id, name, sector, requiring_body, status, state_id, district_id, created_at")
    .order("created_at", { ascending: false });
  if (ids) projectQuery = projectQuery.in("id", ids);

  const { data: projects, error } = await projectQuery;
  if (error) throw new Error(error.message);
  const projectIds = (projects ?? []).map((p) => p.id);
  if (projectIds.length === 0) return [];

  const [proposals, parcels, jurisdictions] = await Promise.all([
    supabaseAdmin
      .from("proposals")
      .select("project_id, status, created_at")
      .in("project_id", projectIds),
    supabaseAdmin
      .from("parcels")
      .select("id, project_id, area_hectares, status")
      .in("project_id", projectIds),
    supabaseAdmin.from("jurisdictions").select("id, name"),
  ]);
  for (const r of [proposals, parcels, jurisdictions])
    if (r.error) throw new Error(r.error.message);

  const names = new Map((jurisdictions.data ?? []).map((j) => [j.id, j.name]));
  const parcelRows = parcels.data ?? [];
  const parcelIds = parcelRows.map((p) => p.id);
  const parcelProject = new Map(parcelRows.map((p) => [p.id, p.project_id]));

  const [awards, families, disputes] = await Promise.all([
    parcelIds.length
      ? supabaseAdmin
          .from("awards")
          .select("id, parcel_id, declared_amount")
          .in("parcel_id", parcelIds)
      : Promise.resolve({ data: [], error: null } as const),
    parcelIds.length
      ? supabaseAdmin.from("affected_families").select("id, parcel_id").in("parcel_id", parcelIds)
      : Promise.resolve({ data: [], error: null } as const),
    parcelIds.length
      ? supabaseAdmin.from("disputes").select("id, parcel_id, status").in("parcel_id", parcelIds)
      : Promise.resolve({ data: [], error: null } as const),
  ]);
  for (const r of [awards, families, disputes]) if (r.error) throw new Error(r.error.message);

  const awardRows = awards.data ?? [];
  const compensation = awardRows.length
    ? await supabaseAdmin
        .from("compensation")
        .select("award_id, assessed_amount, disbursed_amount, disbursement_status")
        .in(
          "award_id",
          awardRows.map((a) => a.id),
        )
    : { data: [], error: null };
  if (compensation.error) throw new Error(compensation.error.message);
  const awardProject = new Map(
    awardRows.map((a) => [a.id, parcelProject.get(a.parcel_id) ?? ""] as const),
  );

  const cards = new Map<string, AgencyProjectCard>();
  for (const p of projects ?? []) {
    const proposal = (proposals.data ?? []).find((pr) => pr.project_id === p.id);
    cards.set(p.id, {
      id: p.id,
      name: p.name,
      sector: p.sector ?? null,
      requiring_body: p.requiring_body,
      status: p.status ?? "unknown",
      stage: STAGE_FOR_PROPOSAL[String(proposal?.status ?? "")] ?? "Not submitted yet",
      state_name: p.state_id ? (names.get(p.state_id) ?? null) : null,
      district_name: p.district_id ? (names.get(p.district_id) ?? null) : null,
      created_at: p.created_at ?? null,
      parcels: 0,
      area_notified: 0,
      area_taken: 0,
      families: 0,
      declared: 0,
      paid: 0,
      pending: 0,
      disputes: 0,
    });
  }

  for (const parcel of parcelRows) {
    const card = cards.get(parcel.project_id);
    if (!card) continue;
    card.parcels += 1;
    const status = String(parcel.status);
    if (NOTIFIED_ONWARDS.includes(status)) card.area_notified += num(parcel.area_hectares);
    if (status === "possession_taken") card.area_taken += num(parcel.area_hectares);
  }
  for (const f of families.data ?? []) {
    const card = cards.get(parcelProject.get(f.parcel_id ?? "") ?? "");
    if (card) card.families += 1;
  }
  for (const d of disputes.data ?? []) {
    if (String(d.status) === "resolved") continue;
    const card = cards.get(parcelProject.get(d.parcel_id) ?? "");
    if (card) card.disputes += 1;
  }
  for (const a of awardRows) {
    const card = cards.get(parcelProject.get(a.parcel_id) ?? "");
    if (card) card.declared += num(a.declared_amount);
  }
  for (const c of compensation.data ?? []) {
    const card = cards.get(awardProject.get(c.award_id) ?? "");
    if (!card) continue;
    if (String(c.disbursement_status) === "disbursed") card.paid += num(c.disbursed_amount);
    else card.pending += num(c.assessed_amount);
  }

  return [...cards.values()];
}

export const getAgencyProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AgencyProjectCard[]> => {
    const caller = await loadCaller(context.userId);
    return buildCards(await scopedProjectIds(caller));
  });

export const getAgencyProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { projectId: string }) => {
    if (!input?.projectId) throw new Error("Missing project");
    return { projectId: input.projectId };
  })
  .handler(async ({ data, context }): Promise<AgencyProjectDetail> => {
    const caller = await loadCaller(context.userId);
    const ids = await scopedProjectIds(caller);
    if (ids && !ids.includes(data.projectId)) throw new Error("Forbidden");

    const cards = await buildCards([data.projectId]);
    const project = cards[0];
    if (!project) throw new Error("This project could not be found.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: parcels, error } = await supabaseAdmin
      .from("parcels")
      .select("id, survey_number, village, area_hectares, status")
      .eq("project_id", data.projectId)
      .order("survey_number");
    if (error) throw new Error(error.message);

    const parcelIds = (parcels ?? []).map((p) => p.id);
    const surveyNumbers = new Map((parcels ?? []).map((p) => [p.id, p.survey_number]));

    const [familyRows, awardRows] = await Promise.all([
      parcelIds.length
        ? supabaseAdmin.from("affected_families").select("id, parcel_id").in("parcel_id", parcelIds)
        : Promise.resolve({ data: [], error: null } as const),
      parcelIds.length
        ? supabaseAdmin.from("awards").select("id, parcel_id").in("parcel_id", parcelIds)
        : Promise.resolve({ data: [], error: null } as const),
    ]);
    if (familyRows.error) throw new Error(familyRows.error.message);
    if (awardRows.error) throw new Error(awardRows.error.message);

    const awardParcel = new Map((awardRows.data ?? []).map((a) => [a.id, a.parcel_id] as const));
    const compensation = (awardRows.data ?? []).length
      ? await supabaseAdmin
          .from("compensation")
          .select(
            "id, award_id, assessed_amount, disbursed_amount, disbursement_status, disbursed_date, transaction_ref, landowners(full_name, users(email))",
          )
          .in(
            "award_id",
            (awardRows.data ?? []).map((a) => a.id),
          )
      : { data: [], error: null };
    if (compensation.error) throw new Error(compensation.error.message);

    const payments: AgencyPayment[] = (compensation.data ?? []).map((c) => {
      const owner = (c.landowners ?? null) as unknown as {
        full_name: string | null;
        users: { email: string } | null;
      } | null;
      const parcelId = awardParcel.get(c.award_id) ?? "";
      return {
        compensation_id: c.id,
        award_id: c.award_id,
        parcel_id: parcelId,
        survey_number: surveyNumbers.get(parcelId) ?? "—",
        landowner_name: owner?.full_name ?? "Landowner",
        landowner_email: owner?.users?.email ?? null,
        assessed_amount: num(c.assessed_amount),
        disbursed_amount: c.disbursed_amount === null ? null : num(c.disbursed_amount),
        status: String(c.disbursement_status ?? "pending"),
        disbursed_date: c.disbursed_date ?? null,
        transaction_ref: c.transaction_ref ?? null,
      };
    });

    const [geomRows, disputeRows] = await Promise.all([
      parcelIds.length
        ? supabaseAdmin.from("public_parcels").select("id, geom").in("id", parcelIds)
        : Promise.resolve({ data: [], error: null } as const),
      parcelIds.length
        ? supabaseAdmin
            .from("disputes")
            .select(
              "id, parcel_id, dispute_type, description, status, filed_at, resolved_at, resolution_notes, users(full_name)",
            )
            .in("parcel_id", parcelIds)
            .order("filed_at", { ascending: false })
        : Promise.resolve({ data: [], error: null } as const),
    ]);
    if (geomRows.error) throw new Error(geomRows.error.message);
    if (disputeRows.error) throw new Error(disputeRows.error.message);

    const geometries = new Map(
      (geomRows.data ?? []).map((g) => [String(g.id), asGeometry(g.geom)] as const),
    );

    const parcelRows: AgencyParcelRow[] = (parcels ?? []).map((p) => ({
      id: p.id,
      survey_number: p.survey_number,
      village: p.village ?? null,
      area_hectares: p.area_hectares === null ? null : num(p.area_hectares),
      status: String(p.status ?? "identified"),
      families: (familyRows.data ?? []).filter((f) => f.parcel_id === p.id).length,
      acquired: String(p.status ?? "") === "possession_taken",
      geometry: geometries.get(p.id) ?? null,
    }));

    const issues: AgencyIssue[] = (disputeRows.data ?? []).map((d) => {
      const raiser = (d.users ?? null) as unknown as { full_name: string | null } | null;
      return {
        id: String(d.id),
        parcel_id: String(d.parcel_id),
        survey_number: surveyNumbers.get(d.parcel_id) ?? "—",
        dispute_type: String(d.dispute_type ?? "other"),
        description: d.description ?? null,
        status: String(d.status ?? "filed"),
        filed_at: d.filed_at ?? null,
        resolved_at: d.resolved_at ?? null,
        resolution_notes: d.resolution_notes ?? null,
        raised_by_name: raiser?.full_name ?? null,
      };
    });

    return { project, parcels: parcelRows, payments, issues };
  });

/**
 * Marks one landowner's compensation as paid (or back to pending) and tells the
 * landowner in their portal.
 */
export const setCompensationPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      projectId: string;
      compensationId: string;
      paid: boolean;
      transactionRef?: string;
    }) => {
      if (!input?.projectId) throw new Error("Missing project");
      if (!input?.compensationId) throw new Error("Missing payment record");
      return {
        projectId: input.projectId,
        compensationId: input.compensationId,
        paid: !!input.paid,
        transactionRef: (input.transactionRef ?? "").trim().slice(0, 120),
      };
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const caller = await loadCaller(context.userId);
    if (!PROJECT_EDIT_TIERS.includes(caller.tier)) throw new Error("Forbidden");
    const ids = await scopedProjectIds(caller);
    if (ids && !ids.includes(data.projectId)) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("compensation")
      .select("id, assessed_amount, award_id, landowner_id, awards(parcel_id, parcels(project_id))")
      .eq("id", data.compensationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const award = (row?.awards ?? null) as unknown as {
      parcel_id: string;
      parcels: { project_id: string } | null;
    } | null;
    if (!row || award?.parcels?.project_id !== data.projectId) throw new Error("Forbidden");

    const { error: updateError } = await supabaseAdmin
      .from("compensation")
      .update(
        data.paid
          ? {
              disbursement_status: "disbursed",
              disbursed_amount: num(row.assessed_amount),
              disbursed_date: new Date().toISOString().slice(0, 10),
              transaction_ref: data.transactionRef || null,
            }
          : {
              disbursement_status: "pending",
              disbursed_amount: null,
              disbursed_date: null,
              transaction_ref: null,
            },
      )
      .eq("id", data.compensationId);
    if (updateError) throw new Error(updateError.message);

    if (award?.parcel_id) {
      const { data: parcel } = await supabaseAdmin
        .from("parcels")
        .select("status")
        .eq("id", award.parcel_id)
        .maybeSingle();
      const status = String(parcel?.status ?? "");
      if (data.paid && status === "award_declared") {
        await supabaseAdmin
          .from("parcels")
          .update({ status: "compensation_paid" })
          .eq("id", award.parcel_id);
      } else if (!data.paid && status === "compensation_paid") {
        await supabaseAdmin
          .from("parcels")
          .update({ status: "award_declared" })
          .eq("id", award.parcel_id);
      }
    }

    const { data: owner } = await supabaseAdmin
      .from("landowners")
      .select("user_id")
      .eq("id", row.landowner_id)
      .maybeSingle();
    if (owner?.user_id) {
      await supabaseAdmin.from("alerts").insert({
        recipient_id: owner.user_id,
        channel: "in_app",
        message: data.paid
          ? "Your compensation has been marked as paid. Sign in to My Land to see the payment details."
          : "Your compensation payment has been put back to pending. Sign in to My Land for the latest status.",
        related_entity_type: "compensation",
        related_entity_id: data.compensationId,
        sent_at: new Date().toISOString(),
      });
    }

    return { ok: true };
  });

/**
 * Manual selection mode: the agency sets a plot's ground reality itself —
 * possession taken over, an issue/dispute raised, or back to pending handover.
 */
export const setParcelGroundStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      projectId: string;
      parcelId: string;
      mode: "possession_taken" | "disputed" | "pending";
      note?: string;
    }) => {
      if (!input?.projectId) throw new Error("Missing project");
      if (!input?.parcelId) throw new Error("Missing plot");
      if (!["possession_taken", "disputed", "pending"].includes(input?.mode))
        throw new Error("Pick a status for this plot.");
      return {
        projectId: input.projectId,
        parcelId: input.parcelId,
        mode: input.mode,
        note: (input.note ?? "").trim().slice(0, 2000),
      };
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const caller = await loadCaller(context.userId);
    if (!PROJECT_EDIT_TIERS.includes(caller.tier)) throw new Error("Forbidden");
    const ids = await scopedProjectIds(caller);
    if (ids && !ids.includes(data.projectId)) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: parcel, error } = await supabaseAdmin
      .from("parcels")
      .select("id, project_id, status")
      .eq("id", data.parcelId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!parcel || parcel.project_id !== data.projectId) throw new Error("Forbidden");

    const today = new Date().toISOString().slice(0, 10);

    if (data.mode === "possession_taken") {
      await supabaseAdmin
        .from("parcels")
        .update({ status: "possession_taken" })
        .eq("id", parcel.id);
      const { data: existing } = await supabaseAdmin
        .from("possession_records")
        .select("id")
        .eq("parcel_id", parcel.id)
        .maybeSingle();
      if (existing?.id) {
        await supabaseAdmin
          .from("possession_records")
          .update({ status: "taken_over", taken_over_date: today, recorded_by: caller.userId })
          .eq("id", existing.id);
      } else {
        await supabaseAdmin.from("possession_records").insert({
          parcel_id: parcel.id,
          status: "taken_over",
          taken_over_date: today,
          recorded_by: caller.userId,
        });
      }
    } else if (data.mode === "disputed") {
      await supabaseAdmin.from("parcels").update({ status: "disputed" }).eq("id", parcel.id);
      const { data: open } = await supabaseAdmin
        .from("disputes")
        .select("id")
        .eq("parcel_id", parcel.id)
        .neq("status", "resolved")
        .maybeSingle();
      if (!open?.id) {
        await supabaseAdmin.from("disputes").insert({
          parcel_id: parcel.id,
          raised_by: caller.userId,
          dispute_type: "other",
          description: data.note || "Issue flagged by the implementing agency during handover.",
          status: "filed",
          filed_at: new Date().toISOString(),
        });
      }
    } else {
      const { data: paid } = await supabaseAdmin
        .from("compensation")
        .select("id, disbursement_status, awards!inner(parcel_id)")
        .eq("awards.parcel_id", parcel.id)
        .maybeSingle();
      const next =
        String(paid?.disbursement_status ?? "") === "disbursed"
          ? "compensation_paid"
          : paid?.id
            ? "award_declared"
            : "notified";
      await supabaseAdmin.from("parcels").update({ status: next }).eq("id", parcel.id);
      await supabaseAdmin
        .from("possession_records")
        .update({ status: "pending" })
        .eq("parcel_id", parcel.id);
    }

    return { ok: true };
  });
