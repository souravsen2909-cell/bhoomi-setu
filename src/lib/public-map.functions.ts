import { createServerFn } from "@tanstack/react-start";

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type GeoJsonGeometry = { type: string; coordinates: Json };

export type PublicParcel = {
  id: string;
  survey_number: string;
  area_hectares: number | null;
  status: string | null;
  geometry: GeoJsonGeometry | null;
};

export type PublicRoute = {
  id: string;
  name: string;
  geometry: GeoJsonGeometry | null;
};

const asGeometry = (value: unknown): GeoJsonGeometry | null => {
  let candidate: unknown = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      // Encoded binary geometry — not renderable in the browser.
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

const SAMPLE_PARCELS: PublicParcel[] = [
  {
    id: "parcel-101",
    survey_number: "24/1A",
    area_hectares: 2.45,
    status: "possession_taken",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [72.882, 19.341],
          [72.888, 19.345],
          [72.891, 19.339],
          [72.884, 19.336],
          [72.882, 19.341],
        ],
      ],
    },
  },
  {
    id: "parcel-102",
    survey_number: "24/1B",
    area_hectares: 1.82,
    status: "award_declared",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [72.891, 19.339],
          [72.897, 19.343],
          [72.901, 19.337],
          [72.894, 19.333],
          [72.891, 19.339],
        ],
      ],
    },
  },
  {
    id: "parcel-103",
    survey_number: "25/3",
    area_hectares: 3.12,
    status: "notified",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [72.901, 19.337],
          [72.908, 19.341],
          [72.912, 19.334],
          [72.905, 19.331],
          [72.901, 19.337],
        ],
      ],
    },
  },
  {
    id: "parcel-104",
    survey_number: "26/2A",
    area_hectares: 0.95,
    status: "disputed",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [72.912, 19.334],
          [72.918, 19.338],
          [72.921, 19.332],
          [72.915, 19.328],
          [72.912, 19.334],
        ],
      ],
    },
  },
  {
    id: "parcel-105",
    survey_number: "27/4",
    area_hectares: 4.2,
    status: "identified",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [72.921, 19.332],
          [72.928, 19.336],
          [72.932, 19.329],
          [72.925, 19.325],
          [72.921, 19.332],
        ],
      ],
    },
  },
];

const SAMPLE_ROUTES: PublicRoute[] = [
  {
    id: "route-nh48",
    name: "Delhi-Mumbai Expressway Alignment (Package 4)",
    geometry: {
      type: "LineString",
      coordinates: [
        [72.875, 19.345],
        [72.89, 19.34],
        [72.905, 19.335],
        [72.92, 19.33],
        [72.935, 19.325],
      ],
    },
  },
];

const SAMPLE_OVERVIEW: PublicOverview = {
  projects: 3,
  area_notified: 1450.6,
  area_acquired: 820.4,
  compensation_declared: 540000000,
  compensation_disbursed: 385000000,
  compensation_pending: 155000000,
  parcels_disputed: 14,
};

const SAMPLE_PROJECTS: PublicProjectSummary[] = [
  {
    id: "proj-1",
    name: "Vadodara-Mumbai Expressway (Package IV)",
    sector: "Highways & Expressways",
    requiring_body: "National Highways Authority of India (NHAI)",
    status: "in_progress",
    state_name: "Maharashtra",
    district_name: "Palghar",
    estimated_area_ha: 640.5,
    created_at: "2024-01-15T10:00:00Z",
    parcels: 142,
    parcels_by_stage: {
      possession_taken: 86,
      award_declared: 28,
      notified: 16,
      identified: 8,
      disputed: 4,
    },
    area_notified: 640.5,
    area_acquired: 412.3,
    compensation_declared: 240000000,
    compensation_disbursed: 180000000,
    compensation_pending: 60000000,
    disputes_open: 4,
    families: 218,
    completion: 61,
    geometries: SAMPLE_PARCELS,
  },
  {
    id: "proj-2",
    name: "Eastern Dedicated Freight Corridor (Sonnagar Sec.)",
    sector: "Railways & Freight",
    requiring_body: "Dedicated Freight Corridor Corporation (DFCCIL)",
    status: "in_progress",
    state_name: "Bihar",
    district_name: "Rohtas",
    estimated_area_ha: 480.0,
    created_at: "2024-03-20T10:00:00Z",
    parcels: 98,
    parcels_by_stage: {
      possession_taken: 62,
      award_declared: 18,
      notified: 12,
      disputed: 6,
    },
    area_notified: 480.0,
    area_acquired: 295.1,
    compensation_declared: 190000000,
    compensation_disbursed: 135000000,
    compensation_pending: 55000000,
    disputes_open: 6,
    families: 145,
    completion: 63,
    geometries: SAMPLE_PARCELS.slice(0, 3),
  },
  {
    id: "proj-3",
    name: "Bengaluru Suburban Rail Corridor 2",
    sector: "Urban Transit",
    requiring_body: "Rail Infrastructure Development Co. (K-RIDE)",
    status: "survey_stage",
    state_name: "Karnataka",
    district_name: "Bengaluru Urban",
    estimated_area_ha: 330.1,
    created_at: "2024-06-10T10:00:00Z",
    parcels: 76,
    parcels_by_stage: {
      possession_taken: 24,
      award_declared: 22,
      notified: 26,
      disputed: 4,
    },
    area_notified: 330.1,
    area_acquired: 113.0,
    compensation_declared: 110000000,
    compensation_disbursed: 70000000,
    compensation_pending: 40000000,
    disputes_open: 4,
    families: 92,
    completion: 32,
    geometries: SAMPLE_PARCELS.slice(2),
  },
];

// Public, unauthenticated read. Only non-identifying parcel columns are
// selected: no landowner, ownership or compensation data is exposed.
export const getPublicMapData = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ parcels: PublicParcel[]; routes: PublicRoute[] }> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data, error } = await supabaseAdmin
        .from("public_parcels")
        .select("id, survey_number, area_hectares, status, geom")
        .limit(2000);
      if (error) throw new Error(error.message);

      const parcels: PublicParcel[] = (data ?? []).map((row) => ({
        id: String(row.id),
        survey_number: String(row.survey_number ?? ""),
        area_hectares: row.area_hectares ?? null,
        status: row.status ?? null,
        geometry: asGeometry(row.geom),
      }));

      if (parcels.length > 0) {
        return { parcels, routes: [] };
      }
    } catch (err) {
      console.warn(
        "[Bhoomi Setu] Database not connected or empty, using sample preview map data:",
        err,
      );
    }

    return { parcels: SAMPLE_PARCELS, routes: SAMPLE_ROUTES };
  },
);

export type PublicOverview = {
  projects: number;
  area_notified: number;
  area_acquired: number;
  compensation_declared: number;
  compensation_disbursed: number;
  compensation_pending: number;
  parcels_disputed: number;
};

const NOTIFIED_ONWARDS = [
  "notified",
  "under_survey",
  "award_declared",
  "compensation_paid",
  "possession_taken",
  "disputed",
];

const toNum = (v: unknown) => (v === null || v === undefined ? 0 : Number(v) || 0);

// Aggregate-only public read: totals and areas, never any person's details.
export const getPublicOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicOverview> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const [projectsRes, parcelsRes, awardsRes, compensationRes] = await Promise.all([
        supabaseAdmin.from("projects").select("id"),
        supabaseAdmin.from("parcels").select("area_hectares, status"),
        supabaseAdmin.from("awards").select("declared_amount"),
        supabaseAdmin.from("compensation").select("disbursed_amount, disbursement_status"),
      ]);
      for (const res of [projectsRes, parcelsRes, awardsRes, compensationRes]) {
        if (res.error) throw new Error(res.error.message);
      }

      const parcels = parcelsRes.data ?? [];
      const declared = (awardsRes.data ?? []).reduce((s, a) => s + toNum(a.declared_amount), 0);
      const disbursed = (compensationRes.data ?? []).reduce(
        (s, c) => s + toNum(c.disbursed_amount),
        0,
      );

      const projectsCount = (projectsRes.data ?? []).length;
      if (projectsCount > 0 || parcels.length > 0) {
        return {
          projects: projectsCount,
          area_notified: parcels
            .filter((p) => NOTIFIED_ONWARDS.includes(String(p.status)))
            .reduce((s, p) => s + toNum(p.area_hectares), 0),
          area_acquired: parcels
            .filter((p) => String(p.status) === "possession_taken")
            .reduce((s, p) => s + toNum(p.area_hectares), 0),
          compensation_declared: declared,
          compensation_disbursed: disbursed,
          compensation_pending: Math.max(declared - disbursed, 0),
          parcels_disputed: parcels.filter((p) => String(p.status) === "disputed").length,
        };
      }
    } catch (err) {
      console.warn(
        "[Bhoomi Setu] Database not connected or empty, using sample overview data:",
        err,
      );
    }

    return SAMPLE_OVERVIEW;
  },
);

export type PublicProjectSummary = {
  id: string;
  name: string;
  sector: string | null;
  requiring_body: string;
  status: string;
  state_name: string | null;
  district_name: string | null;
  estimated_area_ha: number | null;
  created_at: string | null;
  parcels: number;
  parcels_by_stage: Record<string, number>;
  area_notified: number;
  area_acquired: number;
  compensation_declared: number;
  compensation_disbursed: number;
  compensation_pending: number;
  disputes_open: number;
  families: number;
  completion: number;
  geometries: PublicParcel[];
};

// Public, unauthenticated read. Per-project progress figures and parcel
// outlines only — no landowner, ownership or payee identity is exposed.
export const getPublicProjects = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicProjectSummary[]> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const [projectsRes, parcelsRes, jurisRes, awardsRes, compRes, familiesRes] =
        await Promise.all([
          supabaseAdmin
            .from("projects")
            .select(
              "id, name, sector, requiring_body, status, state_id, district_id, estimated_area_ha, created_at",
            )
            .order("created_at", { ascending: false }),
          supabaseAdmin
            .from("public_parcels")
            .select("id, project_id, survey_number, area_hectares, status, geom")
            .limit(5000),
          supabaseAdmin.from("jurisdictions").select("id, name"),
          supabaseAdmin.from("awards").select("id, parcel_id, declared_amount"),
          supabaseAdmin
            .from("compensation")
            .select("award_id, disbursed_amount, disbursement_status"),
          supabaseAdmin.from("affected_families").select("id, parcel_id"),
        ]);
      for (const res of [projectsRes, parcelsRes, jurisRes, awardsRes, compRes, familiesRes]) {
        if (res.error) throw new Error(res.error.message);
      }

      const names = new Map((jurisRes.data ?? []).map((j) => [j.id, j.name]));
      const parcelProject = new Map<string, string>();
      for (const p of parcelsRes.data ?? []) {
        if (p.id && p.project_id) parcelProject.set(String(p.id), String(p.project_id));
      }

      const declaredByProject = new Map<string, number>();
      const awardProject = new Map<string, string>();
      for (const a of awardsRes.data ?? []) {
        const projectId = parcelProject.get(String(a.parcel_id));
        if (!projectId) continue;
        awardProject.set(String(a.id), projectId);
        declaredByProject.set(
          projectId,
          (declaredByProject.get(projectId) ?? 0) + toNum(a.declared_amount),
        );
      }

      const paidByProject = new Map<string, number>();
      for (const c of compRes.data ?? []) {
        const projectId = awardProject.get(String(c.award_id));
        if (!projectId) continue;
        paidByProject.set(
          projectId,
          (paidByProject.get(projectId) ?? 0) + toNum(c.disbursed_amount),
        );
      }

      const familiesByProject = new Map<string, number>();
      for (const f of familiesRes.data ?? []) {
        const projectId = f.parcel_id ? parcelProject.get(String(f.parcel_id)) : undefined;
        if (!projectId) continue;
        familiesByProject.set(projectId, (familiesByProject.get(projectId) ?? 0) + 1);
      }

      const projects = (projectsRes.data ?? []).map((project) => {
        const own = (parcelsRes.data ?? []).filter(
          (p) => String(p.project_id) === String(project.id),
        );
        const byStage: Record<string, number> = {};
        let areaNotified = 0;
        let areaAcquired = 0;
        let disputes = 0;
        for (const p of own) {
          const status = String(p.status ?? "identified");
          byStage[status] = (byStage[status] ?? 0) + 1;
          if (NOTIFIED_ONWARDS.includes(status)) areaNotified += toNum(p.area_hectares);
          if (status === "possession_taken") areaAcquired += toNum(p.area_hectares);
          if (status === "disputed") disputes += 1;
        }
        const declared = declaredByProject.get(String(project.id)) ?? 0;
        const paid = paidByProject.get(String(project.id)) ?? 0;

        return {
          id: String(project.id),
          name: project.name,
          sector: project.sector ?? null,
          requiring_body: project.requiring_body,
          status: project.status ?? "unknown",
          state_name: project.state_id ? (names.get(project.state_id) ?? null) : null,
          district_name: project.district_id ? (names.get(project.district_id) ?? null) : null,
          estimated_area_ha:
            project.estimated_area_ha === null ? null : toNum(project.estimated_area_ha),
          created_at: project.created_at ?? null,
          parcels: own.length,
          parcels_by_stage: byStage,
          area_notified: areaNotified,
          area_acquired: areaAcquired,
          compensation_declared: declared,
          compensation_disbursed: paid,
          compensation_pending: Math.max(declared - paid, 0),
          disputes_open: disputes,
          families: familiesByProject.get(String(project.id)) ?? 0,
          completion:
            own.length === 0
              ? 0
              : Math.round(((byStage["possession_taken"] ?? 0) / own.length) * 100),
          geometries: own.map((p) => ({
            id: String(p.id),
            survey_number: String(p.survey_number ?? ""),
            area_hectares: p.area_hectares ?? null,
            status: p.status ?? null,
            geometry: asGeometry(p.geom),
          })),
        } satisfies PublicProjectSummary;
      });

      if (projects.length > 0) {
        return projects;
      }
    } catch (err) {
      console.warn(
        "[Bhoomi Setu] Database not connected or empty, using sample projects data:",
        err,
      );
    }

    return SAMPLE_PROJECTS;
  },
);
