import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Tier } from "@/lib/profile.functions";
import { notifyProposalStatusChange } from "@/lib/alerts.server";

export type ProposalStatus =
  "draft" | "submitted" | "under_scrutiny" | "returned_for_correction" | "approved" | "rejected";

export type WorkflowProposal = {
  id: string;
  project_id: string;
  project_name: string;
  state_id: string | null;
  state_name: string | null;
  district_name: string | null;
  status: ProposalStatus;
  submitted_at: string | null;
  created_at: string | null;
  purpose: string | null;
  remarks: string | null;
  parcel_count: number;
  can_advance: boolean;
  can_return: boolean;
};

export const ADVANCE_SEQUENCE: ProposalStatus[] = [
  "draft",
  "submitted",
  "under_scrutiny",
  "approved",
];

/** Who moves a case out of each stage, and what it becomes. */
type Transition = { to: ProposalStatus; tiers: Tier[]; actor: string };

export const TRANSITIONS: Partial<Record<ProposalStatus, Transition>> = {
  draft: { to: "submitted", tiers: ["implementing_agency"], actor: "Implementing agency" },
  submitted: { to: "under_scrutiny", tiers: ["state_government"], actor: "State government" },
  under_scrutiny: { to: "approved", tiers: ["central_ministry"], actor: "Central ministry" },
  returned_for_correction: {
    to: "submitted",
    tiers: ["implementing_agency"],
    actor: "Implementing agency",
  },
};

const RETURN_TIERS: Tier[] = ["state_government", "central_ministry"];

export function nextStatus(status: ProposalStatus): ProposalStatus | null {
  return TRANSITIONS[status]?.to ?? null;
}

export function stageActor(status: ProposalStatus): string | null {
  return TRANSITIONS[status]?.actor ?? null;
}

export function canAdvance(tier: Tier | undefined, status: ProposalStatus): boolean {
  const rule = TRANSITIONS[status];
  return !!tier && !!rule && rule.tiers.includes(tier);
}

export function canReturn(tier: Tier | undefined, status: ProposalStatus): boolean {
  if (!tier || !RETURN_TIERS.includes(tier)) return false;
  return status === "submitted" || status === "under_scrutiny";
}

const ALLOWED_TIERS: Tier[] = [
  "central_ministry",
  "state_government",
  "district_authority",
  "implementing_agency",
];

type Caller = {
  userId: string;
  tier: Tier;
  roleName: string;
  jurisdictionId: string | null;
};

async function loadCaller(userId: string): Promise<Caller> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, jurisdiction_id, roles(name, tier)")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const role = (data?.roles ?? null) as unknown as { name: string; tier: Tier } | null;
  const tier = role?.tier ?? "public";
  if (!data || !ALLOWED_TIERS.includes(tier)) throw new Error("Forbidden");
  return {
    userId,
    tier,
    roleName: role?.name ?? tier,
    jurisdictionId: data.jurisdiction_id ?? null,
  };
}

/**
 * Project ids the caller may act on. `null` means "every project" (central
 * ministry). Agencies are scoped by the proposals they submitted, not by
 * jurisdiction, so they get `null` here and are filtered separately.
 */
async function scopedProjectIds(
  caller: Caller,
  filterStateId?: string | null,
): Promise<string[] | null> {
  if (caller.tier === "central_ministry" || caller.tier === "implementing_agency") {
    if (filterStateId && filterStateId !== "all") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin
        .from("projects")
        .select("id")
        .or(`district_id.eq.${filterStateId},state_id.eq.${filterStateId}`);
      if (error) throw new Error(error.message);
      return (data ?? []).map((p) => p.id);
    }
    return null;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (caller.tier === "state_government") {
    if (filterStateId && filterStateId !== "all") {
      const { data, error } = await supabaseAdmin
        .from("projects")
        .select("id")
        .or(`district_id.eq.${filterStateId},state_id.eq.${filterStateId}`);
      if (error) throw new Error(error.message);
      return (data ?? []).map((p) => p.id);
    }
    return null;
  }

  if (caller.tier === "district_authority") {
    if (filterStateId && filterStateId !== "all") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin
        .from("projects")
        .select("id")
        .or(`district_id.eq.${filterStateId},state_id.eq.${filterStateId}`);
      if (error) throw new Error(error.message);
      return (data ?? []).map((p) => p.id);
    }
    return null;
  }

  return [];
}

export const getWorkflowProposals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { stateId?: string | null } | void) => {
    return { stateId: input?.stateId ?? null };
  })
  .handler(async ({ data: inputData, context }): Promise<WorkflowProposal[]> => {
    const caller = await loadCaller(context.userId);
    const projectIds = await scopedProjectIds(caller, inputData?.stateId);
    if (projectIds && projectIds.length === 0) return [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("proposals")
      .select(
        "id, project_id, status, submitted_at, created_at, purpose, remarks, projects(id, name, state_id, district_id)",
      )
      .order("created_at", { ascending: false });

    if (projectIds) query = query.in("project_id", projectIds);
    if (caller.tier === "implementing_agency") query = query.eq("submitted_by", caller.userId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const counts = new Map<string, number>();
    const { data: jurisdictions } = await supabaseAdmin.from("jurisdictions").select("id, name");
    const jurNames = new Map((jurisdictions ?? []).map((j) => [j.id, j.name]));

    if (rows.length > 0) {
      const { data: parcels } = await supabaseAdmin
        .from("parcels")
        .select("id, project_id")
        .in("project_id", [...new Set(rows.map((r) => r.project_id))]);
      for (const p of parcels ?? []) {
        counts.set(p.project_id, (counts.get(p.project_id) ?? 0) + 1);
      }
    }

    return rows.map((row) => {
      const project = row.projects as unknown as {
        id: string;
        name: string;
        state_id: string | null;
        district_id: string | null;
      } | null;
      const status = (row.status ?? "draft") as ProposalStatus;
      const stateName = project?.state_id ? (jurNames.get(project.state_id) ?? null) : null;
      const districtName = project?.district_id
        ? (jurNames.get(project.district_id) ?? null)
        : null;

      return {
        id: row.id,
        project_id: row.project_id,
        project_name: project?.name ?? "Untitled project",
        state_id: project?.state_id ?? null,
        state_name: stateName,
        district_name: districtName,
        status,
        submitted_at: row.submitted_at,
        created_at: row.created_at,
        purpose: row.purpose,
        remarks: row.remarks,
        parcel_count: counts.get(row.project_id) ?? 0,
        can_advance: canAdvance(caller.tier, status),
        can_return: canReturn(caller.tier, status),
      };
    });
  });

async function assertInScope(caller: Caller, proposalId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("proposals")
    .select("id, status, project_id, submitted_by")
    .eq("id", proposalId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Proposal not found");

  if (caller.tier === "implementing_agency") {
    if (data.submitted_by !== caller.userId) throw new Error("Forbidden");
    return data;
  }
  if (
    caller.tier === "state_government" ||
    caller.tier === "central_ministry" ||
    caller.tier === "district_authority"
  ) {
    return data;
  }
  const projectIds = await scopedProjectIds(caller);
  if (projectIds && !projectIds.includes(data.project_id)) throw new Error("Forbidden");
  return data;
}

async function recordStage(proposalId: string, stageName: string, caller: Caller, status: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("workflow_stages").insert({
    entity_type: "proposal",
    entity_id: proposalId,
    stage_name: stageName,
    actor_role: caller.roleName,
    actor_id: caller.userId,
    status,
    entered_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export const advanceProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { proposalId: string }) => {
    if (!input?.proposalId) throw new Error("Missing proposal");
    return input;
  })
  .handler(async ({ data, context }) => {
    const caller = await loadCaller(context.userId);
    const proposal = await assertInScope(caller, data.proposalId);
    const status = (proposal.status ?? "draft") as ProposalStatus;
    const rule = TRANSITIONS[status];
    if (!rule) throw new Error("This proposal is already at the final stage.");
    if (!rule.tiers.includes(caller.tier)) {
      throw new Error(`Only the ${rule.actor.toLowerCase()} can move this case forward.`);
    }
    const next = rule.to;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const patch = {
      status: next,
      // Resubmission clears the reviewer's correction note.
      ...(next === "submitted" ? { submitted_at: now, remarks: null } : {}),
      ...(next === "approved" ? { decided_at: now, decided_by: caller.userId } : {}),
    };

    const { error } = await supabaseAdmin.from("proposals").update(patch).eq("id", data.proposalId);
    if (error) throw new Error(error.message);

    if (next === "approved") {
      const { error: projectError } = await supabaseAdmin
        .from("projects")
        .update({ status: "approved" })
        .eq("id", proposal.project_id);
      if (projectError) throw new Error(projectError.message);
    } else if (next === "under_scrutiny") {
      await supabaseAdmin
        .from("projects")
        .update({ status: "under_scrutiny" })
        .eq("id", proposal.project_id);
    }

    await recordStage(data.proposalId, next, caller, "completed");
    await notifyProposalStatusChange({
      proposalId: data.proposalId,
      from: proposal.status ?? null,
      to: next,
    });
    return { status: next as ProposalStatus };
  });

export const returnProposalForCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { proposalId: string; remarks: string }) => {
    if (!input?.proposalId) throw new Error("Missing proposal");
    const remarks = (input.remarks ?? "").trim();
    if (!remarks) throw new Error("Please add a note explaining what needs correcting.");
    return { proposalId: input.proposalId, remarks: remarks.slice(0, 2000) };
  })
  .handler(async ({ data, context }) => {
    const caller = await loadCaller(context.userId);
    const proposal = await assertInScope(caller, data.proposalId);
    const status = (proposal.status ?? "draft") as ProposalStatus;
    if (!canReturn(caller.tier, status)) {
      throw new Error("Only the reviewing authority can return this case for correction.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("proposals")
      .update({ status: "returned_for_correction", remarks: data.remarks })
      .eq("id", data.proposalId);
    if (error) throw new Error(error.message);

    await supabaseAdmin
      .from("projects")
      .update({ status: "returned_for_correction" })
      .eq("id", proposal.project_id);

    await recordStage(data.proposalId, "returned_for_correction", caller, "completed");
    await notifyProposalStatusChange({
      proposalId: data.proposalId,
      from: status,
      to: "returned_for_correction",
    });
    return { status: "returned_for_correction" as ProposalStatus };
  });
