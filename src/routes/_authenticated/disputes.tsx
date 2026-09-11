import { useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorState, LoadingCards } from "@/components/states";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useProfile } from "@/hooks/useProfile";
import { landingPathForTier } from "@/lib/profile.functions";
import {
  DISPUTE_STATUSES,
  DISPUTE_TYPES,
  FILE_TIERS,
  REVIEW_TIERS,
  VIEW_TIERS,
  fileDispute,
  getDisputes,
  getMyDisputeParcels,
  updateDisputeStatus,
  type DisputeRow,
  type DisputeStatus,
  type DisputeType,
} from "@/lib/disputes.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/PageHeader";

const TITLE = "Disputes — Land Acquisition Register";
const DESCRIPTION =
  "File and track objections raised on acquired land parcels, from filing through review to resolution.";

export const Route = createFileRoute("/_authenticated/disputes")({
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
  component: DisputesPage,
});

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground disabled:opacity-50";

const STATUS_LABEL: Record<DisputeStatus, string> = {
  filed: "Filed",
  under_review: "Under review",
  resolved: "Resolved",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: DisputeStatus }) {
  return (
    <span className="rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function DisputesPage() {
  const { profile, isLoading } = useProfile();
  const navigate = useNavigate();
  const tier = profile?.tier;
  const canFile = !!tier && FILE_TIERS.includes(tier);
  const canReview = !!tier && REVIEW_TIERS.includes(tier);
  const canWatch = !!tier && VIEW_TIERS.includes(tier);
  const allowed = canFile || canReview || canWatch;

  useEffect(() => {
    if (!tier || allowed) return;
    navigate({ to: landingPathForTier(tier), replace: true });
  }, [tier, allowed, navigate]);

  const loadDisputes = useServerFn(getDisputes);
  const loadParcels = useServerFn(getMyDisputeParcels);

  const disputesQuery = useQuery({
    queryKey: ["disputes"],
    queryFn: () => loadDisputes(),
    enabled: allowed,
  });

  const parcelsQuery = useQuery({
    queryKey: ["disputes", "my-parcels"],
    queryFn: () => loadParcels(),
    enabled: canFile,
  });

  const [statusFilter, setStatusFilter] = useState<"all" | DisputeStatus>("all");

  const disputes = disputesQuery.data ?? [];
  const visible = useMemo(
    () => (statusFilter === "all" ? disputes : disputes.filter((d) => d.status === statusFilter)),
    [disputes, statusFilter],
  );

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
      <PageHeader eyebrow="Grievances" title="Disputes" description={DESCRIPTION} />

      {canWatch ? (
        <p className="mt-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You can follow every dispute here. Only the district authority resolves them.
        </p>
      ) : null}

      {canFile ? (
        <FileDisputeForm parcels={parcelsQuery.data ?? []} isLoading={parcelsQuery.isLoading} />
      ) : null}

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-lg font-semibold text-foreground">
            {canReview || canWatch ? "Disputes on record" : "Your disputes"}
          </h2>
          <div className="w-full space-y-2 sm:w-48">
            <Label htmlFor="d-filter">Filter by status</Label>
            <select
              id="d-filter"
              className={selectClass}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | DisputeStatus)}
            >
              <option value="all">All statuses</option>
              {DISPUTE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {disputesQuery.isLoading ? (
            <LoadingCards count={2} label="Loading disputes…" />
          ) : disputesQuery.isError ? (
            <ErrorState
              message={(disputesQuery.error as Error).message || "Could not load disputes."}
            />
          ) : visible.length === 0 ? (
            <EmptyState
              title={statusFilter === "all" ? "No disputes yet" : "Nothing at this status"}
              description={
                statusFilter === "all"
                  ? canReview || canWatch
                    ? "No disputes have been filed on these parcels so far."
                    : "You have not filed any disputes yet."
                  : "Try choosing a different status in the filter above."
              }
            />
          ) : (
            visible.map((dispute) => (
              <DisputeCard key={dispute.id} dispute={dispute} canReview={canReview} />
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function FileDisputeForm({
  parcels,
  isLoading,
}: {
  parcels: { id: string; survey_number: string; village: string | null }[];
  isLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const submit = useServerFn(fileDispute);
  const [parcelId, setParcelId] = useState("");
  const [disputeType, setDisputeType] = useState<DisputeType>("compensation amount");
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: (input: { parcelId: string; disputeType: DisputeType; description: string }) =>
      submit({ data: input }),
    onSuccess: async () => {
      toast.success("Dispute filed");
      setDescription("");
      setParcelId("");
      await queryClient.invalidateQueries({ queryKey: ["disputes"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not file the dispute"),
  });

  return (
    <section className="mt-8 surface p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-card-foreground">File a new dispute</h2>
      <form
        className="mt-5 grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!parcelId) {
            toast.error("Choose one of your parcels");
            return;
          }
          if (!description.trim()) {
            toast.error("Describe the dispute");
            return;
          }
          mutation.mutate({ parcelId, disputeType, description: description.trim() });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="d-parcel">Parcel</Label>
          <select
            id="d-parcel"
            className={selectClass}
            value={parcelId}
            disabled={isLoading || parcels.length === 0}
            onChange={(e) => setParcelId(e.target.value)}
          >
            <option value="">
              {isLoading
                ? "Loading your parcels…"
                : parcels.length === 0
                  ? "No parcels registered to you"
                  : "Select a parcel…"}
            </option>
            {parcels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.survey_number}
                {p.village ? ` — ${p.village}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="d-type">Dispute type</Label>
          <select
            id="d-type"
            className={selectClass}
            value={disputeType}
            onChange={(e) => setDisputeType(e.target.value as DisputeType)}
          >
            {DISPUTE_TYPES.map((t) => (
              <option key={t} value={t} className="capitalize">
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="d-desc">Description</Label>
          <textarea
            id="d-desc"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Explain what is being disputed and why."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          />
        </div>

        <div className="sm:col-span-2">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Filing…" : "File dispute"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function DisputeCard({ dispute, canReview }: { dispute: DisputeRow; canReview: boolean }) {
  const queryClient = useQueryClient();
  const submit = useServerFn(updateDisputeStatus);
  const [notes, setNotes] = useState(dispute.resolution_notes ?? "");

  const mutation = useMutation({
    mutationFn: (input: { status: "under_review" | "resolved" }) =>
      submit({ data: { disputeId: dispute.id, status: input.status, notes } }),
    onSuccess: async () => {
      toast.success("Dispute updated");
      await queryClient.invalidateQueries({ queryKey: ["disputes"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not update the dispute"),
  });

  return (
    <article className="surface p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-card-foreground">
            Survey no. {dispute.survey_number}
            {dispute.village ? (
              <span className="text-muted-foreground"> · {dispute.village}</span>
            ) : null}
          </h3>
          <p className="mt-1 text-sm capitalize text-muted-foreground">
            {dispute.dispute_type ?? "Unspecified"} · filed {formatDate(dispute.filed_at)}
          </p>
        </div>
        <StatusBadge status={dispute.status} />
      </div>

      {dispute.description ? (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{dispute.description}</p>
      ) : null}

      {dispute.resolution_notes ? (
        <p className="mt-4 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          <span className="font-medium text-card-foreground">Resolution notes: </span>
          {dispute.resolution_notes}
          {dispute.resolved_at ? ` (${formatDate(dispute.resolved_at)})` : ""}
        </p>
      ) : null}

      {canReview && dispute.status !== "resolved" ? (
        <div className="mt-5 space-y-3 border-t border-border pt-5">
          <div className="space-y-2">
            <Label htmlFor={`notes-${dispute.id}`}>Resolution notes</Label>
            <Input
              id={`notes-${dispute.id}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Required before marking resolved"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            {dispute.status === "filed" ? (
              <Button
                variant="outline"
                size="sm"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ status: "under_review" })}
              >
                Mark under review
              </Button>
            ) : null}
            <Button
              size="sm"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ status: "resolved" })}
            >
              Mark resolved
            </Button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
