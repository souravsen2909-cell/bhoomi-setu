import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useProfile } from "@/hooks/useProfile";
import { useJurisdictions } from "@/hooks/useJurisdictions";
import { landingPathForTier } from "@/lib/profile.functions";
import { createJurisdiction, MANAGE_TIERS } from "@/lib/jurisdictions.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/PageHeader";

const TITLE = "Manage Jurisdictions — Land Acquisition Register";
const DESCRIPTION =
  "Maintain the register of states and districts used across acquisition projects and officer accounts.";

export const Route = createFileRoute("/_authenticated/jurisdictions")({
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
  component: JurisdictionsPage,
});

function JurisdictionsPage() {
  const { profile, isLoading } = useProfile();
  const navigate = useNavigate();
  const tier = profile?.tier;
  const allowed = !!tier && MANAGE_TIERS.includes(tier);

  useEffect(() => {
    navigate({ to: "/projects", replace: true });
  }, [navigate]);

  const { all, states, isLoading: listLoading } = useJurisdictions(allowed);
  const queryClient = useQueryClient();
  const submit = useServerFn(createJurisdiction);

  const [name, setName] = useState("");
  const [level, setLevel] = useState<"state" | "district">("district");
  const [parentId, setParentId] = useState("");

  const mutation = useMutation({
    mutationFn: (input: { name: string; level: "state" | "district"; parent_id: string | null }) =>
      submit({ data: input }),
    onSuccess: async () => {
      toast.success("Jurisdiction added");
      setName("");
      setParentId("");
      await queryClient.invalidateQueries({ queryKey: ["jurisdictions"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not save jurisdiction"),
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
      <PageHeader eyebrow="Administration" title="Manage jurisdictions" description={DESCRIPTION} />

      <section className="mt-8 surface overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Level</th>
              <th className="px-4 py-3 font-medium">Parent jurisdiction</th>
            </tr>
          </thead>
          <tbody>
            {listLoading ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-muted-foreground">
                  Loading jurisdictions…
                </td>
              </tr>
            ) : all.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-muted-foreground">
                  No states or districts yet — add the first one using the form below.
                </td>
              </tr>
            ) : (
              all.map((j) => (
                <tr key={j.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-card-foreground">{j.name}</td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">{j.level}</td>
                  <td className="px-4 py-3 text-muted-foreground">{j.parent_name ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="mt-8 surface p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-card-foreground">Add a jurisdiction</h2>
        <form
          className="mt-5 grid gap-4 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) {
              toast.error("Enter a name");
              return;
            }
            if (level === "district" && !parentId) {
              toast.error("Choose the parent state");
              return;
            }
            mutation.mutate({
              name: name.trim(),
              level,
              parent_id: level === "district" ? parentId : null,
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="j-name">Name</Label>
            <Input
              id="j-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Palamu"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="j-level">Level</Label>
            <select
              id="j-level"
              value={level}
              onChange={(e) => {
                const next = e.target.value as "state" | "district";
                setLevel(next);
                if (next === "state") setParentId("");
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="state">State</option>
              <option value="district">District</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="j-parent">
              Parent state {level === "district" ? "" : "(not required)"}
            </Label>
            <select
              id="j-parent"
              value={parentId}
              disabled={level !== "district"}
              onChange={(e) => setParentId(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground disabled:opacity-50"
            >
              <option value="">Select a state…</option>
              {states.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Add jurisdiction"}
            </Button>
          </div>
        </form>
      </section>
    </main>
  );
}
