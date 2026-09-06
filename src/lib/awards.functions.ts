import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Tier } from "@/lib/profile.functions";
import { notifyParcelStatusChange } from "@/lib/alerts.server";

const ALLOWED_TIERS: Tier[] = ["district_authority", "implementing_agency", "central_ministry"];

export type AwardParcel = {
  id: string;
  survey_number: string;
  area_hectares: number | null;
  status: string | null;
  award_count: number;
};

export type AwardRecord = {
  id: string;
  parcel_id: string;
  survey_number: string;
  award_number: string | null;
  declared_amount: number;
  declared_date: string | null;
  landowner_email: string | null;
};

export type LandType = "urban" | "rural";

export const LAND_TYPE_MULTIPLIER: Record<LandType, number> = {
  urban: 1,
  rural: 2,
};

/** Base + 100% solatium. */
export function computeCompensation(input: {
  areaHectares: number;
  circleRatePerHectare: number;
  landType: LandType;
  assetValue: number;
}) {
  const multiplier = LAND_TYPE_MULTIPLIER[input.landType] ?? 1;
  const land = (input.areaHectares || 0) * (input.circleRatePerHectare || 0) * multiplier;
  const base = land + (input.assetValue || 0);
  const solatium = base;
  return { multiplier, land, base, solatium, total: base + solatium };
}

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
  const tier = role?.tier ?? "public";
  if (!data || !ALLOWED_TIERS.includes(tier)) throw new Error("Forbidden");
  return { userId, tier, jurisdictionId: data.jurisdiction_id ?? null };
}

async function assertProjectInScope(caller: Caller, projectId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (caller.tier === "central_ministry") return;
  if (caller.tier === "implementing_agency") {
    const [{ data: proposal }, { data: owned }] = await Promise.all([
      supabaseAdmin
        .from("proposals")
        .select("project_id")
        .eq("project_id", projectId)
        .eq("submitted_by", caller.userId)
        .maybeSingle(),
      supabaseAdmin
        .from("projects")
        .select("id")
        .eq("id", projectId)
        .eq("created_by", caller.userId)
        .maybeSingle(),
    ]);
    if (!proposal && !owned) throw new Error("Forbidden");
    return;
  }
  if (!caller.jurisdictionId) throw new Error("Forbidden");
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .or(`district_id.eq.${caller.jurisdictionId},state_id.eq.${caller.jurisdictionId}`)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const getAwardParcels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { projectId: string }) => {
    if (!input?.projectId) throw new Error("Missing project");
    return input;
  })
  .handler(
    async ({ data, context }): Promise<{ parcels: AwardParcel[]; awards: AwardRecord[] }> => {
      const caller = await loadCaller(context.userId);
      await assertProjectInScope(caller, data.projectId);

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: parcels, error } = await supabaseAdmin
        .from("parcels")
        .select("id, survey_number, area_hectares, status")
        .eq("project_id", data.projectId)
        .order("survey_number");
      if (error) throw new Error(error.message);

      const ids = (parcels ?? []).map((p) => p.id);
      const names = new Map((parcels ?? []).map((p) => [p.id, p.survey_number]));
      const counts: Record<string, number> = {};
      let awards: AwardRecord[] = [];

      if (ids.length) {
        const { data: rows, error: aErr } = await supabaseAdmin
          .from("awards")
          .select("id, parcel_id, award_number, declared_amount, declared_date")
          .in("parcel_id", ids)
          .order("declared_date", { ascending: false });
        if (aErr) throw new Error(aErr.message);

        const awardIds = (rows ?? []).map((a) => a.id);
        const emails = new Map<string, string>();
        if (awardIds.length) {
          const { data: comp } = await supabaseAdmin
            .from("compensation")
            .select("award_id, landowners(users(email))")
            .in("award_id", awardIds);
          for (const row of comp ?? []) {
            const owner = (row.landowners ?? null) as unknown as {
              users: { email: string } | null;
            } | null;
            const email = owner?.users?.email ?? null;
            if (email) emails.set(row.award_id, email);
          }
        }

        for (const a of rows ?? []) counts[a.parcel_id] = (counts[a.parcel_id] ?? 0) + 1;
        awards = (rows ?? []).map((a) => ({
          id: a.id,
          parcel_id: a.parcel_id,
          survey_number: names.get(a.parcel_id) ?? "—",
          award_number: a.award_number ?? null,
          declared_amount: Number(a.declared_amount ?? 0),
          declared_date: a.declared_date ?? null,
          landowner_email: emails.get(a.id) ?? null,
        }));
      }

      return {
        parcels: (parcels ?? []).map((p) => ({
          id: p.id,
          survey_number: p.survey_number,
          area_hectares: p.area_hectares === null ? null : Number(p.area_hectares),
          status: p.status,
          award_count: counts[p.id] ?? 0,
        })),
        awards,
      };
    },
  );

export type NewAward = {
  projectId: string;
  parcelId: string;
  declaredAmount: number;
  landownerEmail: string;
  /** Optional password chosen by the officer; a temporary one is made when empty. */
  landownerPassword?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function tempPassword(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return (
    "Bs-" +
    Array.from(bytes, (b) => b.toString(36))
      .join("")
      .slice(0, 12)
  );
}

/**
 * Makes sure the parcel's landowner has a login on the given email address, so
 * the person can sign in and see their own award and compensation.
 */
async function ensureLandownerLogin(parcelId: string, email: string, chosenPassword?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nameFromEmail = email.split("@")[0] ?? "Landowner";

  const { data: existingUser, error: userError } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (userError) throw new Error(userError.message);

  let userId = existingUser?.id ?? null;
  let password: string | null = null;

  if (!userId) {
    const { data: role, error: roleError } = await supabaseAdmin
      .from("roles")
      .select("id")
      .eq("tier", "landowner")
      .limit(1)
      .maybeSingle();
    if (roleError) throw new Error(roleError.message);
    if (!role) throw new Error("No landowner role is configured in the register.");

    password = chosenPassword && chosenPassword.length >= 8 ? chosenPassword : tempPassword();
    const created = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) {
      throw new Error(created.error?.message ?? "Could not create the landowner login.");
    }
    userId = created.data.user.id;

    const { error: insertError } = await supabaseAdmin.from("users").insert({
      id: userId,
      full_name: nameFromEmail,
      email,
      role_id: role.id,
      is_active: true,
    });
    if (insertError) throw new Error(insertError.message);
  } else if (chosenPassword && chosenPassword.length >= 8) {
    // Login already exists: set the password the officer typed.
    const updated = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: chosenPassword,
    });
    if (updated.error) throw new Error(updated.error.message);
    password = chosenPassword;
  }

  // Each login must own its own landowner record, otherwise one person's page
  // would list somebody else's plots. Reuse the record already tied to this
  // login; never repoint an existing record at a different login.
  const { data: mine, error: mineError } = await supabaseAdmin
    .from("landowners")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (mineError) throw new Error(mineError.message);

  let landownerId = mine?.id ?? null;
  if (!landownerId) {
    const { data: owner, error: ownerError } = await supabaseAdmin
      .from("landowners")
      .insert({ full_name: nameFromEmail, user_id: userId })
      .select("id")
      .single();
    if (ownerError) throw new Error(ownerError.message);
    landownerId = owner.id;
  }

  // Point this parcel's ownership at that record (one owner per parcel here).
  const { data: ownership, error: ownershipError } = await supabaseAdmin
    .from("parcel_ownership")
    .select("id, landowner_id")
    .eq("parcel_id", parcelId)
    .limit(1)
    .maybeSingle();
  if (ownershipError) throw new Error(ownershipError.message);

  if (!ownership) {
    await supabaseAdmin
      .from("parcel_ownership")
      .insert({ parcel_id: parcelId, landowner_id: landownerId, ownership_share: 100 });
  } else if (ownership.landowner_id !== landownerId) {
    await supabaseAdmin
      .from("parcel_ownership")
      .update({ landowner_id: landownerId })
      .eq("id", ownership.id);
  }

  return { landownerId, userId, password };
}

export const createAward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: NewAward) => {
    if (!input?.projectId) throw new Error("Missing project");
    if (!input?.parcelId) throw new Error("Select a parcel for this award.");
    const amount = Number(input.declaredAmount);
    if (!Number.isFinite(amount) || amount <= 0)
      throw new Error("Enter a declared amount greater than zero.");
    const email = (input.landownerEmail ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new Error("Enter a valid landowner email address.");
    const pw = (input.landownerPassword ?? "").trim();
    if (pw && pw.length < 8) throw new Error("The password must be at least 8 characters.");
    return {
      projectId: input.projectId,
      parcelId: input.parcelId,
      declaredAmount: amount,
      landownerEmail: email,
      landownerPassword: pw,
    };
  })
  .handler(async ({ data, context }) => {
    const caller = await loadCaller(context.userId);
    await assertProjectInScope(caller, data.projectId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: parcel, error: pErr } = await supabaseAdmin
      .from("parcels")
      .select("id, project_id, status")
      .eq("id", data.parcelId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!parcel || parcel.project_id !== data.projectId) throw new Error("Forbidden");

    const declaredDate = new Date().toISOString().slice(0, 10);
    const { data: inserted, error } = await supabaseAdmin
      .from("awards")
      .insert({
        parcel_id: data.parcelId,
        declared_amount: data.declaredAmount,
        declared_date: declaredDate,
        declared_by: caller.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { landownerId, userId, password } = await ensureLandownerLogin(
      data.parcelId,
      data.landownerEmail,
      data.landownerPassword || undefined,
    );

    await supabaseAdmin.from("compensation").insert({
      award_id: inserted.id,
      landowner_id: landownerId,
      assessed_amount: data.declaredAmount,
      disbursement_status: "pending",
    });

    await supabaseAdmin
      .from("parcels")
      .update({ status: "award_declared" })
      .eq("id", data.parcelId);
    if (parcel.status !== "award_declared") {
      await notifyParcelStatusChange({
        parcelId: data.parcelId,
        from: parcel.status ?? null,
        to: "award_declared",
      });
    }

    // Tell the landowner their land is under acquisition, so it shows on their dashboard.
    if (userId) {
      await supabaseAdmin.from("alerts").insert({
        recipient_id: userId,
        channel: "in_app",
        message:
          "Your land is under acquisition and an award has been declared. Sign in to My Land to see the amount and payment status.",
        related_entity_type: "award",
        related_entity_id: inserted.id,
        sent_at: new Date().toISOString(),
      });
    }

    return { id: inserted.id, email: data.landownerEmail, password };
  });

export const updateAward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { projectId: string; awardId: string; declaredAmount: number }) => {
    if (!input?.projectId) throw new Error("Missing project");
    if (!input?.awardId) throw new Error("Missing award");
    const amount = Number(input.declaredAmount);
    if (!Number.isFinite(amount) || amount <= 0)
      throw new Error("Enter a declared amount greater than zero.");
    return { projectId: input.projectId, awardId: input.awardId, declaredAmount: amount };
  })
  .handler(async ({ data, context }) => {
    const caller = await loadCaller(context.userId);
    await assertProjectInScope(caller, data.projectId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: award, error: aErr } = await supabaseAdmin
      .from("awards")
      .select("id, parcel_id, parcels(project_id)")
      .eq("id", data.awardId)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message);
    const parcel = (award?.parcels ?? null) as unknown as { project_id: string } | null;
    if (!award || parcel?.project_id !== data.projectId) throw new Error("Forbidden");

    const { error } = await supabaseAdmin
      .from("awards")
      .update({ declared_amount: data.declaredAmount })
      .eq("id", data.awardId);
    if (error) throw new Error(error.message);

    // Keep the pending compensation figure in step with the declared award.
    await supabaseAdmin
      .from("compensation")
      .update({ assessed_amount: data.declaredAmount })
      .eq("award_id", data.awardId)
      .neq("disbursement_status", "disbursed");

    return { id: data.awardId, declaredAmount: data.declaredAmount };
  });

export const deleteAward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { projectId: string; awardId: string }) => {
    if (!input?.projectId) throw new Error("Missing project");
    if (!input?.awardId) throw new Error("Missing award");
    return { projectId: input.projectId, awardId: input.awardId };
  })
  .handler(async ({ data, context }) => {
    const caller = await loadCaller(context.userId);
    await assertProjectInScope(caller, data.projectId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: award, error: aErr } = await supabaseAdmin
      .from("awards")
      .select("id, parcel_id, parcels(project_id)")
      .eq("id", data.awardId)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message);
    const parcel = (award?.parcels ?? null) as unknown as { project_id: string } | null;
    if (!award || parcel?.project_id !== data.projectId) throw new Error("Forbidden");

    // Money already paid out cannot be undone here.
    const { data: paid } = await supabaseAdmin
      .from("compensation")
      .select("id")
      .eq("award_id", data.awardId)
      .eq("disbursement_status", "disbursed")
      .limit(1);
    if (paid && paid.length > 0)
      throw new Error("This award has already been paid, so it cannot be deleted.");

    const { error: cErr } = await supabaseAdmin
      .from("compensation")
      .delete()
      .eq("award_id", data.awardId);
    if (cErr) throw new Error(cErr.message);

    const { error } = await supabaseAdmin.from("awards").delete().eq("id", data.awardId);
    if (error) throw new Error(error.message);

    // Send the parcel back to the notified stage, unless it is disputed.
    const { data: p } = await supabaseAdmin
      .from("parcels")
      .select("status")
      .eq("id", award.parcel_id)
      .maybeSingle();
    if (p?.status === "award_declared") {
      await supabaseAdmin.from("parcels").update({ status: "notified" }).eq("id", award.parcel_id);
    }

    return { id: data.awardId };
  });
