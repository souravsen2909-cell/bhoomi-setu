import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useProfile } from "@/hooks/useProfile";
import { useJurisdictions } from "@/hooks/useJurisdictions";
import { landingPathForTier } from "@/lib/profile.functions";
import {
  createProject,
  CREATE_PROJECT_TIERS,
  SECTORS,
  type Sector,
} from "@/lib/projects.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/PageHeader";

const TITLE = "Create Project — Land Acquisition Register";
const DESCRIPTION =
  "Register a new land acquisition project with its sector, requiring body, state, district and estimated area.";

export const Route = createFileRoute("/_authenticated/create-project")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CreateProjectPage,
});

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground disabled:opacity-50";

function CreateProjectPage() {
  const { profile, isLoading } = useProfile();
  const navigate = useNavigate();
  const tier = profile?.tier;
  const allowed = !!tier && CREATE_PROJECT_TIERS.includes(tier);

  useEffect(() => {
    if (!tier || allowed) return;
    navigate({ to: landingPathForTier(tier), replace: true });
  }, [tier, allowed, navigate]);

  const { states, districtsOfState, isLoading: listLoading } = useJurisdictions(allowed);
  const queryClient = useQueryClient();
  const submit = useServerFn(createProject);

  const [name, setName] = useState("");
  const [sector, setSector] = useState<Sector>("highway");
  const [requiringBody, setRequiringBody] = useState("");
  const [stateId, setStateId] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [area, setArea] = useState("");

  const districts = useMemo(
    () => (stateId ? districtsOfState(stateId) : []),
    [stateId, districtsOfState],
  );

  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof createProject>[0]["data"]) => submit({ data: input }),
    onSuccess: async () => {
      toast.success("Project created");
      setName("");
      setRequiringBody("");
      setArea("");
      setDistrictId("");
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not create the project"),
  });

  if (isLoading || !allowed) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Loading your account…" : "Redirecting…"}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader eyebrow="New acquisition" title="Create project" description={DESCRIPTION} />

      <section className="mt-8 surface p-4 sm:p-6">
        <form
          className="grid gap-5 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) {
              toast.error("Enter a project name");
              return;
            }
            if (!requiringBody.trim()) {
              toast.error("Enter the requiring body");
              return;
            }
            if (!stateId) {
              toast.error("Choose a state");
              return;
            }
            mutation.mutate({
              name: name.trim(),
              sector,
              requiring_body: requiringBody.trim(),
              state_id: stateId,
              district_id: districtId || null,
              estimated_area_ha: area.trim() === "" ? null : Number(area),
            });
          }}
        >
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="p-name">Project name</Label>
            <Input
              id="p-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ranchi–Jamshedpur Expressway"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="p-sector">Sector</Label>
            <select
              id="p-sector"
              className={selectClass}
              value={sector}
              onChange={(e) => setSector(e.target.value as Sector)}
            >
              {SECTORS.map((s) => (
                <option key={s} value={s} className="capitalize">
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="p-body">Requiring body</Label>
            <Input
              id="p-body"
              value={requiringBody}
              onChange={(e) => setRequiringBody(e.target.value)}
              placeholder="e.g. National Highways Authority of India"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="p-state">State</Label>
            <select
              id="p-state"
              className={selectClass}
              value={stateId}
              disabled={listLoading}
              onChange={(e) => {
                setStateId(e.target.value);
                setDistrictId("");
              }}
            >
              <option value="">{listLoading ? "Loading…" : "Select a state…"}</option>
              {states.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="p-district">District</Label>
            <select
              id="p-district"
              className={selectClass}
              value={districtId}
              disabled={!stateId}
              onChange={(e) => setDistrictId(e.target.value)}
            >
              <option value="">{stateId ? "Select a district…" : "Choose a state first"}</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="p-area">Estimated area (hectares)</Label>
            <Input
              id="p-area"
              type="number"
              min="0"
              step="0.01"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="e.g. 120.5"
            />
          </div>

          <div className="sm:col-span-2">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Create project"}
            </Button>
          </div>
        </form>
      </section>
    </main>
  );
}
