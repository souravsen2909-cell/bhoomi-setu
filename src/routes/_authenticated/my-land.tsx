import { EmptyState, ErrorState, LoadingCards } from "@/components/states";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useProfile } from "@/hooks/useProfile";
import { landingPathForTier } from "@/lib/profile.functions";
import { getMyLand, type MyParcel } from "@/lib/my-land.functions";
import { DocumentUploader } from "@/components/DocumentUploader";
import { PageHeader } from "@/components/PageHeader";

const inr = (value: number | null) =>
  value === null || value === undefined
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(value);

const label = (value: string | null) => (value ? value.replace(/_/g, " ") : "Not recorded");

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium capitalize text-muted-foreground">
      {children}
    </span>
  );
}

function StatusStrip({ parcel }: { parcel: MyParcel }) {
  const comps = parcel.awards.flatMap((a) => a.compensation);
  const declared = parcel.awards.reduce((sum, a) => sum + (a.declared_amount ?? 0), 0);
  const paid = comps.reduce((sum, c) => sum + (c.disbursed_amount ?? 0), 0);
  const assessed = comps.reduce((sum, c) => sum + (c.assessed_amount ?? 0), 0);
  const pending = Math.max((assessed || declared) - paid, 0);
  const acquired = parcel.status === "possession_taken";
  const disputed = parcel.status === "disputed";

  const items = [
    {
      label: "Land taken over",
      value: disputed ? "Issue raised — on hold" : acquired ? "Yes, possession taken" : "Not yet",
    },
    { label: "Amount declared", value: inr(declared || null) },
    { label: "Money received", value: inr(paid) },
    { label: "Still to be paid", value: pending === 0 ? "Nothing pending" : inr(pending) },
  ];

  return (
    <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-border bg-muted/40 p-3">
          <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
            {item.label}
          </dt>
          <dd className="mt-1 text-sm font-semibold text-card-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function GroundStatus({ parcel }: { parcel: MyParcel }) {
  const possessionTaken =
    parcel.status === "possession_taken" || parcel.possession?.status === "taken_over";
  const disputes = parcel.disputes ?? [];
  const openDisputes = disputes.filter((d) => d.status !== "resolved" && d.status !== "closed");
  const disputed = parcel.status === "disputed" || openDisputes.length > 0;

  return (
    <section className="mt-6">
      <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        Possession and issues
      </h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Possession</p>
          <p className="mt-1 text-sm font-semibold text-card-foreground">
            {possessionTaken ? "Taken over by the authority" : "Not taken over yet"}
          </p>
          {parcel.possession?.taken_over_date ? (
            <p className="mt-1 text-xs text-muted-foreground">
              On {parcel.possession.taken_over_date}
            </p>
          ) : null}
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Issue raised</p>
          <p className="mt-1 text-sm font-semibold text-card-foreground">
            {disputed ? `Yes — ${openDisputes.length || 1} open` : "No issue on record"}
          </p>
        </div>
      </div>
      {disputes.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {disputes.map((d) => (
            <li key={d.id} className="rounded-lg border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium capitalize text-card-foreground">
                  {label(d.dispute_type)}
                </span>
                <Badge>{label(d.status)}</Badge>
              </div>
              {d.filed_at ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Raised on {new Date(d.filed_at).toLocaleDateString("en-IN")}
                </p>
              ) : null}
              {d.description ? (
                <p className="mt-1 text-sm text-muted-foreground">{d.description}</p>
              ) : null}
              {d.resolution_notes ? (
                <p className="mt-1 text-sm text-muted-foreground">Outcome: {d.resolution_notes}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ParcelCard({ parcel }: { parcel: MyParcel }) {
  return (
    <article className="surface p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">
            {parcel.project_name ?? "Project not recorded"}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-card-foreground">
            Survey no. {parcel.survey_number}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {parcel.village ? `${parcel.village} · ` : ""}
            {parcel.area_hectares ?? "—"} hectares
            {parcel.ownership_share !== null ? ` · your share ${parcel.ownership_share}%` : ""}
          </p>
        </div>
        <Badge>{label(parcel.status)}</Badge>
      </div>

      <StatusStrip parcel={parcel} />

      <section className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          Award and compensation
        </h3>
        {parcel.awards.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No award declared yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {parcel.awards.map((award) => (
              <li key={award.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-card-foreground">
                    Award {award.award_number ?? "—"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Declared {inr(award.declared_amount)}
                    {award.declared_date ? ` on ${award.declared_date}` : ""}
                  </p>
                </div>
                {award.compensation.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No compensation record for you against this award.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {award.compensation.map((c) => (
                      <li
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                      >
                        <span className="text-muted-foreground">
                          Assessed {inr(c.assessed_amount)} · Paid {inr(c.disbursed_amount)}
                          {c.disbursed_date ? ` on ${c.disbursed_date}` : ""}
                        </span>
                        <Badge>{label(c.disbursement_status)}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <GroundStatus parcel={parcel} />

      <section className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          Resettlement benefits
        </h3>
        {parcel.benefits.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No benefits recorded.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {parcel.benefits.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm"
              >
                <span className="capitalize text-card-foreground">{label(b.benefit_type)}</span>
                <span className="text-muted-foreground">
                  {inr(b.amount)}
                  {b.disbursed_date ? ` · ${b.disbursed_date}` : ""}
                </span>
                <Badge>{label(b.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DocumentUploader
        entityType="parcel"
        entityId={parcel.id}
        title="Documents for this parcel"
        canUpload={false}
      />
    </article>
  );
}

function MyLandPage() {
  const { profile, isLoading: profileLoading } = useProfile();
  const navigate = useNavigate();
  const tier = profile?.tier;

  useEffect(() => {
    if (!tier) return;
    if (tier !== "landowner") {
      navigate({ to: landingPathForTier(tier), replace: true });
    }
  }, [tier, navigate]);

  const fetchMyLand = useServerFn(getMyLand);
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-land"],
    queryFn: () => fetchMyLand(),
    enabled: tier === "landowner",
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        eyebrow="Landowner record"
        title="My land"
        description="Your parcels with their award amounts, compensation status and resettlement benefits. This page is read-only."
      />

      {profileLoading || (tier === "landowner" && isLoading) ? (
        <div className="mt-8">
          <LoadingCards count={2} label="Loading your records…" />
        </div>
      ) : tier && tier !== "landowner" ? (
        <p className="mt-8 text-sm text-muted-foreground">Taking you to your own area…</p>
      ) : error ? (
        <div className="mt-8">
          <ErrorState message="Your records could not be loaded right now." />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No land recorded against your name yet"
            description="When an officer links a parcel to you, it will appear here along with award, compensation and resettlement details."
          />
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {data.map((parcel) => (
            <ParcelCard key={parcel.id} parcel={parcel} />
          ))}
        </div>
      )}
    </main>
  );
}

export const Route = createFileRoute("/_authenticated/my-land")({
  head: () => ({
    meta: [
      { title: "My Land — Land Acquisition Register" },
      {
        name: "description",
        content:
          "Landowner view of your parcels, award amounts, compensation status and resettlement benefits.",
      },
      { property: "og:title", content: "My Land — Land Acquisition Register" },
      {
        property: "og:description",
        content:
          "Landowner view of your parcels, award amounts, compensation status and resettlement benefits.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MyLandPage,
});
