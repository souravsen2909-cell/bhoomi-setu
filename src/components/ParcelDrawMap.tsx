import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";
import type { DrawnParcel } from "@/lib/parcels.functions";

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
  onPolygonDrawn,
}: {
  parcels: DrawnParcel[];
  onPolygonDrawn: (ring: [number, number][]) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const drawnRef = useRef<L.FeatureGroup | null>(null);
  const callbackRef = useRef(onPolygonDrawn);
  callbackRef.current = onPolygonDrawn;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView(
      [22.9734, 78.6569],
      5,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    const drawn = new L.FeatureGroup();
    map.addLayer(drawn);
    drawnRef.current = drawn;

    const control = new L.Control.Draw({
      position: "topright",
      edit: { featureGroup: drawn, edit: false, remove: true },
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: false,
          shapeOptions: { color: tokenColor("--status-identified") || "#64748b", weight: 2 },
        },
        polyline: false,
        rectangle: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
    });
    map.addControl(control);

    map.on(L.Draw.Event.CREATED, (event: unknown) => {
      const layer = (event as { layer: L.Polygon }).layer;
      drawn.clearLayers();
      drawn.addLayer(layer);
      const latlngs = layer.getLatLngs()[0];
      const ring = (Array.isArray(latlngs) ? (latlngs as L.LatLng[]) : []).map(
        (p) => [p.lng, p.lat] as [number, number],
      );
      if (ring.length >= 3) callbackRef.current(ring);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      drawnRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers: L.Layer[] = [];

    for (const parcel of parcels) {
      if (!parcel.geometry) continue;
      const color = tokenColor(STATUS_VAR[parcel.status ?? ""] ?? "--status-identified");
      const shape = L.geoJSON(parcel.geometry as never, {
        style: { color, weight: 1.5, fillColor: color, fillOpacity: 0.4 },
      });
      const area = parcel.area_hectares === null ? "Not recorded" : `${parcel.area_hectares} ha`;
      shape.bindPopup(
        `<strong>Survey no. ${escapeHtml(parcel.survey_number)}</strong><br/>Area: ${escapeHtml(
          area,
        )}<br/>Status: ${escapeHtml((parcel.status ?? "not recorded").replace(/_/g, " "))}`,
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
  }, [parcels]);

  return <div ref={containerRef} className="h-[320px] sm:h-[420px] w-full rounded-xl" />;
}
