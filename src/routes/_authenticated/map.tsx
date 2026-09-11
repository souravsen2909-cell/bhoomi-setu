import { createFileRoute, Link, ClientOnly } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { getPublicMapData } from "@/lib/public-map.functions";
import { MapLegendStack } from "@/components/MapLegend";
import { BrandLockup } from "@/components/Brand";

const PublicParcelMap = lazy(() => import("@/components/PublicParcelMap"));

export const Route = createFileRoute("/_authenticated/map")({
  head: () => ({
    meta: [
      { title: "Parcel Map — Bhoomi Setu Land Acquisition Register" },
      {
        name: "description",
        content:
          "Full-screen map of published land parcels under acquisition with their current stage.",
      },
      { property: "og:title", content: "Full Parcel Map — Bhoomi Setu" },
      {
        property: "og:description",
        content:
          "Full-screen map of published land parcels under acquisition with their current stage.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ParcelMapPage,
});

function MapFallback() {
  return (
    <div className="flex h-full items-center justify-center bg-muted">
      <p className="text-sm text-muted-foreground">Loading map…</p>
    </div>
  );
}

function ParcelMapPage() {
  const fetchMapData = useServerFn(getPublicMapData);
  const { data, isLoading, error } = useQuery({
    queryKey: ["public-map"],
    queryFn: () => fetchMapData(),
  });

  const parcels = data?.parcels ?? [];
  const routes = data?.routes ?? [];
  const mappable = parcels.filter((p) => p.geometry !== null).length;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-background flex flex-col">
      <div className="absolute inset-0 pt-20 sm:pt-24 p-3 sm:p-4 overflow-y-auto">
        <ClientOnly fallback={<MapFallback />}>
          <Suspense fallback={<MapFallback />}>
            <PublicParcelMap
              parcels={parcels}
              routes={routes}
              projects={data?.projects}
              isNationalPortal={true}
            />
          </Suspense>
        </ClientOnly>
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-[500] grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 p-3 sm:p-4">
        <div className="pointer-events-auto min-w-0 surface px-3 py-2.5 sm:px-4 sm:py-3">
          <Link to="/">
            <BrandLockup subtitle="Parcel status map" />
          </Link>
          <p className="mt-2 text-xs text-muted-foreground">
            {isLoading
              ? "Loading parcels…"
              : error
                ? "Parcel data is unavailable right now."
                : parcels.length === 0
                  ? "No parcels published yet."
                  : `${parcels.length} parcels · ${mappable} mapped`}
          </p>
        </div>
        <Link
          to="/dashboard"
          className="pointer-events-auto inline-flex shrink-0 items-center rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-card hover:bg-primary/90 sm:px-4"
        >
          Back to portal
        </Link>
      </header>

      {!isLoading && !error && parcels.length === 0 ? (
        <div className="pointer-events-none absolute inset-x-3 top-32 z-[500] flex justify-center">
          <p className="pointer-events-auto max-w-sm surface px-4 py-3 text-center text-sm text-muted-foreground">
            No parcel boundaries have been published yet. Once officers record parcels, they will
            appear here in their stage colour.
          </p>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[500] sm:bottom-6 sm:left-4 sm:right-auto sm:w-56">
        <div className="pointer-events-auto">
          <MapLegendStack />
        </div>
      </div>
    </div>
  );
}
