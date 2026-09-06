import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Tier } from "@/lib/profile.functions";

export const AFFECTED_TIERS: Tier[] = ["implementing_agency"];

export const DISPLACEMENT_STATUSES = ["not_displaced", "partially_displaced", "displaced"] as const;
export const FAMILY_CATEGORIES = ["landowner", "tenant", "labourer", "shopkeeper"] as const;

export type AffectedParcel = {
  id: string;
  survey_number: string;
  village: string | null;
  area_hectares: number | null;
  status: string | null;
  project_id: string;
  project_name: string;
  owners: string[];
  families: number;
};

export type LandownerOption = { id: string; full_name: string; contact_phone: string | null };

export type NewAffectedFamily = {
  parcelId: string;
  landownerId: string | null;
  newLandowner: { fullName: string; contactPhone: string; bankAccountRef: string } | null;
  membersCount: number;
  displacementStatus: (typeof DISPLACEMENT_STATUSES)[number];
  category: (typeof FAMILY_CATEGORIES)[number];
};

type Caller = { userId: string; tier: Tier };

async function loadAgencyCaller(userId: string): Promise<Caller> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, roles(tier)")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const role = (data?.roles ?? null) as unknown as { tier: Tier } | null;
  const tier = role?.tier ?? "public";
  if (!data || !AFFECTED_TIERS.includes(tier)) throw new Error("Forbidden");
  return { userId, tier };
}

/** Projects the agency itself raised and the ministry has approved. */
async function agencyProjectIds(caller: Caller): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("proposals")
    .select("project_id")
    .eq("submitted_by", caller.userId)
    .eq("status", "approved");
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((p) => p.project_id))];
}

export const getAffectedParcels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }): Promise<{ parcels: AffectedParcel[]; landowners: LandownerOption[] }> => {
      const caller = await loadAgencyCaller(context.userId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const projectIds = await agencyProjectIds(caller);
      const { data: owners, error: ownersError } = await supabaseAdmin
        .from("landowners")
        .select("id, full_name, contact_phone")
        .order("full_name");
      if (ownersError) throw new Error(ownersError.message);
      const landowners: LandownerOption[] = (owners ?? []).map((o) => ({
        id: o.id,
        full_name: o.full_name,
        contact_phone: o.contact_phone ?? null,
      }));

      if (projectIds.length === 0) return { parcels: [], landowners };

      const { data: parcels, error } = await supabaseAdmin
        .from("parcels")
        .select("id, survey_number, village, area_hectares, status, project_id, projects(name)")
        .in("project_id", projectIds)
        .order("survey_number");
      if (error) throw new Error(error.message);

      const parcelIds = (parcels ?? []).map((p) => p.id);
      const ownerNames = new Map<string, string[]>();
      const familyCounts = new Map<string, number>();

      if (parcelIds.length > 0) {
        const [{ data: ownership }, { data: families }] = await Promise.all([
          supabaseAdmin
            .from("parcel_ownership")
            .select("parcel_id, landowners(full_name)")
            .in("parcel_id", parcelIds),
          supabaseAdmin
            .from("affected_families")
            .select("id, parcel_id")
            .in("parcel_id", parcelIds),
        ]);
        for (const row of ownership ?? []) {
          const owner = (row.landowners ?? null) as unknown as { full_name: string } | null;
          if (!owner) continue;
          const list = ownerNames.get(row.parcel_id) ?? [];
          list.push(owner.full_name);
          ownerNames.set(row.parcel_id, list);
        }
        for (const row of families ?? []) {
          if (!row.parcel_id) continue;
          familyCounts.set(row.parcel_id, (familyCounts.get(row.parcel_id) ?? 0) + 1);
        }
      }

      return {
        parcels: (parcels ?? []).map((p) => {
          const project = p.projects as unknown as { name: string } | null;
          return {
            id: p.id,
            survey_number: p.survey_number,
            village: p.village ?? null,
            area_hectares: p.area_hectares ?? null,
            status: p.status ?? null,
            project_id: p.project_id,
            project_name: project?.name ?? "Untitled project",
            owners: ownerNames.get(p.id) ?? [],
            families: familyCounts.get(p.id) ?? 0,
          };
        }),
        landowners,
      };
    },
  );

export const addAffectedFamily = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: NewAffectedFamily) => {
    if (!input?.parcelId) throw new Error("Please choose a parcel.");
    const name = input.newLandowner?.fullName?.trim() ?? "";
    if (!input.landownerId && !name)
      throw new Error("Please choose a landowner or enter a new one.");
    const members = Number(input.membersCount);
    if (!Number.isFinite(members) || members < 1)
      throw new Error("Please enter how many family members are affected.");
    if (!DISPLACEMENT_STATUSES.includes(input.displacementStatus))
      throw new Error("Choose a valid displacement status.");
    if (!FAMILY_CATEGORIES.includes(input.category)) throw new Error("Choose a valid category.");
    return {
      parcelId: input.parcelId,
      landownerId: input.landownerId || null,
      newLandowner: input.landownerId
        ? null
        : {
            fullName: name.slice(0, 200),
            contactPhone: (input.newLandowner?.contactPhone ?? "").trim().slice(0, 40),
            bankAccountRef: (input.newLandowner?.bankAccountRef ?? "").trim().slice(0, 80),
          },
      membersCount: Math.round(members),
      displacementStatus: input.displacementStatus,
      category: input.category,
    } satisfies NewAffectedFamily;
  })
  .handler(async ({ data, context }): Promise<{ familyId: string; landownerId: string }> => {
    const caller = await loadAgencyCaller(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const projectIds = await agencyProjectIds(caller);
    const { data: parcel, error: parcelError } = await supabaseAdmin
      .from("parcels")
      .select("id, project_id")
      .eq("id", data.parcelId)
      .maybeSingle();
    if (parcelError) throw new Error(parcelError.message);
    if (!parcel || !projectIds.includes(parcel.project_id))
      throw new Error("That parcel belongs to a project you do not handle.");

    let landownerId = data.landownerId;
    if (!landownerId && data.newLandowner) {
      const { data: owner, error } = await supabaseAdmin
        .from("landowners")
        .insert({
          full_name: data.newLandowner.fullName,
          contact_phone: data.newLandowner.contactPhone || null,
          bank_account_ref: data.newLandowner.bankAccountRef || null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      landownerId = owner.id;
    }
    if (!landownerId) throw new Error("Could not determine the landowner.");

    // Link the owner to the parcel once; repeat entries only add a family row.
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("parcel_ownership")
      .select("id")
      .eq("parcel_id", data.parcelId)
      .eq("landowner_id", landownerId)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (!existing) {
      const { error } = await supabaseAdmin
        .from("parcel_ownership")
        .insert({ parcel_id: data.parcelId, landowner_id: landownerId, ownership_share: 100 });
      if (error) throw new Error(error.message);
    }

    const { data: family, error: familyError } = await supabaseAdmin
      .from("affected_families")
      .insert({
        parcel_id: data.parcelId,
        landowner_id: landownerId,
        members_count: data.membersCount,
        displacement_status: data.displacementStatus,
        category: data.category,
      })
      .select("id")
      .single();
    if (familyError) throw new Error(familyError.message);

    return { familyId: family.id as string, landownerId };
  });
