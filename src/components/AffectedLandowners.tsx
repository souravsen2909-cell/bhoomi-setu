import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SectionCard } from "@/components/PageHeader";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import {
  addAffectedFamily,
  DISPLACEMENT_STATUSES,
  FAMILY_CATEGORIES,
  getAffectedParcels,
  type AffectedParcel,
} from "@/lib/affected.functions";

const NEW_OWNER = "__new__";

const inputClass =
  "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";

const label = (value: string) => value.replace(/_/g, " ");

export function AffectedLandowners() {
  const fetchParcels = useServerFn(getAffectedParcels);
  const submit = useServerFn(addAffectedFamily);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["affected-parcels"],
    queryFn: () => fetchParcels({}),
  });

  const [parcelId, setParcelId] = useState("");
  const [landowner, setLandowner] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [bankRef, setBankRef] = useState("");
  const [members, setMembers] = useState("1");
  const [displacement, setDisplacement] =
    useState<(typeof DISPLACEMENT_STATUSES)[number]>("not_displaced");
  const [category, setCategory] = useState<(typeof FAMILY_CATEGORIES)[number]>("landowner");

  const parcels = query.data?.parcels ?? [];
  const landowners = query.data?.landowners ?? [];
  const selected = useMemo<AffectedParcel | undefined>(
    () => parcels.find((p) => p.id === parcelId),
    [parcels, parcelId],
  );

  const save = useMutation({
    mutationFn: () =>
      submit({
        data: {
          parcelId,
          landownerId: landowner && landowner !== NEW_OWNER ? landowner : null,
          newLandowner:
            landowner === NEW_OWNER
              ? { fullName: ownerName, contactPhone: ownerPhone, bankAccountRef: bankRef }
              : null,
          membersCount: Number(members),
          displacementStatus: displacement,
          category,
        },
      }),
    onSuccess: () => {
      toast.success("Affected family recorded");
      setOwnerName("");
      setOwnerPhone("");
      setBankRef("");
      setMembers("1");
      setLandowner("");
      queryClient.invalidateQueries({ queryKey: ["affected-parcels"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not save the details"),
  });

  return (
    <SectionCard
      title="Affected landowners & families"
      description="For parcels the district has mapped, record who is affected by the acquisition and how."
    >
      {query.isLoading ? (
        <LoadingRows rows={3} />
      ) : query.error ? (
        <ErrorState message={(query.error as Error).message} />
      ) : parcels.length === 0 ? (
        <EmptyState
          title="No mapped parcels yet"
          description="Once the ministry approves your project and the district authority draws its parcels, they appear here for landowner entry."
        />
      ) : (
        <>
          <div className="surface overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Survey no.</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Area (ha)</th>
                  <th className="px-4 py-3">Landowners</th>
                  <th className="px-4 py-3">Families</th>
                </tr>
              </thead>
              <tbody>
                {parcels.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium text-card-foreground">
                      {p.survey_number}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.project_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.area_hectares ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.owners.length > 0 ? p.owners.join(", ") : "Not recorded"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.families}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form
            className="mt-6 grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-foreground" htmlFor="af-parcel">
                Parcel
              </label>
              <select
                id="af-parcel"
                required
                value={parcelId}
                onChange={(e) => setParcelId(e.target.value)}
                className={inputClass}
              >
                <option value="">Select a parcel</option>
                {parcels.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.survey_number} — {p.project_name}
                  </option>
                ))}
              </select>
              {selected && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {selected.area_hectares ?? "—"} ha · status{" "}
                  {label(selected.status ?? "identified")}
                </p>
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-foreground" htmlFor="af-owner">
                Landowner
              </label>
              <select
                id="af-owner"
                required
                value={landowner}
                onChange={(e) => setLandowner(e.target.value)}
                className={inputClass}
              >
                <option value="">Select a landowner</option>
                {landowners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.full_name}
                    {o.contact_phone ? ` — ${o.contact_phone}` : ""}
                  </option>
                ))}
                <option value={NEW_OWNER}>Add new landowner</option>
              </select>
            </div>

            {landowner === NEW_OWNER && (
              <>
                <div>
                  <label className="block text-sm font-medium text-foreground" htmlFor="af-name">
                    Full name
                  </label>
                  <input
                    id="af-name"
                    required
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground" htmlFor="af-phone">
                    Contact phone
                  </label>
                  <input
                    id="af-phone"
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-foreground" htmlFor="af-bank">
                    Bank account reference
                  </label>
                  <input
                    id="af-bank"
                    value={bankRef}
                    onChange={(e) => setBankRef(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground" htmlFor="af-members">
                Family members affected
              </label>
              <input
                id="af-members"
                type="number"
                min="1"
                required
                value={members}
                onChange={(e) => setMembers(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground" htmlFor="af-cat">
                Category
              </label>
              <select
                id="af-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof category)}
                className={inputClass}
              >
                {FAMILY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {label(c)}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-foreground" htmlFor="af-disp">
                Displacement
              </label>
              <select
                id="af-disp"
                value={displacement}
                onChange={(e) => setDisplacement(e.target.value as typeof displacement)}
                className={inputClass}
              >
                {DISPLACEMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={save.isPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {save.isPending ? "Saving…" : "Record affected family"}
              </button>
            </div>
          </form>
        </>
      )}
    </SectionCard>
  );
}
