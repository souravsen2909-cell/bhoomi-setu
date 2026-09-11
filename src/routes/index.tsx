import { createFileRoute, ClientOnly, Link } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getPublicMapData, getPublicOverview } from "@/lib/public-map.functions";
import { PublicTopBar } from "@/components/AppShell";
import { PublicProjectsBoard } from "@/components/PublicProjectsBoard";
import { MapLegend } from "@/components/MapLegend";

const PublicParcelMap = lazy(() => import("@/components/PublicParcelMap"));

function MapFallback({ label }: { label: string }) {
  return (
    <div className="flex h-[26rem] items-center justify-center rounded-xl border border-border bg-muted/40 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

const STAGES = [
  {
    step: "01",
    title: "Identified",
    copy: "Officers survey and draw each parcel boundary with its survey number and area.",
  },
  {
    step: "02",
    title: "Notified & awarded",
    copy: "Notification is issued and compensation is calculated with solatium, then declared.",
  },
  {
    step: "03",
    title: "Paid & taken over",
    copy: "Once compensation is disbursed, possession is recorded with a field geotag.",
  },
];

const PROMISES = [
  {
    title: "Open by default",
    copy: "Parcel stage, survey number and area are public. Landowner names never are.",
  },
  {
    title: "One chain of record",
    copy: "Proposals, awards, payments, disputes and possession all sit against the same parcel.",
  },
  {
    title: "Every change is notified",
    copy: "When a stage moves, the officer or landowner concerned is alerted automatically.",
  },
];

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
    notation: n >= 10000000 ? "compact" : "standard",
  }).format(n);

const ha = (n: number) => `${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ha`;

function ProjectOverview() {
  const fetchOverview = useServerFn(getPublicOverview);
  const { data, isLoading, error } = useQuery({
    queryKey: ["public-overview"],
    queryFn: () => fetchOverview(),
  });

  const cards = [
    { label: "Public projects on record", value: (data?.projects ?? 0).toLocaleString("en-IN") },
    { label: "Land notified", value: ha(data?.area_notified ?? 0) },
    { label: "Land taken over", value: ha(data?.area_acquired ?? 0) },
    { label: "Compensation declared", value: inr(data?.compensation_declared ?? 0) },
    { label: "Compensation paid", value: inr(data?.compensation_disbursed ?? 0) },
    { label: "Still to be paid", value: inr(data?.compensation_pending ?? 0) },
    {
      label: "Parcels under dispute",
      value: (data?.parcels_disputed ?? 0).toLocaleString("en-IN"),
    },
  ];

  return (
    <section className="border-y border-border bg-muted/40">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="eyebrow">Project overview</p>
        <h2 className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          How much land, and how much money
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Totals across every project in the register — area notified, area taken over, compensation
          declared, paid and still pending. Figures only; no landowner is ever named.
        </p>

        <dl className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <div key={c.label} className="surface px-4 py-4">
              <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {c.label}
              </dt>
              <dd className="mt-1.5 font-display text-xl font-semibold text-card-foreground sm:text-2xl">
                {isLoading ? "…" : error ? "—" : c.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function HomePage() {
  const fetchMapData = useServerFn(getPublicMapData);
  const { data, isLoading, error } = useQuery({
    queryKey: ["public-map"],
    queryFn: () => fetchMapData(),
  });

  const parcels = data?.parcels ?? [];
  const mappable = parcels.filter((p) => p.geometry !== null).length;
  const totalArea = parcels.reduce((sum, p) => sum + (p.area_hectares ?? 0), 0);

  const stats = [
    { label: "Parcels published", value: parcels.length.toLocaleString("en-IN") },
    { label: "Boundaries mapped", value: mappable.toLocaleString("en-IN") },
    {
      label: "Area on record",
      value: `${totalArea.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ha`,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <PublicTopBar />

      {/* Hero */}
      <section className="relative overflow-hidden brand-gradient text-primary-foreground">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-32 size-[26rem] rounded-full bg-gold/15 blur-3xl"
        />
        <div className="relative mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-primary-foreground/70">
            Public land acquisition register
          </p>
          <h1 className="mt-3 max-w-3xl font-display text-3xl font-semibold leading-tight sm:text-5xl">
            Every acquired parcel, on the map and on the record.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-primary-foreground/80 sm:text-base">
            Track land taken for highways and other public projects — parcel by parcel, from survey
            to possession. Open to anyone, with landowner identities kept private.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/auth"
              className="inline-flex items-center rounded-lg bg-gold px-5 py-3 text-sm font-semibold text-gold-foreground shadow-card transition-transform hover:-translate-y-0.5"
            >
              Sign in to open the map
            </Link>
            <Link
              to="/auth"
              className="inline-flex items-center rounded-lg border border-primary-foreground/30 px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-foreground/10"
            >
              Officer & landowner login
            </Link>
          </div>

          <dl className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-primary-foreground/15 bg-primary-foreground/10 px-4 py-3 backdrop-blur"
              >
                <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-primary-foreground/65">
                  {s.label}
                </dt>
                <dd className="mt-1 font-display text-xl font-semibold sm:text-2xl">
                  {isLoading ? "…" : error ? "—" : s.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Project overview */}
      <ProjectOverview />

      {/* National map — every project on record */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="eyebrow">National map of India</p>
        <h2 className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          National Infrastructure Corridors & Land Acquisition
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Official Survey of India aligned national portal. Explore state-level infrastructure
          projects, highway alignment corridors, and notified land parcels across all 36 States
          &amp; UTs.
        </p>

        <div className="mt-6 space-y-4">
          {isLoading ? (
            <MapFallback label="Loading the national map of India…" />
          ) : error ? (
            <MapFallback label="The map could not be loaded just now." />
          ) : (
            <ClientOnly fallback={<MapFallback label="Preparing the map…" />}>
              <Suspense fallback={<MapFallback label="Preparing the map…" />}>
                <PublicParcelMap
                  parcels={parcels}
                  routes={data?.routes ?? []}
                  projects={data?.projects ?? []}
                  isNationalPortal={true}
                />
              </Suspense>
            </ClientOnly>
          )}
          <MapLegend />
        </div>
      </section>

      {/* All projects, with per-project maps */}
      <PublicProjectsBoard />

      {/* Stages */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <p className="eyebrow">How acquisition progresses</p>
          <h2 className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-card-foreground sm:text-3xl">
            Three stages, recorded end to end
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {STAGES.map((s) => (
              <article
                key={s.step}
                className="rounded-2xl border border-border bg-background p-5 sm:p-6"
              >
                <span className="font-display text-sm font-semibold text-primary">{s.step}</span>
                <h3 className="mt-3 font-display text-lg font-semibold text-foreground">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Promises */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-4 sm:grid-cols-3">
          {PROMISES.map((p) => (
            <article key={p.title} className="surface p-5 sm:p-6">
              <span aria-hidden="true" className="block h-0.5 w-8 rounded-full bg-gold" />
              <h3 className="mt-4 font-display text-base font-semibold text-card-foreground">
                {p.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.copy}</p>
            </article>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl brand-gradient px-6 py-7 text-primary-foreground shadow-card">
          <div>
            <h2 className="font-display text-xl font-semibold sm:text-2xl">
              Are you a landowner or an officer?
            </h2>
            <p className="mt-1.5 text-sm text-primary-foreground/75">
              Sign in to see your parcels, compensation, awards and disputes.
            </p>
          </div>
          <Link
            to="/auth"
            className="inline-flex items-center rounded-lg bg-gold px-5 py-3 text-sm font-semibold text-gold-foreground shadow-card"
          >
            Sign in
          </Link>
        </div>
      </section>

      <footer className="border-t border-border px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>Bhoomi Setu · Land Acquisition Register</p>
          <p>Published parcel data only. Landowner names are never disclosed publicly.</p>
        </div>
      </footer>
    </div>
  );
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bhoomi Setu — Public Land Acquisition Map & Parcel Status" },
      {
        name: "description",
        content:
          "Public register of land parcels under acquisition, coloured by stage: identified, notified, award declared, possession taken or disputed. No login required.",
      },
      { property: "og:title", content: "Bhoomi Setu — Public Land Acquisition Register" },
      {
        property: "og:description",
        content:
          "Track land taken for public projects parcel by parcel, from survey to possession. Open to anyone.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});
