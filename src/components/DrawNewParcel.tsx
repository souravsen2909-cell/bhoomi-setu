import { lazy, Suspense, useState, useMemo } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createDrawnParcel,
  createDrawnHighwayRoute,
  getParcelDrawOptions,
} from "@/lib/parcels.functions";
import { Layers, Route, CheckCircle2, AlertCircle, Compass } from "lucide-react";

const ParcelDrawMap = lazy(() => import("@/components/ParcelDrawMap"));

const NEW_OWNER = "__new__";

function calculateDistanceKm(coords: [number, number][]): number {
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [lng1, lat1] = coords[i];
    const [lng2, lat2] = coords[i + 1];
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    total += 6371 * c;
  }
  return Math.round(total * 100) / 100;
}

export default function DrawNewParcel({ lockedProjectId }: { lockedProjectId?: string } = {}) {
  const fetchOptions = useServerFn(getParcelDrawOptions);
  const saveParcel = useServerFn(createDrawnParcel);
  const saveRoute = useServerFn(createDrawnHighwayRoute);
  const queryClient = useQueryClient();

  // Mode: "parcel" (polygon) or "route" (highway polyline)
  const [activeTool, setActiveTool] = useState<"parcel" | "route">("parcel");

  const { data, isLoading, error } = useQuery({
    queryKey: ["parcel-draw-options"],
    queryFn: () => fetchOptions(),
  });

  // Parcel fields
  const [ring, setRing] = useState<[number, number][] | null>(null);
  const [projectId, setProjectId] = useState(lockedProjectId ?? "");
  const [surveyNumber, setSurveyNumber] = useState("");
  const [area, setArea] = useState("");
  const [landowner, setLandowner] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");

  // Route fields
  const [routeCoords, setRouteCoords] = useState<[number, number][] | null>(null);
  const [routeName, setRouteName] = useState("");
  const [corridorWidth, setCorridorWidth] = useState("60");

  const [formError, setFormError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const resetParcel = () => {
    setRing(null);
    setProjectId(lockedProjectId ?? "");
    setSurveyNumber("");
    setArea("");
    setLandowner("");
    setOwnerName("");
    setOwnerPhone("");
  };

  const resetRoute = () => {
    setRouteCoords(null);
    setRouteName("");
    setCorridorWidth("60");
    setProjectId(lockedProjectId ?? "");
  };

  const saveParcelMutation = useMutation({
    mutationFn: () =>
      saveParcel({
        data: {
          projectId,
          surveyNumber,
          areaHectares: Number(area),
          ring: ring ?? [],
          landownerId: landowner && landowner !== NEW_OWNER ? landowner : null,
          newLandowner:
            landowner === NEW_OWNER ? { fullName: ownerName, contactPhone: ownerPhone } : null,
        },
      }),
    onSuccess: () => {
      setFormError(null);
      setSavedMessage("Land parcel boundary successfully saved and added to the official record.");
      resetParcel();
      queryClient.invalidateQueries({ queryKey: ["parcel-draw-options"] });
      queryClient.invalidateQueries({ queryKey: ["public-map"] });
      queryClient.invalidateQueries({ queryKey: ["agency-projects"] });
      if (lockedProjectId)
        queryClient.invalidateQueries({ queryKey: ["agency-project", lockedProjectId] });
    },
    onError: (e: Error) => {
      setSavedMessage(null);
      setFormError(e.message);
    },
  });

  const saveRouteMutation = useMutation({
    mutationFn: () =>
      saveRoute({
        data: {
          projectId,
          name: routeName,
          coordinates: routeCoords ?? [],
          widthMeters: Number(corridorWidth) || 60,
        },
      }),
    onSuccess: () => {
      setFormError(null);
      setSavedMessage("Highway alignment corridor successfully saved and added to district map.");
      resetRoute();
      queryClient.invalidateQueries({ queryKey: ["parcel-draw-options"] });
      queryClient.invalidateQueries({ queryKey: ["public-map"] });
      queryClient.invalidateQueries({ queryKey: ["agency-projects"] });
      if (lockedProjectId)
        queryClient.invalidateQueries({ queryKey: ["agency-project", lockedProjectId] });
    },
    onError: (e: Error) => {
      setSavedMessage(null);
      setFormError(e.message);
    },
  });

  const projects = data?.projects ?? [];
  const landowners = data?.landowners ?? [];

  const routeDistance = useMemo(() => {
    if (!routeCoords || routeCoords.length < 2) return 0;
    return calculateDistanceKm(routeCoords);
  }, [routeCoords]);

  return (
    <section className="mt-8 surface p-4 sm:p-6 border border-border/90 shadow-sm rounded-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/70 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Compass className="size-5 text-primary" />
            District GIS Spatial Mapping Tools
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Map project parcels and highway route corridors with Survey of India geographic
            alignment.
          </p>
        </div>

        {/* Tool Mode Switcher */}
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1 border border-border/80 shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveTool("parcel");
              setSavedMessage(null);
              setFormError(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              activeTool === "parcel"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Layers className="size-3.5 text-sky-600" />
            Draw Parcel (Polygon)
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTool("route");
              setSavedMessage(null);
              setFormError(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              activeTool === "route"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Route className="size-3.5 text-primary" />
            Draw Highway Route (Polyline)
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-4 text-sm text-destructive flex items-center gap-1.5">
          <AlertCircle className="size-4" />
          Could not load projects and spatial records: {(error as Error).message}
        </p>
      )}

      {/* Instructions Banner */}
      <div className="mt-4 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/50 p-3 text-xs text-sky-900 dark:text-sky-200 flex items-start gap-2">
        {activeTool === "parcel" ? (
          <>
            <Layers className="size-4 shrink-0 text-sky-600 mt-0.5" />
            <div>
              <span className="font-semibold">Parcel Mapping Mode:</span> Use the polygon draw tool
              in the map top-right corner to click the vertices of the land parcel. Double-click to
              close the polygon boundary.
            </div>
          </>
        ) : (
          <>
            <Route className="size-4 shrink-0 text-primary mt-0.5" />
            <div>
              <span className="font-semibold">Highway Corridor Mapping Mode:</span> Use the polyline
              tool in the map top-right corner to map the highway alignment corridor. Click
              milestones or vertices along the corridor and double-click to finish the alignment.
            </div>
          </>
        )}
      </div>

      {/* Map Display */}
      <div className="mt-4 overflow-hidden rounded-xl border border-border shadow-xs">
        <ClientOnly
          fallback={
            <div className="flex h-[340px] sm:h-[440px] items-center justify-center text-sm text-muted-foreground">
              Loading spatial GIS map…
            </div>
          }
        >
          <Suspense
            fallback={
              <div className="flex h-[340px] sm:h-[440px] items-center justify-center text-sm text-muted-foreground">
                Loading spatial GIS map…
              </div>
            }
          >
            <ParcelDrawMap
              parcels={data?.parcels ?? []}
              routes={data?.routes ?? []}
              drawMode={activeTool}
              onPolygonDrawn={(drawn) => {
                if (activeTool === "parcel") {
                  setRing(drawn);
                  setSavedMessage(null);
                  setFormError(null);
                }
              }}
              onRouteDrawn={(coords) => {
                if (activeTool === "route") {
                  setRouteCoords(coords);
                  setSavedMessage(null);
                  setFormError(null);
                }
              }}
            />
          </Suspense>
        </ClientOnly>
      </div>

      {savedMessage && (
        <div className="mt-4 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
          <span>{savedMessage}</span>
        </div>
      )}

      {/* FORM 1: Drawn Parcel Form */}
      {activeTool === "parcel" && ring && (
        <form
          className="mt-6 grid gap-4 sm:grid-cols-2 rounded-xl border border-border bg-muted/20 p-4 sm:p-5"
          onSubmit={(e) => {
            e.preventDefault();
            saveParcelMutation.mutate();
          }}
        >
          <div className="sm:col-span-2 flex items-center justify-between border-b border-border/70 pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400">
              New Parcel Record ({ring.length} boundary coordinates)
            </span>
            <button
              type="button"
              onClick={resetParcel}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear Boundary
            </button>
          </div>

          {!lockedProjectId && (
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-foreground" htmlFor="p-project">
                Approved Infrastructure Project *
              </label>
              <select
                id="p-project"
                required
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="">
                  {isLoading
                    ? "Loading approved projects…"
                    : projects.length === 0
                      ? "No approved projects in district"
                      : `Select an approved project (${projects.length} available)`}
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground" htmlFor="p-survey">
              Revenue Survey Number *
            </label>
            <input
              id="p-survey"
              required
              placeholder="e.g. 142/3A"
              value={surveyNumber}
              onChange={(e) => setSurveyNumber(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground" htmlFor="p-area">
              Area (Hectares) *
            </label>
            <input
              id="p-area"
              type="number"
              step="0.0001"
              min="0.0001"
              required
              placeholder="e.g. 1.2500"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-foreground" htmlFor="p-owner">
              Recorded Landowner *
            </label>
            <select
              id="p-owner"
              required
              value={landowner}
              onChange={(e) => setLandowner(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="">Select landowner from district registry</option>
              {landowners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.full_name}
                  {o.contact_phone ? ` — ${o.contact_phone}` : ""}
                </option>
              ))}
              <option value={NEW_OWNER}>+ Add New Landowner</option>
            </select>
          </div>

          {landowner === NEW_OWNER && (
            <>
              <div>
                <label className="block text-sm font-medium text-foreground" htmlFor="p-oname">
                  Landowner Full Name *
                </label>
                <input
                  id="p-oname"
                  required
                  placeholder="e.g. Ramesh Chandra Verma"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground" htmlFor="p-ophone">
                  Contact Mobile Phone
                </label>
                <input
                  id="p-ophone"
                  placeholder="+91 9876543210"
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
            </>
          )}

          {formError && <p className="sm:col-span-2 text-sm text-destructive">{formError}</p>}

          <div className="sm:col-span-2 flex flex-wrap gap-3 pt-2">
            <button
              type="submit"
              disabled={saveParcelMutation.isPending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition"
            >
              {saveParcelMutation.isPending ? "Recording Parcel…" : "Save Land Parcel"}
            </button>
            <button
              type="button"
              onClick={resetParcel}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition"
            >
              Discard
            </button>
          </div>
        </form>
      )}

      {/* FORM 2: Drawn Highway Route Form */}
      {activeTool === "route" && routeCoords && (
        <form
          className="mt-6 grid gap-4 sm:grid-cols-2 rounded-xl border border-sky-300/60 dark:border-sky-800 bg-sky-50/40 dark:bg-sky-950/20 p-4 sm:p-5"
          onSubmit={(e) => {
            e.preventDefault();
            saveRouteMutation.mutate();
          }}
        >
          <div className="sm:col-span-2 flex items-center justify-between border-b border-border/70 pb-2">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400">
                New Highway Route Alignment
              </span>
              <span className="ml-2 inline-flex items-center gap-1 rounded bg-sky-100 dark:bg-sky-900 px-2 py-0.5 text-[11px] font-mono text-sky-800 dark:text-sky-200">
                {routeCoords.length} Waypoints &bull; ~{routeDistance} km length
              </span>
            </div>
            <button
              type="button"
              onClick={resetRoute}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear Route
            </button>
          </div>

          {!lockedProjectId && (
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-foreground" htmlFor="r-project">
                Associated Highway Project *
              </label>
              <select
                id="r-project"
                required
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="">
                  {isLoading
                    ? "Loading approved projects…"
                    : projects.length === 0
                      ? "No approved highway projects in district"
                      : `Select highway project (${projects.length} available)`}
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground" htmlFor="r-name">
              Route Alignment Name *
            </label>
            <input
              id="r-name"
              required
              placeholder="e.g. NH-33 Ranchi Bypass 4-Lane Alignment"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground" htmlFor="r-width">
              Right-of-Way Corridor Width (Meters)
            </label>
            <input
              id="r-width"
              type="number"
              min="10"
              max="200"
              required
              placeholder="60"
              value={corridorWidth}
              onChange={(e) => setCorridorWidth(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>

          {formError && <p className="sm:col-span-2 text-sm text-destructive">{formError}</p>}

          <div className="sm:col-span-2 flex flex-wrap gap-3 pt-2">
            <button
              type="submit"
              disabled={saveRouteMutation.isPending}
              className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50 transition shadow-sm"
            >
              {saveRouteMutation.isPending ? "Saving Alignment…" : "Save Highway Route Alignment"}
            </button>
            <button
              type="button"
              onClick={resetRoute}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition"
            >
              Discard
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
