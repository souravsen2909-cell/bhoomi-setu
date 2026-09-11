import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Tier } from "@/lib/profile.functions";
import { notifyParcelStatusChange } from "@/lib/alerts.server";
import type { GeoJsonGeometry } from "@/lib/public-map.functions";

export const POSSESSION_TIERS: Tier[] = ["implementing_agency"];

export type PossessionParcel = {
  id: string;
  survey_number: string;
  area_hectares: number | null;
  status: string | null;
  project_name: string;
  disbursed_amount: number | null;
  already_recorded: boolean;
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

type Caller = { userId: string; jurisdictionId: string | null };

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
  if (!data || !POSSESSION_TIERS.includes(tier)) throw new Error("Forbidden");
  return { userId, jurisdictionId: data.jurisdiction_id ?? null };
}

async function scopedProjects(caller: Caller) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("id, name")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Parcels whose compensation is fully disbursed, so possession can be taken. */
export const getPossessionParcels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PossessionParcel[]> => {
    const caller = await loadCaller(context.userId);
    const projects = await scopedProjects(caller);
    if (projects.length === 0) return [];
    const projectNames = new Map(projects.map((p) => [p.id, p.name]));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: parcels, error } = await supabaseAdmin
      .from("parcels")
      .select("id, survey_number, area_hectares, status, project_id")
      .in(
        "project_id",
        projects.map((p) => p.id),
      );
    if (error) throw new Error(error.message);
    const parcelIds = (parcels ?? []).map((p) => p.id);
    if (parcelIds.length === 0) return [];

    const { data: awards, error: aErr } = await supabaseAdmin
      .from("awards")
      .select("id, parcel_id")
      .in("parcel_id", parcelIds);
    if (aErr) throw new Error(aErr.message);
    const awardIds = (awards ?? []).map((a) => a.id);
    if (awardIds.length === 0) return [];

    const { data: comps, error: cErr } = await supabaseAdmin
      .from("compensation")
      .select("award_id, disbursed_amount, disbursement_status")
      .in("award_id", awardIds)
      .eq("disbursement_status", "disbursed");
    if (cErr) throw new Error(cErr.message);

    const disbursedByParcel = new Map<string, number>();
    const awardToParcel = new Map((awards ?? []).map((a) => [a.id, a.parcel_id]));
    for (const c of comps ?? []) {
      const parcelId = awardToParcel.get(c.award_id);
      if (!parcelId) continue;
      disbursedByParcel.set(
        parcelId,
        (disbursedByParcel.get(parcelId) ?? 0) + Number(c.disbursed_amount ?? 0),
      );
    }
    if (disbursedByParcel.size === 0) return [];

    const { data: existing, error: eErr } = await supabaseAdmin
      .from("possession_records")
      .select("parcel_id")
      .in("parcel_id", [...disbursedByParcel.keys()]);
    if (eErr) throw new Error(eErr.message);
    const recorded = new Set((existing ?? []).map((r) => r.parcel_id));

    const { data: shapes } = await supabaseAdmin
      .from("public_parcels")
      .select("id, geom")
      .in("id", [...disbursedByParcel.keys()]);
    const geomById = new Map(
      (shapes ?? []).map((row) => [String(row.id), asGeometry(row.geom)] as const),
    );

    return (parcels ?? [])
      .filter((p) => disbursedByParcel.has(p.id))
      .map((p) => ({
        id: p.id,
        survey_number: p.survey_number,
        area_hectares: p.area_hectares === null ? null : Number(p.area_hectares),
        status: p.status,
        project_name: projectNames.get(p.project_id) ?? "Untitled project",
        disbursed_amount: disbursedByParcel.get(p.id) ?? null,
        already_recorded: recorded.has(p.id),
        geometry: geomById.get(String(p.id)) ?? null,
      }));
  });

export const recordPossession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { parcelId: string; latitude: number; longitude: number }) => {
    if (!input?.parcelId) throw new Error("Select a parcel.");
    const lat = Number(input.latitude);
    const lng = Number(input.longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90)
      throw new Error("Latitude must be between -90 and 90.");
    if (!Number.isFinite(lng) || lng < -180 || lng > 180)
      throw new Error("Longitude must be between -180 and 180.");
    return { parcelId: input.parcelId, latitude: lat, longitude: lng };
  })
  .handler(async ({ data, context }) => {
    const caller = await loadCaller(context.userId);
    const projects = await scopedProjects(caller);
    const projectIds = new Set(projects.map((p) => p.id));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: parcel, error: pErr } = await supabaseAdmin
      .from("parcels")
      .select("id, project_id, status")
      .eq("id", data.parcelId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!parcel || !projectIds.has(parcel.project_id)) throw new Error("Forbidden");

    // Compensation must be disbursed before possession can be taken.
    const { data: awards } = await supabaseAdmin
      .from("awards")
      .select("id")
      .eq("parcel_id", data.parcelId);
    const awardIds = (awards ?? []).map((a) => a.id);
    if (awardIds.length === 0) throw new Error("No award has been declared for this parcel yet.");
    const { data: comps } = await supabaseAdmin
      .from("compensation")
      .select("id")
      .in("award_id", awardIds)
      .eq("disbursement_status", "disbursed")
      .limit(1);
    if (!comps || comps.length === 0)
      throw new Error("Compensation for this parcel has not been disbursed yet.");

    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabaseAdmin.from("possession_records").insert({
      parcel_id: data.parcelId,
      status: "taken_over",
      taken_over_date: today,
      recorded_by: caller.userId,
      field_geotag: `SRID=4326;POINT(${data.longitude} ${data.latitude})`,
    });
    if (error) throw new Error(error.message);

    const { error: uErr } = await supabaseAdmin
      .from("parcels")
      .update({ status: "possession_taken" })
      .eq("id", data.parcelId);
    if (uErr) throw new Error(uErr.message);

    await notifyParcelStatusChange({
      parcelId: data.parcelId,
      from: parcel.status ?? null,
      to: "possession_taken",
    });

    return { ok: true };
  });

export type SendPossessionNoticeInput = {
  parcelId: string;
  projectId?: string;
  customNote?: string;
};

export type PossessionNoticeResult = {
  ok: true;
  surveyNumber: string;
  projectName: string;
  requiringBody: string | null;
  areaHectares: number | null;
  takenOverDate: string;
  landownerName: string | null;
  landownerPhone: string | null;
  landownerEmail: string | null;
  noticeMessage: string;
  sentAt: string;
};

export const getPossessionNoticePreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { parcelId: string }) => {
    if (!input?.parcelId) throw new Error("Select a parcel.");
    return { parcelId: input.parcelId };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: parcel, error: pErr } = await supabaseAdmin
      .from("parcels")
      .select("id, project_id, survey_number, area_hectares, village, status")
      .eq("id", data.parcelId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!parcel) throw new Error("Parcel not found.");

    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("id, name, sector, requiring_body")
      .eq("id", parcel.project_id)
      .maybeSingle();

    const { data: possRecord } = await supabaseAdmin
      .from("possession_records")
      .select("taken_over_date, status")
      .eq("parcel_id", data.parcelId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: ownerships } = await supabaseAdmin
      .from("parcel_ownership")
      .select("landowner_id, landowners(id, full_name, contact_phone, user_id)")
      .eq("parcel_id", data.parcelId);

    const owners = (ownerships ?? [])
      .map((o) => (o.landowners ?? null) as unknown as {
        id: string;
        full_name: string;
        contact_phone: string | null;
        user_id: string | null;
      } | null)
      .filter((o): o is NonNullable<typeof o> => o !== null);

    const firstOwner = owners[0] ?? null;
    let landownerEmail: string | null = null;
    if (firstOwner?.user_id) {
      const { data: u } = await supabaseAdmin
        .from("users")
        .select("email")
        .eq("id", firstOwner.user_id)
        .maybeSingle();
      landownerEmail = u?.email ?? null;
    }

    const { data: awards } = await supabaseAdmin
      .from("awards")
      .select("id")
      .eq("parcel_id", data.parcelId);
    let disbursed = 0;
    if (awards && awards.length > 0) {
      const { data: comps } = await supabaseAdmin
        .from("compensation")
        .select("disbursed_amount")
        .in(
          "award_id",
          awards.map((a) => a.id),
        )
        .eq("disbursement_status", "disbursed");
      for (const c of comps ?? []) disbursed += Number(c.disbursed_amount ?? 0);
    }

    return {
      surveyNumber: parcel.survey_number ?? "—",
      projectName: project?.name ?? "Land Acquisition Project",
      requiringBody: project?.requiring_body ?? "Acquiring Authority",
      areaHectares: parcel.area_hectares,
      takenOverDate: possRecord?.taken_over_date ?? new Date().toISOString().slice(0, 10),
      landownerName: firstOwner?.full_name ?? null,
      landownerPhone: firstOwner?.contact_phone ?? null,
      landownerEmail,
      disbursedAmount: disbursed || null,
    };
  });

export const sendPossessionNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SendPossessionNoticeInput) => {
    if (!input?.parcelId) throw new Error("Select a parcel.");
    return {
      parcelId: input.parcelId,
      projectId: input.projectId,
      customNote: input.customNote?.trim(),
    };
  })
  .handler(async ({ data, context }): Promise<PossessionNoticeResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const caller = await loadCaller(context.userId);

    const { data: parcel, error: pErr } = await supabaseAdmin
      .from("parcels")
      .select("id, project_id, survey_number, area_hectares, village, status")
      .eq("id", data.parcelId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!parcel) throw new Error("Parcel not found.");

    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("id, name, sector, requiring_body")
      .eq("id", parcel.project_id)
      .maybeSingle();

    const { data: possRecord } = await supabaseAdmin
      .from("possession_records")
      .select("taken_over_date, status")
      .eq("parcel_id", data.parcelId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const takenDate = possRecord?.taken_over_date || new Date().toISOString().slice(0, 10);

    const { data: ownerships } = await supabaseAdmin
      .from("parcel_ownership")
      .select("landowner_id, landowners(id, full_name, contact_phone, user_id)")
      .eq("parcel_id", data.parcelId);

    const owners = (ownerships ?? [])
      .map((o) => (o.landowners ?? null) as unknown as {
        id: string;
        full_name: string;
        contact_phone: string | null;
        user_id: string | null;
      } | null)
      .filter((o): o is NonNullable<typeof o> => o !== null);

    const firstOwner = owners[0] ?? null;
    let landownerEmail: string | null = null;
    if (firstOwner?.user_id) {
      const { data: u } = await supabaseAdmin
        .from("users")
        .select("email")
        .eq("id", firstOwner.user_id)
        .maybeSingle();
      landownerEmail = u?.email ?? null;
    }

    const projectName = project?.name ?? "Land Acquisition Project";
    const requiringBody = project?.requiring_body ?? "Government Acquiring Agency";
    const surveyNo = parcel.survey_number ?? "N/A";
    const areaStr =
      parcel.area_hectares != null ? `${parcel.area_hectares} hectares` : "registered area";

    const officialNoticeText =
      `OFFICIAL NOTICE: POSSESSION OF LAND TAKEN OVER\n` +
      `-----------------------------------------\n` +
      `Dear ${firstOwner?.full_name ?? "Landowner"},\n\n` +
      `This is to formally notify you that physical possession of your land parcel has been taken over by ${requiringBody} for the "${projectName}" project.\n\n` +
      `• Survey Number: ${surveyNo}\n` +
      `• Area: ${areaStr}\n` +
      `• Project: ${projectName} (${project?.sector ?? "Infrastructure"})\n` +
      `• Requiring Authority: ${requiringBody}\n` +
      `• Date of Handover/Takeover: ${takenDate}\n` +
      `• Status: Possession Formally Recorded in Bhoomi Setu Register\n` +
      (data.customNote ? `• Additional Remarks: ${data.customNote}\n` : "") +
      `\nCompensation proceedings and records have been entered in the register. You may review your official ledger and download acquisition records anytime by signing into your Bhoomi Setu portal account.\n\n` +
      `Issued by: Office of the Implementing Agency / District Competent Authority.`;

    const now = new Date().toISOString();

    for (const owner of owners) {
      if (owner.user_id) {
        await supabaseAdmin.from("alerts").insert({
          recipient_id: owner.user_id,
          channel: "in_app",
          message: `Official Notice: Formal possession of your land (Survey No. ${surveyNo}, ${areaStr}) under project "${projectName}" was taken over on ${takenDate}. Sign in to My Land to see updated status.`,
          related_entity_type: "possession",
          related_entity_id: data.parcelId,
          sent_at: now,
        });
      }
    }

    await supabaseAdmin.from("alerts").insert({
      recipient_id: caller.userId,
      channel: "in_app",
      message: `Land possession takeover notice sent to ${firstOwner?.full_name ?? "landowner"} (Survey No. ${surveyNo} · ${projectName}).`,
      related_entity_type: "possession",
      related_entity_id: data.parcelId,
      sent_at: now,
    });

    return {
      ok: true,
      surveyNumber: surveyNo,
      projectName,
      requiringBody,
      areaHectares: parcel.area_hectares,
      takenOverDate: takenDate,
      landownerName: firstOwner?.full_name ?? null,
      landownerPhone: firstOwner?.contact_phone ?? null,
      landownerEmail,
      noticeMessage: officialNoticeText,
      sentAt: now,
    };
  });
