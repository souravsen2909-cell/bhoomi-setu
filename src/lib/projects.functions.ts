import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Tier } from "@/lib/profile.functions";

// Agencies raise projects; the ministry may also register one directly.
export const CREATE_PROJECT_TIERS: Tier[] = ["implementing_agency", "central_ministry"];

export const SECTORS = ["highway", "railway", "irrigation", "industrial corridor"] as const;
export type Sector = (typeof SECTORS)[number];

export type NewProject = {
  name: string;
  sector: Sector;
  requiring_body: string;
  state_id: string;
  district_id: string | null;
  estimated_area_ha: number | null;
};

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: NewProject) => {
    const name = input.name?.trim() ?? "";
    const requiringBody = input.requiring_body?.trim() ?? "";
    if (!name) throw new Error("Project name is required.");
    if (name.length > 200) throw new Error("Project name is too long.");
    if (!requiringBody) throw new Error("Requiring body is required.");
    if (!SECTORS.includes(input.sector)) throw new Error("Choose a valid sector.");
    if (!input.state_id) throw new Error("Choose a state.");
    const areaRaw = input.estimated_area_ha;
    const area = areaRaw === null || areaRaw === undefined ? null : Number(areaRaw);
    if (area !== null && (!Number.isFinite(area) || area < 0)) {
      throw new Error("Estimated area must be a positive number.");
    }
    return {
      name,
      sector: input.sector,
      requiring_body: requiringBody,
      state_id: input.state_id,
      district_id: input.district_id || null,
      estimated_area_ha: area,
    } satisfies NewProject;
  })
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: caller, error: callerError } = await supabaseAdmin
      .from("users")
      .select("id, roles(tier)")
      .eq("id", context.userId)
      .maybeSingle();
    if (callerError) throw new Error(callerError.message);
    const role = (caller?.roles ?? null) as unknown as { tier: Tier } | null;
    if (!CREATE_PROJECT_TIERS.includes(role?.tier ?? "public")) throw new Error("Forbidden");

    // Both jurisdictions must exist and the district must sit inside the state.
    const ids = [data.state_id, ...(data.district_id ? [data.district_id] : [])];
    const { data: places, error: placeError } = await supabaseAdmin
      .from("jurisdictions")
      .select("id, level, parent_id")
      .in("id", ids);
    if (placeError) throw new Error(placeError.message);

    const state = (places ?? []).find((p) => p.id === data.state_id);
    if (!state || state.level !== "state") throw new Error("Choose a valid state.");
    if (data.district_id) {
      const district = (places ?? []).find((p) => p.id === data.district_id);
      if (!district || district.level !== "district" || district.parent_id !== data.state_id) {
        throw new Error("The district must belong to the selected state.");
      }
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("projects")
      .insert({
        name: data.name,
        sector: data.sector,
        requiring_body: data.requiring_body,
        state_id: data.state_id,
        district_id: data.district_id,
        estimated_area_ha: data.estimated_area_ha,
        created_by: context.userId,
        status: "pending_verification",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Every new project enters the approval pipeline as a submitted proposal:
    // state government verifies it, then the central ministry approves it.
    const { data: proposal, error: proposalError } = await supabaseAdmin
      .from("proposals")
      .insert({
        project_id: inserted.id,
        submitted_by: context.userId,
        status: "submitted",
        submitted_at: new Date().toISOString(),
        purpose: `${data.sector} acquisition for ${data.requiring_body}`,
      })
      .select("id")
      .single();
    if (proposalError) throw new Error(proposalError.message);

    await supabaseAdmin.from("workflow_stages").insert({
      entity_type: "proposal",
      entity_id: proposal.id,
      stage_name: "submitted",
      actor_role: role?.tier ?? "implementing_agency",
      actor_id: context.userId,
      status: "completed",
      entered_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });

    // Send in-app notification confirming project creation with all details
    await supabaseAdmin.from("alerts").insert({
      recipient_id: context.userId,
      channel: "in_app",
      message: `Project created with complete details: "${data.name}" (${data.sector} sector for ${data.requiring_body}). Estimated area: ${data.estimated_area_ha ?? "—"} ha. Proposal submitted for state and central verification.`,
      related_entity_type: "project",
      related_entity_id: inserted.id,
      sent_at: new Date().toISOString(),
    });

    return { id: inserted.id };
  });

export const DELETE_PROJECT_TIERS: Tier[] = ["central_ministry", "implementing_agency"];

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    const id = input?.id?.trim() ?? "";
    if (!id) throw new Error("Project id is required.");
    return { id };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: caller, error: callerError } = await supabaseAdmin
      .from("users")
      .select("id, roles(tier)")
      .eq("id", context.userId)
      .maybeSingle();
    if (callerError) throw new Error(callerError.message);
    const role = (caller?.roles ?? null) as unknown as { tier: Tier } | null;
    const callerTier = role?.tier ?? "public";
    if (!DELETE_PROJECT_TIERS.includes(callerTier)) throw new Error("Forbidden");

    // An agency may only remove a project it raised itself.
    if (callerTier === "implementing_agency") {
      const [own, raised] = await Promise.all([
        supabaseAdmin
          .from("projects")
          .select("id")
          .eq("id", data.id)
          .eq("created_by", context.userId)
          .maybeSingle(),
        supabaseAdmin
          .from("proposals")
          .select("project_id")
          .eq("project_id", data.id)
          .eq("submitted_by", context.userId)
          .maybeSingle(),
      ]);
      if (!own.data && !raised.data) throw new Error("Forbidden");
    }

    const fail = (error: { message: string } | null) => {
      if (error) throw new Error(error.message);
    };

    // Collect every parcel belonging to the project, then remove dependants first.
    const { data: parcels, error: parcelError } = await supabaseAdmin
      .from("parcels")
      .select("id")
      .eq("project_id", data.id);
    fail(parcelError);
    const parcelIds = (parcels ?? []).map((p) => p.id);

    if (parcelIds.length > 0) {
      const { data: awards, error: awardError } = await supabaseAdmin
        .from("awards")
        .select("id")
        .in("parcel_id", parcelIds);
      fail(awardError);
      const awardIds = (awards ?? []).map((a) => a.id);
      if (awardIds.length > 0) {
        fail((await supabaseAdmin.from("compensation").delete().in("award_id", awardIds)).error);
        fail((await supabaseAdmin.from("awards").delete().in("id", awardIds)).error);
      }

      const { data: families, error: familyError } = await supabaseAdmin
        .from("affected_families")
        .select("id")
        .in("parcel_id", parcelIds);
      fail(familyError);
      const familyIds = (families ?? []).map((f) => f.id);
      if (familyIds.length > 0) {
        fail((await supabaseAdmin.from("rr_benefits").delete().in("family_id", familyIds)).error);
        fail((await supabaseAdmin.from("affected_families").delete().in("id", familyIds)).error);
      }

      fail(
        (await supabaseAdmin.from("possession_records").delete().in("parcel_id", parcelIds)).error,
      );
      fail((await supabaseAdmin.from("disputes").delete().in("parcel_id", parcelIds)).error);
      fail(
        (await supabaseAdmin.from("land_notifications").delete().in("parcel_id", parcelIds)).error,
      );
      fail(
        (await supabaseAdmin.from("parcel_ownership").delete().in("parcel_id", parcelIds)).error,
      );
      fail((await supabaseAdmin.from("parcels").delete().in("id", parcelIds)).error);
    }

    fail((await supabaseAdmin.from("proposals").delete().eq("project_id", data.id)).error);
    fail((await supabaseAdmin.from("projects").delete().eq("id", data.id)).error);

    return { ok: true };
  });
