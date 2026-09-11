import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";
import { indiaBoundaryLayer } from "leaflet-india-boundary/leaflet";
import { suppressedTileLayer } from "leaflet-india-boundary/suppress";
import type { DrawnParcel, DrawnRoute } from "@/lib/parcels.functions";

const STATUS_VAR: Record<string, string> = {
  identified: "--status-identified",
  notified: "--status-notified",
  award_declared: "--status-award",
  possession_taken: "--status-possession",
  disputed: "--status-disputed",
};

function tokenColor(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );

export default function ParcelDrawMap({
  parcels,
  routes = [],
  drawMode = "both",
  onPolygonDrawn,
  onRouteDrawn,
}: {
  parcels: DrawnParcel[];
  routes?: DrawnRoute[];
  drawMode?: "parcel" | "route" | "both";
  onPolygonDrawn?: (ring: [number, number][]) => void;
  onRouteDrawn?: (coordinates: [number, number][]) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const drawnRef = useRef<L.FeatureGroup | null>(null);
  const controlRef = useRef<L.Control.Draw | null>(null);
  const polygonCallbackRef = useRef(onPolygonDrawn);
  polygonCallbackRef.current = onPolygonDrawn;
  const routeCallbackRef = useRef(onRouteDrawn);
  routeCallbackRef.current = onRouteDrawn;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Restricted to India
    const map = L.map(containerRef.current, {
      scrollWheelZoom: true,
      maxBounds: L.latLngBounds([6.0, 68.0], [37.8, 97.8]),
      maxBoundsViscosity: 1.0,
      minZoom: 4,
      maxZoom: 19,
    }).setView([22.9734, 78.6569], 5);

    const baseTiles = suppressedTileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | Survey of India Alignment',
      maxZoom: 19,
      minZoom: 4,
      fallbackOnError: true,
      seamlessEdges: true,
    });
    baseTiles.addTo(map);

    // Official Survey of India sovereign boundary overlay
    indiaBoundaryLayer().addTo(map);

    // Survey of India sovereign boundary line overlay
    fetch("/data/india_boundary.geojson")
      .then((r) => (r.ok ? r.json() : null))
      .then((soiData) => {
        if (!mapRef.current || !soiData) return;
        L.geoJSON(soiData, {
          style: {
            color: "#1e3a8a",
            weight: 2,
            opacity: 0.9,
          },
        }).addTo(mapRef.current);
      })
      .catch(() => null);

    const drawn = new L.FeatureGroup();
    map.addLayer(drawn);
    drawnRef.current = drawn;

    const control = new L.Control.Draw({
      position: "topright",
      edit: { featureGroup: drawn, edit: false, remove: true },
      draw: {
        polygon:
          drawMode === "route"
            ? false
            : {
                allowIntersection: false,
                showArea: true,
                shapeOptions: {
                  color: tokenColor("--status-identified") || "#0284c7",
                  weight: 2.5,
                  fillOpacity: 0.35,
                },
              },
        polyline:
          drawMode === "parcel"
            ? false
            : {
                shapeOptions: {
                  color: "#0284c7",
                  weight: 5,
                  opacity: 0.9,
                  dashArray: "6, 8",
                },
              },
        rectangle: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
    });
    map.addControl(control);
    controlRef.current = control;

    map.on(L.Draw.Event.CREATED, (event: unknown) => {
      const e = event as { layerType: string; layer: L.Layer };
      drawn.clearLayers();
      drawn.addLayer(e.layer);

      if (e.layerType === "polygon") {
        const poly = e.layer as L.Polygon;
        const latlngs = poly.getLatLngs()[0];
        const ring = (Array.isArray(latlngs) ? (latlngs as L.LatLng[]) : []).map(
          (p) => [p.lng, p.lat] as [number, number],
        );
        if (ring.length >= 3 && polygonCallbackRef.current) {
          polygonCallbackRef.current(ring);
        }
      } else if (e.layerType === "polyline") {
        const line = e.layer as L.Polyline;
        const latlngs = line.getLatLngs();
        const coords = (Array.isArray(latlngs) ? (latlngs as L.LatLng[]) : []).map(
          (p) => [p.lng, p.lat] as [number, number],
        );
        if (coords.length >= 2 && routeCallbackRef.current) {
          routeCallbackRef.current(coords);
        }
      }
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      drawnRef.current = null;
      controlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update draw control if drawMode changes dynamically
  useEffect(() => {
    const map = mapRef.current;
    const drawn = drawnRef.current;
    if (!map || !drawn) return;

    if (controlRef.current) {
      map.removeControl(controlRef.current);
    }

    const control = new L.Control.Draw({
      position: "topright",
      edit: { featureGroup: drawn, edit: false, remove: true },
      draw: {
        polygon:
          drawMode === "route"
            ? false
            : {
                allowIntersection: false,
                showArea: true,
                shapeOptions: {
                  color: tokenColor("--status-identified") || "#0284c7",
                  weight: 2.5,
                  fillOpacity: 0.35,
                },
              },
        polyline:
          drawMode === "parcel"
            ? false
            : {
                shapeOptions: {
                  color: "#0284c7",
                  weight: 5,
                  opacity: 0.9,
                  dashArray: "6, 8",
                },
              },
        rectangle: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
    });
    map.addControl(control);
    controlRef.current = control;
  }, [drawMode]);

  // Render parcels and routes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers: L.Layer[] = [];

    // Highway Routes
    for (const route of routes) {
      if (!route.geometry) continue;
      const line = L.geoJSON(route.geometry as never, {
        style: { color: "#0284c7", weight: 6, opacity: 0.9, dashArray: "4, 6" },
      });
      line.bindPopup(
        `<div class="p-1">
          <div class="text-xs font-bold text-sky-900">${escapeHtml(route.name)}</div>
          <div class="text-[11px] text-slate-600">Highway Alignment Corridor</div>
        </div>`,
      );
      line.addTo(map);
      layers.push(line);
    }

    // Land Parcels
    for (const parcel of parcels) {
      if (!parcel.geometry) continue;
      const color = tokenColor(STATUS_VAR[parcel.status ?? ""] ?? "--status-identified");
      const shape = L.geoJSON(parcel.geometry as never, {
        style: { color, weight: 1.5, fillColor: color, fillOpacity: 0.4 },
      });
      const area = parcel.area_hectares === null ? "Not recorded" : `${parcel.area_hectares} ha`;
      shape.bindPopup(
        `<div class="p-1">
          <div class="text-xs font-bold">Survey no. ${escapeHtml(parcel.survey_number)}</div>
          <div class="text-[11px] text-slate-600">Area: ${escapeHtml(area)}</div>
          <div class="text-[11px] text-slate-600">Status: ${escapeHtml(
            (parcel.status ?? "not recorded").replace(/_/g, " "),
          )}</div>
        </div>`,
      );
      shape.addTo(map);
      layers.push(shape);
    }

    if (layers.length > 0) {
      const group = L.featureGroup(layers as L.FeatureGroup[]);
      const bounds = group.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [32, 32] });
    }

    return () => {
      for (const layer of layers) map.removeLayer(layer);
    };
  }, [parcels, routes]);

  return (
    <div ref={containerRef} className="h-[340px] sm:h-[440px] w-full rounded-xl shadow-inner" />
  );
}
