import { lazy, Suspense, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createDrawnParcel, getParcelDrawOptions } from "@/lib/parcels.functions";

const ParcelDrawMap = lazy(() => import("@/components/ParcelDrawMap"));

const NEW_OWNER = "__new__";

export default function DrawNewParcel({ lockedProjectId }: { lockedProjectId?: string } = {}) {
  const fetchOptions = useServerFn(getParcelDrawOptions);
  const saveParcel = useServerFn(createDrawnParcel);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["parcel-draw-options"],
    queryFn: () => fetchOptions(),
  });

  const [ring, setRing] = useState<[number, number][] | null>(null);
  const [projectId, setProjectId] = useState(lockedProjectId ?? "");
  const [surveyNumber, setSurveyNumber] = useState("");
  const [area, setArea] = useState("");
  const [landowner, setLandowner] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const reset = () => {
    setRing(null);
    setProjectId(lockedProjectId ?? "");
    setSurveyNumber("");
    setArea("");
    setLandowner("");
    setOwnerName("");
    setOwnerPhone("");
  };

  const save = useMutation({
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
      setSaved(true);
      reset();
      queryClient.invalidateQueries({ queryKey: ["parcel-draw-options"] });
      queryClient.invalidateQueries({ queryKey: ["public-map"] });
      queryClient.invalidateQueries({ queryKey: ["agency-projects"] });
      if (lockedProjectId)
        queryClient.invalidateQueries({ queryKey: ["agency-project", lockedProjectId] });
    },
    onError: (e: Error) => {
      setSaved(false);
      setFormError(e.message);
    },
  });

  const projects = data?.projects ?? [];
  const landowners = data?.landowners ?? [];

  return (
    <section className="mt-8 surface p-4 sm:p-6">
      <h2 className="text-lg font-medium text-card-foreground">Draw New Parcel</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Use the polygon tool on the map to trace a parcel boundary, then record its details.
      </p>

      {error && (
        <p className="mt-4 text-sm text-destructive">
          Could not load projects and landowners: {(error as Error).message}
        </p>
      )}

      <div className="mt-5 overflow-hidden rounded-xl border border-border">
        <ClientOnly
          fallback={
            <div className="flex h-[320px] sm:h-[420px] items-center justify-center text-sm text-muted-foreground">
              Loading map…
            </div>
          }
        >
          <Suspense
            fallback={
              <div className="flex h-[320px] sm:h-[420px] items-center justify-center text-sm text-muted-foreground">
                Loading map…
              </div>
            }
          >
            <ParcelDrawMap
              parcels={data?.parcels ?? []}
              onPolygonDrawn={(drawn) => {
                setRing(drawn);
                setSaved(false);
                setFormError(null);
              }}
            />
          </Suspense>
        </ClientOnly>
      </div>

      {saved && (
        <p className="mt-4 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Parcel saved and added to the map.
        </p>
      )}

      {ring && (
        <form
          className="mt-6 grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {!lockedProjectId && (
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-foreground" htmlFor="p-project">
                Project
              </label>
              <select
                id="p-project"
                required
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="">{isLoading ? "Loading projects…" : "Select a project"}</option>
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
              Survey number
            </label>
            <input
              id="p-survey"
              required
              value={surveyNumber}
              onChange={(e) => setSurveyNumber(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground" htmlFor="p-area">
              Area (hectares)
            </label>
            <input
              id="p-area"
              type="number"
              step="0.0001"
              min="0"
              required
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-foreground" htmlFor="p-owner">
              Landowner
            </label>
            <select
              id="p-owner"
              required
              value={landowner}
              onChange={(e) => setLandowner(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="">Select a landowner</option>
              {landowners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.full_name}
                  {o.contact_phone ? ` — ${o.contact_phone}` : ""}
                </option>
              ))}
              <option value={NEW_OWNER}>Add New Landowner</option>
            </select>
          </div>

          {landowner === NEW_OWNER && (
            <>
              <div>
                <label className="block text-sm font-medium text-foreground" htmlFor="p-oname">
                  Full name
                </label>
                <input
                  id="p-oname"
                  required
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground" htmlFor="p-ophone">
                  Contact phone
                </label>
                <input
                  id="p-ophone"
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
            </>
          )}

          {formError && <p className="sm:col-span-2 text-sm text-destructive">{formError}</p>}

          <div className="sm:col-span-2 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={save.isPending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {save.isPending ? "Saving…" : "Save parcel"}
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground"
            >
              Discard drawing
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
