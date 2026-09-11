import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useProfile } from "@/hooks/useProfile";
import { landingPathForTier } from "@/lib/profile.functions";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, LoadingCards } from "@/components/states";
import {
  PROJECT_EDIT_TIERS,
  PROJECT_BOARD_TIERS,
  getAgencyProjects,
  type AgencyProjectCard,
} from "@/lib/agency.functions";

const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);

const area = (n: number) =>
  `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n)} ha`;

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({
    meta: [
      { title: "My Projects — Land Acquisition Register" },
      {
        name: "description",
        content:
          "Agency board of acquisition projects: stage of approval, parcels mapped, land taken over and compensation paid or pending.",
      },
      { property: "og:title", content: "My Projects — Land Acquisition Register" },
      {
        property: "og:description",
        content:
          "Every project you have raised, with its approval stage, parcels, affected families and compensation status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AgencyProjectsPage,
});

function AgencyProjectsPage() {
  const { profile, isLoading: profileLoading } = useProfile();
  const navigate = useNavigate();
  const tier = profile?.tier;

  useEffect(() => {
    if (!tier) return;
    if (!PROJECT_BOARD_TIERS.includes(tier))
      navigate({ to: landingPathForTier(tier), replace: true });
  }, [tier, navigate]);

  const allowed = !!tier && PROJECT_BOARD_TIERS.includes(tier);
  const isDistrict = tier === "district_authority";
  const isState = tier === "state_government";
  const isAgency = !!tier && PROJECT_EDIT_TIERS.includes(tier);
  const isCentral = tier === "central_ministry";

  const fetchProjects = useServerFn(getAgencyProjects);
  const query = useQuery({
    queryKey: ["agency-projects"],
    queryFn: () => fetchProjects({}),
    enabled: allowed,
  });

  const [selectedState, setSelectedState] = useState<string>("all");

  const rawProjects = query.data ?? [];
  const stateOptions = Array.from(
    new Set(rawProjects.map((p) => p.state_name).filter(Boolean)),
  ) as string[];

  const projects =
    selectedState === "all"
      ? rawProjects
      : rawProjects.filter((p) => p.state_name === selectedState);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        eyebrow={
          isDistrict
            ? "District workspace"
            : isState
              ? "State workspace"
              : isCentral
                ? "Central ministry"
                : "Agency workspace"
        }
        title={
          isDistrict
            ? "Acquisition projects"
            : isState || isCentral
              ? "Projects in India"
              : "My projects"
        }
        description={
          isDistrict
            ? "Approved projects for parcel mapping, survey numbers, awards, and compensation execution."
            : isState
              ? "Record of acquisition projects across India and in your state — plots, land taken over, issues raised and money paid."
              : isCentral
                ? "View-only record of every project in the country. Open one to see its plots, issues raised and money paid, and to attach official documents."
                : "Every project you have raised. Open one to add parcels, declare amounts, set landowner logins and mark payments."
        }
        actions={
          !isAgency ? undefined : (
            <Link
              to="/create-project"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Add project
            </Link>
          )
        }
      />

      {(isState || isCentral || isDistrict) && stateOptions.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Filter by State:</span>
          <button
            type="button"
            onClick={() => setSelectedState("all")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selectedState === "all"
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-muted/40 text-foreground hover:bg-muted"
            }`}
          >
            All States ({rawProjects.length})
          </button>
          {stateOptions.map((st) => {
            const count = rawProjects.filter((p) => p.state_name === st).length;
            return (
              <button
                key={st}
                type="button"
                onClick={() => setSelectedState(st)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  selectedState === st
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-muted/40 text-foreground hover:bg-muted"
                }`}
              >
                {st} ({count})
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {profileLoading || (allowed && query.isLoading) ? (
          <LoadingCards count={2} label="Loading projects…" />
        ) : query.error ? (
          <ErrorState message={(query.error as Error).message} />
        ) : projects.length === 0 ? (
          <EmptyState
            title="No projects yet"
            description={
              isDistrict
                ? "Projects appear here once the central ministry approves them for your district."
                : isState || isCentral
                  ? "Projects appear here once an implementing agency raises them."
                  : "Use “Add project” to raise your first acquisition project. It then goes to the state for verification and to the central ministry for approval."
            }
          />
        ) : (
          projects.map((p) => <ProjectCard key={p.id} project={p} />)
        )}
      </div>
    </main>
  );
}

function stageBadgeStyle(stage: string): string {
  const lower = stage.toLowerCase();
  if (lower.includes("approved")) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (lower.includes("central ministry") || lower.includes("scrutiny")) {
    return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  }
  if (lower.includes("verification") || lower.includes("state")) {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  if (lower.includes("return") || lower.includes("reject")) {
    return "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300";
  }
  return "border-border text-muted-foreground";
}

function ProjectCard({ project }: { project: AgencyProjectCard }) {
  const progress =
    project.area_notified > 0
      ? Math.min(100, Math.round((project.area_taken / project.area_notified) * 100))
      : 0;

  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      className="surface block p-4 transition-colors hover:border-primary/50 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-medium text-card-foreground">{project.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {[project.sector, project.district_name, project.state_name]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${stageBadgeStyle(
            project.stage,
          )}`}
        >
          {project.stage}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Stat label="Parcels mapped" value={String(project.parcels)} />
        <Stat label="Families affected" value={String(project.families)} />
        <Stat label="Land notified" value={area(project.area_notified)} />
        <Stat label="Land taken over" value={area(project.area_taken)} />
        <Stat label="Compensation paid" value={money(project.paid)} />
        <Stat label="Still pending" value={money(project.pending)} />
      </dl>

      <div className="mt-4">
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {progress}% of notified land taken over
          {project.disputes > 0
            ? ` · ${project.disputes} open dispute${project.disputes === 1 ? "" : "s"}`
            : ""}
        </p>
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium text-card-foreground">{value}</dd>
    </div>
  );
}
