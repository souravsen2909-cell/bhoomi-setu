import { Component, Suspense, lazy, type ReactNode } from "react";
import { ClientOnly } from "@tanstack/react-router";
import type { GeoJsonGeometry } from "@/lib/public-map.functions";

type Parcel = {
  id: string;
  survey_number: string;
  area_hectares: number | null;
  status: string | null;
  geometry: GeoJsonGeometry | null;
};

const PublicParcelMap = lazy(() =>
  import("@/components/PublicParcelMap").catch(() => import("@/components/PublicParcelMap")),
);

class MapBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="flex h-[360px] items-center justify-center rounded-xl border border-border bg-muted/40 text-sm text-muted-foreground">
      {text}
    </div>
  );
}

/** Map of parcels that never blanks the page if the map fails to load. */
export function LazyParcelMap({ parcels, height = 360 }: { parcels: Parcel[]; height?: number }) {
  return (
    <MapBoundary
      fallback={<Placeholder text="Map could not be loaded. Refresh the page to try again." />}
    >
      <ClientOnly fallback={<Placeholder text="Loading map…" />}>
        <Suspense fallback={<Placeholder text="Loading map…" />}>
          <div style={{ height }}>
            <PublicParcelMap parcels={parcels} routes={[]} />
          </div>
        </Suspense>
      </ClientOnly>
    </MapBoundary>
  );
}
