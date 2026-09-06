import { EmptyState, ErrorState, Skeleton } from "@/components/states";
import { lazy, Suspense, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getPossessionParcels, recordPossession } from "@/lib/possession.functions";
import { MapLegend } from "@/components/MapLegend";

const PublicParcelMap = lazy(() => import("@/components/PublicParcelMap"));

function MapFallback() {
  return (
    <div className="flex h-full items-center justify-center bg-muted">
      <p className="text-sm text-muted-foreground">Loading map…</p>
    </div>
  );
}

const money = (n: number | null) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(n);

export function RecordPossession() {
  const fetchParcels = useServerFn(getPossessionParcels);
  const save = useServerFn(recordPossession);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["possession-parcels"],
    queryFn: () => fetchParcels({}),
  });
  const all = query.data ?? [];
  const parcels = all.filter((p) => !p.already_recorded);
  const takenOver = all.filter((p) => p.already_recorded);
  const mapParcels = all
    .filter((p) => p.geometry !== null)
    .map((p) => ({
      id: p.id,
      survey_number: p.survey_number,
      area_hectares: p.area_hectares,
      status: p.already_recorded ? "possession_taken" : p.status,
      geometry: p.geometry,
    }));

  const [activeId, setActiveId] = useState<string | null>(null);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [locating, setLocating] = useState(false);

  const mutation = useMutation({
    mutationFn: (vars: { parcelId: string; latitude: number; longitude: number }) =>
      save({ data: vars }),
    onSuccess: () => {
      toast.success("Possession recorded");
      setActiveId(null);
      setLat("");
      setLng("");
      queryClient.invalidateQueries({ queryKey: ["possession-parcels"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["my-alerts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("This device cannot share its location — enter the coordinates instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        toast.error(err.message || "Could not read your location — enter it manually.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  const field =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";

  return (
    <section className="mt-8 surface p-4 sm:p-6">
      <h2 className="text-lg font-medium text-card-foreground">Record possession</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Parcels where compensation has been disbursed and possession can now be taken over.
      </p>

      {mapParcels.length > 0 ? (
        <div className="mt-4">
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="h-64 w-full sm:h-80">
              <ClientOnly fallback={<MapFallback />}>
                <Suspense fallback={<MapFallback />}>
                  <PublicParcelMap parcels={mapParcels} routes={[]} />
                </Suspense>
              </ClientOnly>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Green parcels are already taken over. Tap a parcel to check its survey number before you
            confirm takeover.
          </p>
          <div className="mt-3">
            <MapLegend />
          </div>
        </div>
      ) : null}

      {query.isLoading ? (
        <div className="mt-4 space-y-2" role="status" aria-live="polite">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : query.error ? (
        <div className="mt-4">
          <ErrorState message={(query.error as Error).message} />
        </div>
      ) : parcels.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Nothing ready for possession yet"
            description="Parcels appear here once their compensation has been fully disbursed."
          />
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {parcels.map((p) => (
            <li key={p.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-card-foreground">{p.survey_number}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {p.project_name}
                    {p.area_hectares != null ? ` · ${p.area_hectares} ha` : ""} · Disbursed{" "}
                    {money(p.disbursed_amount)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveId(activeId === p.id ? null : p.id)}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  Record Possession
                </button>
              </div>

              {activeId === p.id && (
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutation.mutate({
                      parcelId: p.id,
                      latitude: Number(lat),
                      longitude: Number(lng),
                    });
                  }}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        className="block text-sm font-medium text-foreground"
                        htmlFor={`lat-${p.id}`}
                      >
                        Latitude
                      </label>
                      <input
                        id={`lat-${p.id}`}
                        required
                        type="number"
                        step="any"
                        className={`${field} mt-1`}
                        value={lat}
                        onChange={(e) => setLat(e.target.value)}
                        placeholder="22.8046"
                      />
                    </div>
                    <div>
                      <label
                        className="block text-sm font-medium text-foreground"
                        htmlFor={`lng-${p.id}`}
                      >
                        Longitude
                      </label>
                      <input
                        id={`lng-${p.id}`}
                        required
                        type="number"
                        step="any"
                        className={`${field} mt-1`}
                        value={lng}
                        onChange={(e) => setLng(e.target.value)}
                        placeholder="86.2029"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={useMyLocation}
                      disabled={locating}
                      className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground disabled:opacity-50"
                    >
                      {locating ? "Reading location…" : "Use my current location"}
                    </button>
                    <button
                      type="submit"
                      disabled={mutation.isPending}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    >
                      {mutation.isPending ? "Saving…" : "Confirm takeover"}
                    </button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {takenOver.length > 0 ? (
        <div className="mt-6 border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-card-foreground">Already taken over</h3>
          <ul className="mt-2 space-y-1.5">
            {takenOver.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground"
              >
                <span className="font-medium text-card-foreground">{p.survey_number}</span>
                <span>
                  {p.project_name}
                  {p.area_hectares != null ? ` · ${p.area_hectares} ha` : ""}
                </span>
                <span className="rounded-full bg-[var(--status-possession)]/15 px-2 py-0.5 font-semibold text-[var(--status-possession)]">
                  Possession taken
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export default RecordPossession;
