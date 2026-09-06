import { ClientOnly } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense, useState } from "react";
import { getPublicProjects, type PublicProjectSummary } from "@/lib/public-map.functions";
import { EmptyState, Skeleton } from "@/components/states";

const PublicParcelMap = lazy(() => import("@/components/PublicParcelMap"));

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
    notation: n >= 10000000 ? "compact" : "standard",
  }).format(n);

const ha = (n: number) => `${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ha`;

const pretty = (v: string) => v.replace(/_/g, " ");

const STAGE_ORDER = [
  "identified",
  "notified",
  "under_survey",
  "award_declared",
  "compensation_paid",
  "possession_taken",
  "disputed",
];

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5">
      <dt className="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-display text-base font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function ProjectCard({ project }: { project: PublicProjectSummary }) {
  const [showMap, setShowMap] = useState(false);
  const mappable = project.geometries.filter((p) => p.geometry !== null);
  const complete = project.completion >= 100 && project.parcels > 0;

  return (
    <article className="surface overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold text-card-foreground">
            {project.name}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {[
              project.sector ? pretty(project.sector) : null,
              project.requiring_body,
              project.district_name,
              project.state_name,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-border px-2.5 py-0.5 text-xs capitalize text-muted-foreground">
            {pretty(project.status)}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              complete
                ? "bg-[var(--status-possession)]/15 text-[var(--status-possession)]"
                : "bg-primary/10 text-primary"
            }`}
          >
            {complete ? "Acquisition complete" : "In progress"}
          </span>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Possession taken on {project.completion}% of parcels</span>
          <span>
            {project.parcels.toLocaleString("en-IN")} parcel
            {project.parcels === 1 ? "" : "s"}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-[var(--status-possession)]"
            style={{ width: `${Math.min(project.completion, 100)}%` }}
          />
        </div>

        <dl className="mt-4 grid gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          <Figure label="Land notified" value={ha(project.area_notified)} />
          <Figure label="Land taken over" value={ha(project.area_acquired)} />
          <Figure
            label="Estimated area"
            value={project.estimated_area_ha === null ? "—" : ha(project.estimated_area_ha)}
          />
          <Figure label="Affected families" value={project.families.toLocaleString("en-IN")} />
          <Figure label="Compensation declared" value={inr(project.compensation_declared)} />
          <Figure label="Compensation paid" value={inr(project.compensation_disbursed)} />
          <Figure label="Still to be paid" value={inr(project.compensation_pending)} />
          <Figure
            label="Parcels in dispute"
            value={project.disputes_open.toLocaleString("en-IN")}
          />
        </dl>

        {project.parcels > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {STAGE_ORDER.filter((s) => project.parcels_by_stage[s]).map((s) => (
              <li
                key={s}
                className="rounded-full border border-border px-2.5 py-0.5 text-xs capitalize text-muted-foreground"
              >
                {pretty(s)}: {project.parcels_by_stage[s]}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4">
          {mappable.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No parcel boundaries have been drawn for this project yet.
            </p>
          ) : showMap ? (
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="h-64 w-full sm:h-72">
                <ClientOnly
                  fallback={
                    <div className="flex h-full items-center justify-center bg-muted text-sm text-muted-foreground">
                      Loading map…
                    </div>
                  }
                >
                  <Suspense
                    fallback={
                      <div className="flex h-full items-center justify-center bg-muted text-sm text-muted-foreground">
                        Loading map…
                      </div>
                    }
                  >
                    <PublicParcelMap parcels={mappable} routes={[]} />
                  </Suspense>
                </ClientOnly>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowMap(true)}
              className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-primary hover:bg-muted"
            >
              Show this project on the map ({mappable.length})
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function PublicProjectsBoard() {
  const fetchProjects = useServerFn(getPublicProjects);
  const { data, isLoading, error } = useQuery({
    queryKey: ["public-projects"],
    queryFn: () => fetchProjects(),
  });

  const projects = data ?? [];
  const completed = projects.filter((p) => p.parcels > 0 && p.completion >= 100).length;

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="eyebrow">National dashboard</p>
      <h2 className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        Every project, and where it has reached
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        All acquisition projects on the register, with land notified and taken over, compensation
        declared, paid and still pending, and the parcels shown on a map. No login needed, and no
        landowner is ever named.
      </p>

      {!isLoading && !error && projects.length > 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          {projects.length.toLocaleString("en-IN")} project
          {projects.length === 1 ? "" : "s"} on record · {completed.toLocaleString("en-IN")} with
          possession complete
        </p>
      )}

      <div className="mt-6 space-y-5">
        {isLoading ? (
          <>
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </>
        ) : error ? (
          <EmptyState
            title="Project information is unavailable"
            description="The project register could not be loaded just now. Please try again in a moment."
          />
        ) : projects.length === 0 ? (
          <EmptyState
            title="No projects published yet"
            description="Once an acquisition project is created, its progress and parcels will be listed here."
          />
        ) : (
          projects.map((p) => <ProjectCard key={p.id} project={p} />)
        )}
      </div>
    </section>
  );
}
