import { useEffect, useState } from "react";
import { EmptyState, Skeleton } from "@/components/states";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { DELETE_PROJECT_TIERS, deleteProject } from "@/lib/projects.functions";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useProfile } from "@/hooks/useProfile";
import { landingPathForTier } from "@/lib/profile.functions";
import { DASHBOARD_TIERS, getDashboardData } from "@/lib/dashboard.functions";
import { PageHeader } from "@/components/PageHeader";

const TITLE = "Ministry Dashboard — Land Acquisition Register";
const DESCRIPTION =
  "Programme-level overview of acquisition projects, notified and acquired area, compensation disbursed and affected families.";

export const Route = createFileRoute("/_authenticated/dashboard")({
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
  component: DashboardPage,
});

const area = (v: number) => `${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ha`;

const money = (v: number) =>
  v.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-card-foreground">{value}</p>
    </div>
  );
}

function DashboardPage() {
  const { profile, isLoading } = useProfile();
  const navigate = useNavigate();
  const tier = profile?.tier;
  const allowed = !!tier && DASHBOARD_TIERS.includes(tier);

  useEffect(() => {
    if (!tier || allowed) return;
    navigate({ to: landingPathForTier(tier), replace: true });
  }, [tier, allowed, navigate]);

  const fetchDashboard = useServerFn(getDashboardData);
  const { data, isLoading: dataLoading } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => fetchDashboard({}),
    enabled: allowed,
  });

  const canDelete = !!tier && DELETE_PROJECT_TIERS.includes(tier);
  const queryClient = useQueryClient();
  const removeProject = useServerFn(deleteProject);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => removeProject({ data: { id } }),
    onSuccess: async () => {
      toast.success("Project removed permanently.");
      setPendingId(null);
      await queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not remove the project."),
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

  const totals = data?.totals;
  const byState = data?.byState ?? [];
  const projects = data?.projects ?? [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader eyebrow="Programme overview" title="Dashboard" description={DESCRIPTION} />

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Total area notified"
          value={totals ? area(totals.area_notified) : "—"}
        />
        <SummaryCard
          label="Total area acquired"
          value={totals ? area(totals.area_acquired) : "—"}
        />
        <SummaryCard
          label="Compensation disbursed"
          value={totals ? money(totals.compensation_disbursed) : "—"}
        />
        <SummaryCard
          label="Affected families"
          value={totals ? totals.affected_families.toLocaleString("en-IN") : "—"}
        />
      </section>

      <section className="mt-8 surface p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-card-foreground">Project progress by state</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Parcels at each stage of acquisition, grouped by state.
        </p>
        <div className="mt-6 h-64 w-full sm:h-80">
          {dataLoading ? (
            <Skeleton className="h-full w-full" />
          ) : byState.length === 0 ? (
            <EmptyState
              title="No parcels recorded yet"
              description="Once parcels are added to projects, their progress by state will appear as a chart here."
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byState}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="state" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.5rem",
                    color: "var(--card-foreground)",
                  }}
                />
                <Legend />
                <Bar dataKey="identified" name="Identified" fill="var(--status-identified)" />
                <Bar dataKey="notified" name="Notified" fill="var(--status-notified)" />
                <Bar dataKey="award_declared" name="Award declared" fill="var(--status-award)" />
                <Bar
                  dataKey="possession_taken"
                  name="Possession taken"
                  fill="var(--status-possession)"
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="mt-8 surface overflow-hidden">
        <div className="border-b border-border px-4 py-4 sm:px-6">
          <h2 className="text-lg font-semibold text-card-foreground">All projects</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Requiring body</th>
                <th className="px-4 py-3 font-medium">State</th>
                <th className="px-4 py-3 font-medium">District</th>
                <th className="px-4 py-3 font-medium">Estimated area</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {canDelete && <th className="px-4 py-3 text-right font-medium">Action</th>}
              </tr>
            </thead>
            <tbody>
              {dataLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-muted-foreground">
                    Loading projects…
                  </td>
                </tr>
              ) : projects.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-muted-foreground">
                    No projects have been created yet. Create a project to see it listed here.
                  </td>
                </tr>
              ) : (
                projects.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-card-foreground">{p.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.requiring_body}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.state_name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.district_name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.estimated_area_ha === null ? "—" : area(p.estimated_area_ha)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs capitalize text-muted-foreground">
                        {p.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    {canDelete && (
                      <td className="px-4 py-3 text-right">
                        {pendingId === p.id ? (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <span className="text-xs text-muted-foreground">Delete for good?</span>
                            <button
                              type="button"
                              disabled={remove.isPending}
                              onClick={() => remove.mutate(p.id)}
                              className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground disabled:opacity-60"
                            >
                              {remove.isPending ? "Removing…" : "Yes, remove"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingId(null)}
                              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setPendingId(p.id)}
                            className="rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                          >
                            Remove permanently
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
