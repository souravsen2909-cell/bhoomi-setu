import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Tier } from "@/lib/profile.functions";
import { notifyParcelStatusChange } from "@/lib/alerts.server";

export const DISPUTE_TYPES = ["compensation amount", "ownership", "boundary"] as const;
export type DisputeType = (typeof DISPUTE_TYPES)[number];

export const DISPUTE_STATUSES = ["filed", "under_review", "resolved"] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

/** Only the district authority can move a dispute along. */
export const REVIEW_TIERS: Tier[] = ["district_authority"];
export const FILE_TIERS: Tier[] = ["landowner"];
/** Everyone else follows the status read-only. */
export const VIEW_TIERS: Tier[] = ["state_government", "central_ministry", "implementing_agency"];

export type DisputeParcelOption = {
  id: string;
  survey_number: string;
  village: string | null;
  area_hectares: number | null;
};

export type DisputeRow = {
  id: string;
  parcel_id: string;
  survey_number: string;
  village: string | null;
  dispute_type: string | null;
  description: string | null;
  status: DisputeStatus;
  filed_at: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
};

type Caller = {
  userId: string;
  tier: Tier;
  jurisdictionId: string | null;
};

async function loadCaller(userId: string): Promise<Caller> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, jurisdiction_id, roles(tier)")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const role = (data?.roles ?? null) as unknown as { tier: Tier } | null;
  return {
    userId,
    tier: role?.tier ?? "public",
    jurisdictionId: data?.jurisdiction_id ?? null,
  };
}

type ParcelJoin = { survey_number: string; village: string | null } | null;

function toRow(row: {
  id: string;
  parcel_id: string;
  dispute_type: string | null;
  description: string | null;
  status: string | null;
  filed_at: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  parcels?: unknown;
}): DisputeRow {
  const parcel = (row.parcels ?? null) as ParcelJoin;
  return {
    id: row.id,
    parcel_id: row.parcel_id,
    survey_number: parcel?.survey_number ?? "—",
    village: parcel?.village ?? null,
    dispute_type: row.dispute_type,
    description: row.description,
    status: (row.status ?? "filed") as DisputeStatus,
    filed_at: row.filed_at,
    resolved_at: row.resolved_at,
    resolution_notes: row.resolution_notes,
  };
}

const SELECT =
  "id, parcel_id, dispute_type, description, status, filed_at, resolved_at, resolution_notes, parcels(survey_number, village)";

/** Parcels the signed-in landowner owns, offered when filing a dispute. */
export const getMyDisputeParcels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DisputeParcelOption[]> => {
    const caller = await loadCaller(context.userId);
    if (!FILE_TIERS.includes(caller.tier)) return [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: owner, error: ownerError } = await supabaseAdmin
      .from("landowners")
      .select("id")
      .eq("user_id", caller.userId)
      .maybeSingle();
    if (ownerError) throw new Error(ownerError.message);
    if (!owner) return [];

    const { data, error } = await supabaseAdmin
      .from("parcel_ownership")
      .select("parcel_id, parcels(id, survey_number, village, area_hectares)")
      .eq("landowner_id", owner.id);
    if (error) throw new Error(error.message);

    return (data ?? []).flatMap((row) => {
      const parcel = row.parcels as unknown as DisputeParcelOption | null;
      return parcel ? [parcel] : [];
    });
  });

/**
 * Landowner: their own filed disputes. District: everything in its jurisdiction,
 * with actions. State and central: read-only view of the same jurisdiction /
 * the whole country. Agency: read-only view of its own projects' parcels.
 */
export const getDisputes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DisputeRow[]> => {
    const caller = await loadCaller(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (caller.tier === "central_ministry") {
      const { data, error } = await supabaseAdmin
        .from("disputes")
        .select(SELECT)
        .order("filed_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map(toRow);
    }

    if (caller.tier === "implementing_agency") {
      const { data: proposals, error: proposalError } = await supabaseAdmin
        .from("proposals")
        .select("project_id")
        .eq("submitted_by", caller.userId);
      if (proposalError) throw new Error(proposalError.message);
      const projectIds = [...new Set((proposals ?? []).map((p) => p.project_id))];
      if (projectIds.length === 0) return [];
      const { data: parcels, error: parcelError } = await supabaseAdmin
        .from("parcels")
        .select("id")
        .in("project_id", projectIds);
      if (parcelError) throw new Error(parcelError.message);
      const parcelIds = (parcels ?? []).map((p) => p.id);
      if (parcelIds.length === 0) return [];
      const { data, error } = await supabaseAdmin
        .from("disputes")
        .select(SELECT)
        .in("parcel_id", parcelIds)
        .order("filed_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map(toRow);
    }

    if (REVIEW_TIERS.includes(caller.tier) || caller.tier === "state_government") {
      if (!caller.jurisdictionId) return [];
      const { data: parcels, error: parcelError } = await supabaseAdmin
        .from("parcels")
        .select("id")
        .or(`district_id.eq.${caller.jurisdictionId},state_id.eq.${caller.jurisdictionId}`);
      if (parcelError) throw new Error(parcelError.message);
      const parcelIds = (parcels ?? []).map((p) => p.id);
      if (parcelIds.length === 0) return [];

      const { data, error } = await supabaseAdmin
        .from("disputes")
        .select(SELECT)
        .in("parcel_id", parcelIds)
        .order("filed_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map(toRow);
    }

    if (FILE_TIERS.includes(caller.tier)) {
      const { data, error } = await supabaseAdmin
        .from("disputes")
        .select(SELECT)
        .eq("raised_by", caller.userId)
        .order("filed_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map(toRow);
    }

    throw new Error("Forbidden");
  });

export const fileDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { parcelId: string; disputeType: DisputeType; description: string }) => {
    if (!input?.parcelId) throw new Error("Choose one of your parcels.");
    if (!DISPUTE_TYPES.includes(input.disputeType)) throw new Error("Choose a dispute type.");
    const description = (input.description ?? "").trim();
    if (!description) throw new Error("Please describe the dispute.");
    return {
      parcelId: input.parcelId,
      disputeType: input.disputeType,
      description: description.slice(0, 4000),
    };
  })
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const caller = await loadCaller(context.userId);
    if (!FILE_TIERS.includes(caller.tier)) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: owner, error: ownerError } = await supabaseAdmin
      .from("landowners")
      .select("id")
      .eq("user_id", caller.userId)
      .maybeSingle();
    if (ownerError) throw new Error(ownerError.message);
    if (!owner) throw new Error("No landowner record is linked to your account.");

    // Only a parcel the caller actually owns may be disputed.
    const { data: owned, error: ownedError } = await supabaseAdmin
      .from("parcel_ownership")
      .select("id")
      .eq("landowner_id", owner.id)
      .eq("parcel_id", data.parcelId)
      .maybeSingle();
    if (ownedError) throw new Error(ownedError.message);
    if (!owned) throw new Error("That parcel is not registered to you.");

    const { data: inserted, error } = await supabaseAdmin
      .from("disputes")
      .insert({
        parcel_id: data.parcelId,
        raised_by: caller.userId,
        dispute_type: data.disputeType,
        description: data.description,
        status: "filed",
        filed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // The parcel turns red everywhere — including the public map — while the
    // objection is open.
    const { data: before } = await supabaseAdmin
      .from("parcels")
      .select("status")
      .eq("id", data.parcelId)
      .maybeSingle();
    if (before?.status !== "disputed") {
      await supabaseAdmin.from("parcels").update({ status: "disputed" }).eq("id", data.parcelId);
      await notifyParcelStatusChange({
        parcelId: data.parcelId,
        from: before?.status ?? null,
        to: "disputed",
      });
    }

    return { id: inserted.id };
  });

/** Works out which stage a parcel returns to once its dispute is resolved. */
type ParcelStage =
  "identified" | "notified" | "award_declared" | "compensation_paid" | "possession_taken";

async function stageAfterResolution(parcelId: string): Promise<ParcelStage> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: possession } = await supabaseAdmin
    .from("possession_records")
    .select("id")
    .eq("parcel_id", parcelId)
    .limit(1);
  if (possession && possession.length > 0) return "possession_taken";

  const { data: awards } = await supabaseAdmin
    .from("awards")
    .select("id")
    .eq("parcel_id", parcelId);
  const awardIds = (awards ?? []).map((a) => a.id);
  if (awardIds.length > 0) {
    const { data: paid } = await supabaseAdmin
      .from("compensation")
      .select("id")
      .in("award_id", awardIds)
      .eq("disbursement_status", "disbursed")
      .limit(1);
    if (paid && paid.length > 0) return "compensation_paid";
    return "award_declared";
  }

  const { data: notified } = await supabaseAdmin
    .from("land_notifications")
    .select("id")
    .eq("parcel_id", parcelId)
    .limit(1);
  if (notified && notified.length > 0) return "notified";

  return "identified";
}

export const updateDisputeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { disputeId: string; status: "under_review" | "resolved"; notes: string }) => {
      if (!input?.disputeId) throw new Error("Missing dispute.");
      if (input.status !== "under_review" && input.status !== "resolved") {
        throw new Error("Choose a valid status.");
      }
      const notes = (input.notes ?? "").trim();
      if (input.status === "resolved" && !notes) {
        throw new Error("Add resolution notes before marking this resolved.");
      }
      return { disputeId: input.disputeId, status: input.status, notes: notes.slice(0, 4000) };
    },
  )
  .handler(async ({ data, context }): Promise<{ status: DisputeStatus }> => {
    const caller = await loadCaller(context.userId);
    if (!REVIEW_TIERS.includes(caller.tier)) throw new Error("Forbidden");
    if (!caller.jurisdictionId) throw new Error("Your account has no jurisdiction assigned.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: dispute, error: disputeError } = await supabaseAdmin
      .from("disputes")
      .select("id, parcel_id, parcels(district_id, state_id, projects(district_id, state_id))")
      .eq("id", data.disputeId)
      .maybeSingle();
    if (disputeError) throw new Error(disputeError.message);
    if (!dispute) throw new Error("Dispute not found.");

    const parcel = (dispute.parcels ?? null) as unknown as {
      district_id: string | null;
      state_id: string | null;
      projects?: { district_id: string | null; state_id: string | null } | null;
    } | null;
    // The plot itself, or the project it belongs to, must sit in this authority's area.
    const scopeIds = [
      parcel?.district_id,
      parcel?.state_id,
      parcel?.projects?.district_id,
      parcel?.projects?.state_id,
    ];
    if (!scopeIds.includes(caller.jurisdictionId)) throw new Error("Forbidden");

    const { error } = await supabaseAdmin
      .from("disputes")
      .update({
        status: data.status,
        ...(data.notes ? { resolution_notes: data.notes } : {}),
        ...(data.status === "resolved" ? { resolved_at: new Date().toISOString() } : {}),
      })
      .eq("id", data.disputeId);
    if (error) throw new Error(error.message);

    if (data.status === "resolved") {
      const stage = await stageAfterResolution(dispute.parcel_id);
      await supabaseAdmin.from("parcels").update({ status: stage }).eq("id", dispute.parcel_id);
      await notifyParcelStatusChange({
        parcelId: dispute.parcel_id,
        from: "disputed",
        to: stage,
      });
    }

    return { status: data.status };
  });
