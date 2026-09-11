import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { indiaBoundaryLayer } from "leaflet-india-boundary/leaflet";
import { suppressedTileLayer } from "leaflet-india-boundary/suppress";
import type { PublicParcel, PublicRoute, PublicProjectSummary } from "@/lib/public-map.functions";
import { Link } from "@tanstack/react-router";
import { MapPin, RotateCcw, CheckCircle2, Navigation, Layers } from "lucide-react";

const STATUS_VAR: Record<string, string> = {
  identified: "--status-identified",
  notified: "--status-notified",
  award_declared: "--status-award",
  possession_taken: "--status-possession",
  disputed: "--status-disputed",
};

// District / City coordinates fallback for projects
const PROJECT_COORDINATES: Record<string, [number, number]> = {
  "proj-1": [19.34, 72.89], // Palghar / Vadodara-Mumbai Exp
  "proj-2": [24.95, 84.16], // Rohtas / Sonnagar DFC
  "proj-3": [12.97, 77.59], // Bengaluru Urban / Suburban Rail
  "proj-4": [23.36, 85.33], // Ranchi / NH-33
};

const STATE_CENTERS: Record<string, [number, number]> = {
  "Andhra Pradesh": [15.9129, 79.74],
  "Arunachal Pradesh": [28.218, 94.7278],
  Assam: [26.2006, 92.9376],
  Bihar: [25.0961, 85.3131],
  Chhattisgarh: [21.2787, 81.8661],
  Goa: [15.2993, 74.124],
  Gujarat: [22.2587, 71.1924],
  Haryana: [29.0588, 76.0856],
  "Himachal Pradesh": [31.1048, 77.1734],
  Jharkhand: [23.6102, 85.2799],
  Karnataka: [15.3173, 75.7139],
  Kerala: [10.8505, 76.2711],
  "Madhya Pradesh": [22.9734, 78.6569],
  Maharashtra: [19.7515, 75.7139],
  Manipur: [24.6637, 93.9063],
  Meghalaya: [25.467, 91.3662],
  Mizoram: [23.1645, 92.9376],
  Nagaland: [26.1584, 94.5624],
  Odisha: [20.9517, 85.0985],
  Punjab: [31.1471, 75.3412],
  Rajasthan: [27.0238, 74.2179],
  Sikkim: [27.533, 88.5122],
  "Tamil Nadu": [11.1271, 78.6569],
  Telangana: [18.1124, 79.0193],
  Tripura: [23.9408, 91.9882],
  "Uttar Pradesh": [26.8467, 80.9462],
  Uttarakhand: [30.0668, 79.0193],
  "West Bengal": [22.9868, 87.855],
  "Jammu & Kashmir": [33.7782, 76.5762],
  Ladakh: [34.1526, 77.5771],
  "NCT of Delhi": [28.7041, 77.1025],
  Delhi: [28.7041, 77.1025],
  Puducherry: [11.9416, 79.8083],
  Chandigarh: [30.7333, 76.7794],
};

function tokenColor(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function colorForStatus(status: string | null): string {
  const variable = STATUS_VAR[status ?? ""] ?? "--status-identified";
  return tokenColor(variable) || "#0284c7";
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );

// India bounding box restricts movement to Indian sub-continent
const INDIA_BOUNDS = L.latLngBounds([6.0, 68.0], [37.8, 97.8]);
const INDIA_CENTER: [number, number] = [22.8, 79.6];

export default function PublicParcelMap({
  parcels,
  routes = [],
  projects = [],
  isNationalPortal = false,
}: {
  parcels: PublicParcel[];
  routes?: PublicRoute[];
  projects?: PublicProjectSummary[];
  isNationalPortal?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  // State & Project Filter States (for National Dashboard)
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Group projects by state
  const stateProjectsMap = useMemo(() => {
    const map = new Map<string, PublicProjectSummary[]>();
    for (const proj of projects) {
      const stateName = proj.state_name || "National";
      const list = map.get(stateName) ?? [];
      list.push(proj);
      map.set(stateName, list);
    }
    return map;
  }, [projects]);

  // States that actually have projects
  const statesWithProjects = useMemo(() => {
    const set = new Set<string>();
    for (const proj of projects) {
      if (proj.state_name) set.add(proj.state_name);
    }
    return Array.from(set).sort();
  }, [projects]);

  // Filtered projects dropdown list based on selected state
  const selectableProjects = useMemo(() => {
    if (!selectedState) return projects;
    return projects.filter((p) => p.state_name === selectedState);
  }, [projects, selectedState]);

  // The actively selected project object
  const selectedProject = useMemo(() => {
    if (!selectedProjectId) return null;
    return projects.find((p) => p.id === selectedProjectId) ?? null;
  }, [projects, selectedProjectId]);

  // Determine which parcels to show:
  // 1. If NOT national portal (e.g. project detail page): ALWAYS show all passed parcels!
  // 2. If national portal:
  //    - If a project is selected: show ONLY that project's parcels!
  //    - If NO project is selected: show NO parcels on whole-India level (clean map).
  const visibleParcels = useMemo(() => {
    if (!isNationalPortal) {
      // Individual project map view: show all parcels for this project
      return parcels;
    }
    if (selectedProjectId) {
      return parcels.filter(
        (p) =>
          p.project_id === selectedProjectId ||
          (selectedProject?.geometries?.some((g) => g.id === p.id) ?? false),
      );
    }
    return [];
  }, [parcels, isNationalPortal, selectedProjectId, selectedProject]);

  // Determine which routes to show:
  const visibleRoutes = useMemo(() => {
    if (!isNationalPortal) {
      return routes;
    }
    if (selectedProjectId) {
      return routes.filter((r) => r.project_id === selectedProjectId);
    }
    return [];
  }, [routes, isNationalPortal, selectedProjectId]);

  // Handlers for National Dashboard Filter Section
  const handleStateChange = (stateName: string) => {
    if (!stateName) {
      setSelectedState(null);
      setSelectedProjectId(null);
      if (mapRef.current) {
        mapRef.current.setView(INDIA_CENTER, 4.8, { animate: true });
      }
      return;
    }

    setSelectedState(stateName);
    setSelectedProjectId(null);

    // Fatak se zoom to selected state
    const coords = STATE_CENTERS[stateName];
    if (mapRef.current && coords) {
      mapRef.current.setView(coords, 7, { animate: true });
    }
  };

  const handleProjectChange = useCallback(
    (projId: string) => {
      if (!projId) {
        setSelectedProjectId(null);
        if (selectedState && STATE_CENTERS[selectedState] && mapRef.current) {
          mapRef.current.setView(STATE_CENTERS[selectedState], 7, { animate: true });
        }
        return;
      }
      const proj = projects.find((p) => p.id === projId);
      setSelectedProjectId(projId);
      if (proj?.state_name) {
        setSelectedState(proj.state_name);
      }
    },
    [projects, selectedState],
  );

  const handleResetToNational = () => {
    setSelectedState(null);
    setSelectedProjectId(null);
    if (mapRef.current) {
      mapRef.current.setView(INDIA_CENTER, 4.8, { animate: true });
    }
  };

  // Initialize Map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Project view vs National view initial settings
    const initialCenter = isNationalPortal ? INDIA_CENTER : [20.5937, 78.9629];
    const initialZoom = isNationalPortal ? 4.8 : 8;

    const map = L.map(containerRef.current, {
      scrollWheelZoom: true,
      zoomControl: false,
      maxBounds: isNationalPortal ? INDIA_BOUNDS : undefined,
      maxBoundsViscosity: isNationalPortal ? 1.0 : undefined,
      minZoom: isNationalPortal ? 4 : 3,
      maxZoom: 18,
    }).setView(initialCenter as L.LatLngExpression, initialZoom);

    // Official Indian basemap: suppressedTileLayer erases incorrect LoC/LAC lines from raster tiles
    const baseTiles = suppressedTileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | Official Survey of India Boundary Alignment',
      maxZoom: 18,
      minZoom: 3,
      fallbackOnError: true,
      seamlessEdges: true,
    });
    baseTiles.addTo(map);

    // Official Survey of India sovereign boundary overlay (Jammu & Kashmir, Ladakh, Aksai Chin, Arunachal Pradesh)
    const boundaryOverlay = indiaBoundaryLayer();
    boundaryOverlay.addTo(map);

    // Also load the sovereign external boundary line
    fetch("/data/india_boundary.geojson")
      .then((r) => (r.ok ? r.json() : null))
      .then((soiData) => {
        if (!mapRef.current || !soiData) return;
        L.geoJSON(soiData, {
          style: {
            color: "#7b5579",
            weight: 1.8,
            opacity: 0.85,
          },
          interactive: false,
        }).addTo(mapRef.current);
      })
      .catch(() => null);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    mapRef.current = map;

    // Ensure map tiles are properly loaded and sized
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render Layers & Manage View Focus
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const layers: L.Layer[] = [];

    // Render Parcels & Routes for selected project (or project-specific map)
    const parcelLayers: L.Layer[] = [];

    // Highway Routes for selected project
    for (const route of visibleRoutes) {
      if (!route.geometry) continue;
      const casing = L.geoJSON(route.geometry as never, {
        style: { color: "#0369a1", weight: 6, opacity: 0.9, lineCap: "round" },
      });
      const core = L.geoJSON(route.geometry as never, {
        style: { color: "#38bdf8", weight: 3, opacity: 1, dashArray: "6, 8" },
      });
      casing.bindPopup(
        `<div class="p-1">
          <div class="text-xs font-bold text-sky-900">${escapeHtml(route.name)}</div>
          <div class="text-[11px] text-slate-600">Highway Alignment Corridor</div>
        </div>`,
      );
      casing.addTo(map);
      core.addTo(map);
      layers.push(casing, core);
      parcelLayers.push(casing);
    }

    // Land Parcels for this project
    for (const parcel of visibleParcels) {
      if (!parcel.geometry) continue;
      const color = colorForStatus(parcel.status);
      const shape = L.geoJSON(parcel.geometry as never, {
        style: {
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.55,
        },
      });

      const areaText =
        parcel.area_hectares === null ? "Not recorded" : `${parcel.area_hectares} ha`;
      const statusText = (parcel.status ?? "not recorded").replace(/_/g, " ");

      shape.bindPopup(
        `<div class="p-1.5 min-w-[150px]">
          <div class="text-xs font-bold text-slate-900">Survey No. ${escapeHtml(
            parcel.survey_number,
          )}</div>
          <div class="text-[11px] text-slate-600 mt-1">Area: <strong class="text-slate-900">${escapeHtml(
            areaText,
          )}</strong></div>
          <div class="text-[11px] text-slate-600">Status: <span class="capitalize font-semibold text-sky-700">${escapeHtml(
            statusText,
          )}</span></div>
        </div>`,
      );

      shape.addTo(map);
      layers.push(shape);
      parcelLayers.push(shape);
    }

    // AUTO-ZOOM TO FIT PROJECT PARCELS
    // If we have parcel layers (either in project detail page OR selected project in national portal),
    // zoom directly to fit those parcels!
    if (parcelLayers.length > 0) {
      const group = L.featureGroup(parcelLayers as L.FeatureGroup[]);
      const bounds = group.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      }
    } else if (selectedProjectId && isNationalPortal) {
      // Fallback if project has no mapped parcels yet
      const coords =
        PROJECT_COORDINATES[selectedProjectId] ??
        (selectedProject?.state_name ? STATE_CENTERS[selectedProject.state_name] : null);
      if (coords) {
        map.setView(coords, 12, { animate: true });
      }
    }

    return () => {
      for (const layer of layers) map.removeLayer(layer);
    };
  }, [
    visibleParcels,
    visibleRoutes,
    projects,
    selectedProjectId,
    selectedProject,
    isNationalPortal,
  ]);

  return (
    <div className="w-full h-full flex flex-col">
      {/* ========================================================================= */}
      {/* DEDICATED SECTION JUST ABOVE THE MAP (Shown on National Dashboard)       */}
      {/* "ek alag se section add kardo just map ka upar select state and project"   */}
      {/* ========================================================================= */}
      {isNationalPortal && (
        <div className="mb-4 surface p-4 sm:p-5 border border-border/80 rounded-2xl shadow-xs space-y-4">
          {/* Header row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <MapPin className="size-4 text-primary" />
                Select State &amp; Project
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Choose a state and project to zoom directly into its notified land parcels.
              </p>
            </div>

            {selectedProjectId && (
              <button
                type="button"
                onClick={handleResetToNational}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline self-start sm:self-auto px-2.5 py-1 rounded-md bg-primary/10 hover:bg-primary/15 transition"
              >
                <RotateCcw className="size-3.5" />
                Reset Map (All India)
              </button>
            )}
          </div>

          {/* Dropdown Selectors */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Select State
              </label>
              <select
                value={selectedState ?? ""}
                onChange={(e) => handleStateChange(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
              >
                <option value="">
                  All States ({statesWithProjects.length} States with Projects)
                </option>
                {statesWithProjects.map((st) => {
                  const count = stateProjectsMap.get(st)?.length ?? 0;
                  return (
                    <option key={st} value={st}>
                      {st} ({count} project{count > 1 ? "s" : ""})
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Select Project
              </label>
              <select
                value={selectedProjectId ?? ""}
                onChange={(e) => handleProjectChange(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
              >
                <option value="">
                  {selectedState
                    ? `Choose a project in ${selectedState}…`
                    : "Choose an infrastructure project…"}
                </option>
                {selectableProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.district_name ? `${p.district_name}, ` : ""}
                    {p.state_name || "National"})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Selected Project Active Status Banner */}
          {selectedProject && (
            <div className="rounded-xl bg-primary/10 border border-primary/25 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-primary shrink-0" />
                <div>
                  <span className="font-bold text-foreground">{selectedProject.name}</span>
                  <span className="text-muted-foreground ml-1.5">
                    ({selectedProject.district_name ? `${selectedProject.district_name}, ` : ""}
                    {selectedProject.state_name}) &bull; Displaying {visibleParcels.length} parcel
                    boundaries on map below
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Link
                  to="/projects/$projectId"
                  params={{ projectId: selectedProject.id }}
                  className="font-semibold text-primary hover:underline"
                >
                  View Project Details &rarr;
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* CLEAN MAP DISPLAY CANVAS                                                 */}
      {/* "pleade clear the map aisa ghatiya lagega" - Clear and unobstructed map!  */}
      {/* ========================================================================= */}
      <div
        className={`relative w-full overflow-hidden rounded-2xl border border-border/80 shadow-sm bg-slate-50 ${
          isNationalPortal ? "h-[30rem] sm:h-[36rem]" : "h-full min-h-[320px]"
        }`}
      >
        {/* Subtle compliance tag in corner */}
        <div className="pointer-events-none absolute left-3 top-3 z-[400]">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/90 px-3 py-1 text-[11px] font-medium text-foreground/80 shadow-xs backdrop-blur-md">
            <span className="size-2 rounded-full bg-emerald-500" />
            <span>Standard Indian Map</span>
            <span className="text-muted-foreground">| Survey of India Alignment</span>
          </div>
        </div>

        {/* Floating Reset Button if zoomed into a project */}
        {isNationalPortal && selectedProjectId && (
          <div className="absolute right-3 top-3 z-[400]">
            <button
              type="button"
              onClick={handleResetToNational}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/95 px-3 py-1.5 text-xs font-semibold text-foreground shadow-md backdrop-blur hover:bg-muted transition"
            >
              <Navigation className="size-3.5 rotate-45 text-primary" />
              All India View
            </button>
          </div>
        )}

        {/* Empty state notice if project has no parcels mapped */}
        {!isNationalPortal && visibleParcels.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-[400] flex items-center justify-center">
            <div className="rounded-xl border border-border bg-background/90 px-4 py-3 text-xs text-muted-foreground shadow-sm backdrop-blur">
              No land parcels mapped for this project yet. Use District GIS tools to draw parcels.
            </div>
          </div>
        )}

        {/* Leaflet Canvas Container */}
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  );
}
