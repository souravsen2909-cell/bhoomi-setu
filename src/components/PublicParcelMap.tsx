import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PublicParcel, PublicRoute } from "@/lib/public-map.functions";

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

function colorForStatus(status: string | null): string {
  const variable = STATUS_VAR[status ?? ""] ?? "--status-identified";
  return tokenColor(variable);
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );

export default function PublicParcelMap({
  parcels,
  routes,
}: {
  parcels: PublicParcel[];
  routes: PublicRoute[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: true, zoomControl: false }).setView(
      [22.9734, 78.6569],
      5,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const layers: L.Layer[] = [];

    for (const route of routes) {
      if (!route.geometry) continue;
      const line = L.geoJSON(route.geometry as never, {
        style: { color: tokenColor("--route-line"), weight: 6, opacity: 0.9 },
      });
      line.bindPopup(`<strong>${escapeHtml(route.name)}</strong><br/>Highway route`);
      line.addTo(map);
      layers.push(line);
    }

    for (const parcel of parcels) {
      if (!parcel.geometry) continue;
      const color = colorForStatus(parcel.status);
      const shape = L.geoJSON(parcel.geometry as never, {
        style: { color, weight: 1.5, fillColor: color, fillOpacity: 0.45 },
      });
      const area = parcel.area_hectares === null ? "Not recorded" : `${parcel.area_hectares} ha`;
      const status = (parcel.status ?? "not recorded").replace(/_/g, " ");
      shape.bindPopup(
        `<strong>Survey no. ${escapeHtml(parcel.survey_number)}</strong><br/>Area: ${escapeHtml(
          area,
        )}<br/>Status: ${escapeHtml(status)}`,
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

  return <div ref={containerRef} className="h-full w-full" />;
}
