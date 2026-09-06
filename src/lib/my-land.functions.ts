import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CompensationRow = {
  id: string;
  assessed_amount: number | null;
  disbursed_amount: number | null;
  disbursement_status: string | null;
  disbursed_date: string | null;
};

export type AwardRow = {
  id: string;
  award_number: string | null;
  declared_amount: number | null;
  declared_date: string | null;
  compensation: CompensationRow[];
};

export type BenefitRow = {
  id: string;
  benefit_type: string | null;
  status: string | null;
  amount: number | null;
  disbursed_date: string | null;
};

export type PossessionInfo = {
  status: string | null;
  taken_over_date: string | null;
};

export type MyDispute = {
  id: string;
  dispute_type: string | null;
  description: string | null;
  status: string | null;
  filed_at: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
};

export type MyParcel = {
  id: string;
  project_name: string | null;
  survey_number: string;
  village: string | null;
  area_hectares: number | null;
  status: string | null;
  ownership_share: number | null;
  awards: AwardRow[];
  benefits: BenefitRow[];
  possession: PossessionInfo | null;
  disputes: MyDispute[];
};

// Read-only. The caller is verified first; every query below is scoped to the
// landowner records that belong to the signed-in user.
export const getMyLand = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyParcel[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: owners, error: ownersError } = await supabaseAdmin
      .from("landowners")
      .select("id")
      .eq("user_id", context.userId);
    if (ownersError) throw new Error(ownersError.message);

    const landownerIds = (owners ?? []).map((o) => o.id);
    if (landownerIds.length === 0) return [];

    const { data: ownership, error: ownershipError } = await supabaseAdmin
      .from("parcel_ownership")
      .select(
        "ownership_share, parcel_id, parcels(id, survey_number, village, area_hectares, status, projects(name))",
      )
      .in("landowner_id", landownerIds);
    if (ownershipError) throw new Error(ownershipError.message);

    const parcelIds = (ownership ?? []).map((o) => o.parcel_id).filter(Boolean) as string[];
    if (parcelIds.length === 0) return [];

    const { data: awards, error: awardsError } = await supabaseAdmin
      .from("awards")
      .select("id, parcel_id, award_number, declared_amount, declared_date")
      .in("parcel_id", parcelIds);
    if (awardsError) throw new Error(awardsError.message);

    const awardIds = (awards ?? []).map((a) => a.id);
    const { data: comps, error: compsError } = awardIds.length
      ? await supabaseAdmin
          .from("compensation")
          .select(
            "id, award_id, assessed_amount, disbursed_amount, disbursement_status, disbursed_date",
          )
          .in("award_id", awardIds)
          .in("landowner_id", landownerIds)
      : { data: [], error: null };
    if (compsError) throw new Error(compsError.message);

    const { data: possession, error: possessionError } = await supabaseAdmin
      .from("possession_records")
      .select("parcel_id, status, taken_over_date")
      .in("parcel_id", parcelIds);
    if (possessionError) throw new Error(possessionError.message);

    const { data: disputes, error: disputesError } = await supabaseAdmin
      .from("disputes")
      .select(
        "id, parcel_id, dispute_type, description, status, filed_at, resolved_at, resolution_notes",
      )
      .in("parcel_id", parcelIds)
      .order("filed_at", { ascending: false });
    if (disputesError) throw new Error(disputesError.message);

    const { data: families, error: familiesError } = await supabaseAdmin
      .from("affected_families")
      .select("id, parcel_id")
      .in("landowner_id", landownerIds);
    if (familiesError) throw new Error(familiesError.message);

    const familyIds = (families ?? []).map((f) => f.id);
    const { data: benefits, error: benefitsError } = familyIds.length
      ? await supabaseAdmin
          .from("rr_benefits")
          .select("id, family_id, benefit_type, status, amount, disbursed_date")
          .in("family_id", familyIds)
      : { data: [], error: null };
    if (benefitsError) throw new Error(benefitsError.message);

    return (ownership ?? [])
      .map((row): MyParcel | null => {
        const parcel = row.parcels as unknown as {
          id: string;
          survey_number: string;
          village: string | null;
          area_hectares: number | null;
          status: string | null;
          projects: { name: string | null } | null;
        } | null;
        if (!parcel) return null;

        const parcelAwards = (awards ?? [])
          .filter((a) => a.parcel_id === parcel.id)
          .map((a) => ({
            id: a.id,
            award_number: a.award_number,
            declared_amount: a.declared_amount,
            declared_date: a.declared_date,
            compensation: (comps ?? [])
              .filter((c) => c.award_id === a.id)
              .map((c) => ({
                id: c.id,
                assessed_amount: c.assessed_amount,
                disbursed_amount: c.disbursed_amount,
                disbursement_status: c.disbursement_status,
                disbursed_date: c.disbursed_date,
              })),
          }))
          // Only awards that carry a compensation record for THIS landowner.
          .filter((a) => a.compensation.length > 0);

        const parcelFamilyIds = (families ?? [])
          .filter((f) => f.parcel_id === parcel.id)
          .map((f) => f.id);
        const parcelBenefits = (benefits ?? [])
          .filter((b) => parcelFamilyIds.includes(b.family_id))
          .map((b) => ({
            id: b.id,
            benefit_type: b.benefit_type,
            status: b.status,
            amount: b.amount,
            disbursed_date: b.disbursed_date,
          }));

        return {
          id: parcel.id,
          project_name: parcel.projects?.name ?? null,
          survey_number: parcel.survey_number,
          village: parcel.village,
          area_hectares: parcel.area_hectares,
          status: parcel.status,
          ownership_share: row.ownership_share,
          awards: parcelAwards,
          benefits: parcelBenefits,
          possession:
            (possession ?? [])
              .filter((r) => r.parcel_id === parcel.id)
              .map((r) => ({ status: r.status, taken_over_date: r.taken_over_date }))[0] ?? null,
          disputes: (disputes ?? [])
            .filter((d) => d.parcel_id === parcel.id)
            .map((d) => ({
              id: d.id,
              dispute_type: d.dispute_type,
              description: d.description,
              status: d.status,
              filed_at: d.filed_at,
              resolved_at: d.resolved_at,
              resolution_notes: d.resolution_notes,
            })),
        };
      })
      .filter((p): p is MyParcel => p !== null);
  });
