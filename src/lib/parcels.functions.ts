import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Tier } from "@/lib/profile.functions";
import type { GeoJson } from "@/lib/wkb";

export type DrawnRoute = {
  id: string;
  projectId: string;
  name: string;
  geometry: { type: string; coordinates: GeoJson } | null;
};

export type ProjectOption = { id: string; name: string };
export type LandownerOption = { id: string; full_name: string; contact_phone: string | null };

export type DrawnParcel = {
  id: string;
  survey_number: string;
  area_hectares: number | null;
  status: string | null;
  geometry: { type: string; coordinates: GeoJson } | null;
};

export type NewParcelInput = {
  projectId: string;
  surveyNumber: string;
  areaHectares: number;
  ring: [number, number][];
  landownerId: string | null;
  newLandowner: { fullName: string; contactPhone: string } | null;
};

export type NewHighwayRouteInput = {
  projectId: string;
  name: string;
  coordinates: [number, number][];
  widthMeters?: number;
};

type Caller = { userId: string; tier: Tier; jurisdictionId: string | null };

async function loadDistrictCaller(userId: string): Promise<Caller> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, jurisdiction_id, roles(tier)")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const role = (data?.roles ?? null) as unknown as { tier: Tier } | null;
  const tier = role?.tier ?? "public";
  if (
    !data ||
    (tier !== "district_authority" && tier !== "central_ministry" && tier !== "state_government")
  ) {
    throw new Error("Forbidden");
  }
  return { userId, tier, jurisdictionId: data.jurisdiction_id ?? null };
}

/** Parcels may only be drawn once the ministry has approved the proposal. */
export async function approvedProjectIds(caller: Caller): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [propRes, projRes] = await Promise.all([
    supabaseAdmin.from("proposals").select("project_id").eq("status", "approved"),
    supabaseAdmin.from("projects").select("id").eq("status", "approved"),
  ]);
  if (propRes.error) throw new Error(propRes.error.message);
  if (projRes.error) throw new Error(projRes.error.message);

  const ids = new Set([
    ...(propRes.data ?? []).map((p) => p.project_id),
    ...(projRes.data ?? []).map((p) => p.id),
  ]);
  return [...ids];
}

export const getParcelDrawOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      projects: ProjectOption[];
      landowners: LandownerOption[];
      parcels: DrawnParcel[];
    }> => {
      const caller = await loadDistrictCaller(context.userId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { wkbHexToGeoJson } = await import("@/lib/wkb");

      const projectIds = await approvedProjectIds(caller);

      const [projectsRes, ownersRes] = await Promise.all([
        projectIds.length > 0
          ? supabaseAdmin.from("projects").select("id, name").in("id", projectIds).order("name")
          : Promise.resolve({ data: [], error: null }),
        supabaseAdmin.from("landowners").select("id, full_name, contact_phone").order("full_name"),
      ]);
      if (projectsRes.error) throw new Error(projectsRes.error.message);
      if (ownersRes.error) throw new Error(ownersRes.error.message);

      let parcels: DrawnParcel[] = [];
      let routes: DrawnRoute[] = [];
      if (projectIds.length > 0) {
        const [parcelsRes, routesRes] = await Promise.all([
          supabaseAdmin
            .from("parcels")
            .select("id, survey_number, area_hectares, status, geom")
            .in("project_id", projectIds)
            .limit(1000),
          supabaseAdmin
            .from("documents")
            .select("id, entity_id, file_name, file_url")
            .eq("entity_type", "highway_route")
            .in("entity_id", projectIds),
        ]);
        if (parcelsRes.error) throw new Error(parcelsRes.error.message);
        parcels = (parcelsRes.data ?? []).map((row) => ({
          id: String(row.id),
          survey_number: String(row.survey_number ?? ""),
          area_hectares: row.area_hectares ?? null,
          status: row.status ?? null,
          geometry: wkbHexToGeoJson(row.geom),
        }));

        if (!routesRes.error && routesRes.data) {
          routes = routesRes.data
            .map((row) => {
              let geom = null;
              try {
                geom = JSON.parse(row.file_url);
              } catch {
                // ignore
              }
              return {
                id: String(row.id),
                projectId: String(row.entity_id),
                name: String(row.file_name ?? "Highway Alignment"),
                geometry: geom,
              };
            })
            .filter((r) => r.geometry !== null);
        }
      }

      return {
        projects: (projectsRes.data ?? []).map((p) => ({ id: p.id, name: p.name })),

        landowners: (ownersRes.data ?? []).map((o) => ({
          id: o.id,
          full_name: o.full_name,
          contact_phone: o.contact_phone ?? null,
        })),
        parcels,
        routes,
      };
    },
  );

export const createDrawnParcel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: NewParcelInput) => {
    if (!input?.projectId) throw new Error("Please choose a project.");
    const surveyNumber = (input.surveyNumber ?? "").trim();
    if (!surveyNumber) throw new Error("Please enter a survey number.");
    const area = Number(input.areaHectares);
    if (!Number.isFinite(area) || area <= 0) throw new Error("Please enter a valid area.");
    if (!Array.isArray(input.ring) || input.ring.length < 3)
      throw new Error("Please draw a polygon with at least three points.");
    if (!input.landownerId && !input.newLandowner?.fullName?.trim())
      throw new Error("Please choose a landowner or enter a new one.");
    return {
      projectId: input.projectId,
      surveyNumber: surveyNumber.slice(0, 120),
      areaHectares: area,
      ring: input.ring.map(([lng, lat]) => [Number(lng), Number(lat)] as [number, number]),
      landownerId: input.landownerId ?? null,
      newLandowner: input.newLandowner
        ? {
            fullName: input.newLandowner.fullName.trim().slice(0, 200),
            contactPhone: (input.newLandowner.contactPhone ?? "").trim().slice(0, 40),
          }
        : null,
    };
  })
  .handler(async ({ data, context }) => {
    const caller = await loadDistrictCaller(context.userId);
    const projectIds = await approvedProjectIds(caller);
    if (!projectIds.includes(data.projectId))
      throw new Error("That project is not approved for your district yet.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { polygonToEwkt } = await import("@/lib/wkb");

    let landownerId = data.landownerId;
    if (!landownerId && data.newLandowner) {
      const { data: owner, error } = await supabaseAdmin
        .from("landowners")
        .insert({
          full_name: data.newLandowner.fullName,
          contact_phone: data.newLandowner.contactPhone || null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      landownerId = owner.id;
    }
    if (!landownerId) throw new Error("Could not determine the landowner.");

    // EWKT with an explicit SRID; Postgres casts it to geometry(4326), the
    // same result as ST_GeomFromText(..., 4326).
    const { data: parcel, error: parcelError } = await supabaseAdmin
      .from("parcels")
      .insert({
        project_id: data.projectId,
        survey_number: data.surveyNumber,
        area_hectares: data.areaHectares,
        geom: polygonToEwkt(data.ring) as never,
        status: "identified",
      })
      .select("id")
      .single();
    if (parcelError) throw new Error(parcelError.message);

    const { error: ownershipError } = await supabaseAdmin.from("parcel_ownership").insert({
      parcel_id: parcel.id,
      landowner_id: landownerId,
      ownership_share: 100,
    });
    if (ownershipError) throw new Error(ownershipError.message);

    return { parcelId: parcel.id as string, landownerId };
  });

export const createDrawnHighwayRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: NewHighwayRouteInput) => {
    if (!input?.projectId) throw new Error("Please choose a project.");
    const name = (input.name ?? "").trim();
    if (!name) throw new Error("Please enter a route alignment name.");
    if (!Array.isArray(input.coordinates) || input.coordinates.length < 2)
      throw new Error("Please draw a highway route with at least two alignment points.");
    return {
      projectId: input.projectId,
      name: name.slice(0, 150),
      coordinates: input.coordinates.map(
        ([lng, lat]) => [Number(lng), Number(lat)] as [number, number],
      ),
      widthMeters: input.widthMeters ? Number(input.widthMeters) : 60,
    };
  })
  .handler(async ({ data, context }) => {
    const caller = await loadDistrictCaller(context.userId);
    const projectIds = await approvedProjectIds(caller);
    if (!projectIds.includes(data.projectId))
      throw new Error("That project is not approved for your district yet.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const geojson = {
      type: "LineString",
      coordinates: data.coordinates,
      properties: {
        width_meters: data.widthMeters ?? 60,
      },
    };

    const { data: doc, error } = await supabaseAdmin
      .from("documents")
      .insert({
        entity_type: "highway_route",
        entity_id: data.projectId,
        file_name: data.name,
        file_url: JSON.stringify(geojson),
        uploaded_by: context.userId,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    return { routeId: doc.id as string };
  });
