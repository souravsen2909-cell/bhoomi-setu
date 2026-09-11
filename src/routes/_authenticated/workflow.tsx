import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense } from "react";
import { toast } from "sonner";
import { useProfile } from "@/hooks/useProfile";
import { landingPathForTier, type Tier } from "@/lib/profile.functions";
import { EmptyState, ErrorState, LoadingCards } from "@/components/states";
import { DocumentUploader } from "@/components/DocumentUploader";
import { RecordPossession } from "@/components/RecordPossession";
import { AffectedLandowners } from "@/components/AffectedLandowners";
import { PageHeader } from "@/components/PageHeader";
import {
  advanceProposal,
  getWorkflowProposals,
  nextStatus,
  returnProposalForCorrection,
  stageActor,
  type ProposalStatus,
  type WorkflowProposal,
} from "@/lib/workflow.functions";

const DrawNewParcel = lazy(() => import("@/components/DrawNewParcel"));

const ALLOW: Tier[] = [
  "central_ministry",
  "state_government",
  "district_authority",
  "implementing_agency",
];

const STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_scrutiny: "Under scrutiny",
  returned_for_correction: "Returned for correction",
  approved: "Approved",
  rejected: "Rejected",
};

const PIPELINE: { status: ProposalStatus; label: string; owner: string }[] = [
  { status: "draft", label: "Raised", owner: "Implementing agency" },
  { status: "submitted", label: "Verification", owner: "State government" },
  { status: "under_scrutiny", label: "Approval", owner: "Central ministry" },
  { status: "approved", label: "Parcels & families", owner: "District, then agency" },
];

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—";

export const Route = createFileRoute("/_authenticated/workflow")({
  head: () => ({
    meta: [
      { title: "Case Workflow — Land Acquisition Register" },
      {
        name: "description",
        content:
          "Working queue for district authorities and implementing agencies: review proposals, advance stages and return cases for correction.",
      },
      { property: "og:title", content: "Case Workflow — Land Acquisition Register" },
      {
        property: "og:description",
        content:
          "Review acquisition proposals, advance them through the approval sequence or return them for correction.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WorkflowPage,
});

function WorkflowPage() {
  const { profile, isLoading: profileLoading } = useProfile();
  const navigate = useNavigate();
  const tier = profile?.tier;

  useEffect(() => {
    if (!tier) return;
    if (!ALLOW.includes(tier)) navigate({ to: landingPathForTier(tier), replace: true });
  }, [tier, navigate]);

  const allowed = !!tier && ALLOW.includes(tier);
  const fetchProposals = useServerFn(getWorkflowProposals);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["workflow-proposals"],
    queryFn: () => fetchProposals({}),
    enabled: allowed,
  });

  const advanceFn = useServerFn(advanceProposal);
  const returnFn = useServerFn(returnProposalForCorrection);
  const [actionError, setActionError] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["workflow-proposals"] });
    queryClient.invalidateQueries({ queryKey: ["agency-projects"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  const advance = useMutation({
    mutationFn: (proposalId: string) => advanceFn({ data: { proposalId } }),
    onSuccess: () => {
      setActionError(null);
      toast.success("Case successfully advanced to the next workflow stage!");
      invalidate();
    },
    onError: (e: Error) => {
      setActionError(e.message);
      toast.error(`Failed to advance: ${e.message}`);
    },
  });

  const returnForCorrection = useMutation({
    mutationFn: (vars: { proposalId: string; remarks: string }) => returnFn({ data: vars }),
    onSuccess: () => {
      setActionError(null);
      toast.info("Case returned for correction.");
      invalidate();
    },
    onError: (e: Error) => {
      setActionError(e.message);
      toast.error(`Failed to return: ${e.message}`);
    },
  });

  const [selectedState, setSelectedState] = useState<string>("all");

  const rawProposals = query.data ?? [];
  const stateOptions = Array.from(
    new Set(rawProposals.map((p) => p.state_name).filter(Boolean)),
  ) as string[];

  const proposals =
    selectedState === "all"
      ? rawProposals
      : rawProposals.filter((p) => p.state_name === selectedState);

  const pendingStateVerification = rawProposals.filter((p) => p.status === "submitted").length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        eyebrow="Case management"
        title="Workflow"
        description="Acquisition proposals across India. Move a case to the next stage, or send it back with a note for correction."
      />

      {tier === "state_government" && (
        <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                State Government Verification Queue
              </p>
              <h3 className="mt-1 text-base font-semibold text-foreground">
                {pendingStateVerification > 0
                  ? `${pendingStateVerification} project proposal${pendingStateVerification === 1 ? "" : "s"} awaiting state verification`
                  : "All submitted project proposals are verified"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                As a State Government Officer, you verify new acquisition proposals raised by
                agencies (Step 2). Once verified, click &ldquo;Advance Stage&rdquo; to send them to
                the Central Ministry for approval.
              </p>
            </div>
            <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
              {pendingStateVerification} to verify
            </span>
          </div>
        </div>
      )}

      {tier === "district_authority" && (
        <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                District Execution Queue (Step 4)
              </p>
              <h3 className="mt-1 text-base font-semibold text-foreground">
                Centrally Approved Acquisition Projects Ready for Mapping
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                As a District Authority Officer (CALA), you map parcel boundaries, issue survey
                numbers, declare compensation awards, and handle landowner objections for all
                centrally approved projects.
              </p>
            </div>
            <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
              {rawProposals.filter((p) => p.status === "approved").length} Approved
            </span>
          </div>
        </div>
      )}

      <section className="mt-6 surface p-4 sm:p-6">
        <p className="eyebrow">How a case moves</p>
        <ol className="mt-3 grid gap-3 sm:grid-cols-4">
          {PIPELINE.map((step, i) => (
            <li key={step.status} className="rounded-lg border border-border bg-muted/40 p-3">
              <span className="text-xs font-semibold text-primary">Step {i + 1}</span>
              <p className="mt-1 text-sm font-medium text-card-foreground">{step.label}</p>
              <p className="text-xs text-muted-foreground">{step.owner}</p>
            </li>
          ))}
        </ol>
      </section>

      {(tier === "state_government" ||
        tier === "central_ministry" ||
        tier === "district_authority") &&
        stateOptions.length > 0 && (
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
              All States ({rawProposals.length})
            </button>
            {stateOptions.map((st) => {
              const count = rawProposals.filter((p) => p.state_name === st).length;
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

      {tier === "district_authority" && (
        <Suspense
          fallback={<p className="mt-8 text-sm text-muted-foreground">Loading parcel tools…</p>}
        >
          <DrawNewParcel />
        </Suspense>
      )}

      {tier === "implementing_agency" && (
        <div className="mt-8 space-y-8">
          <AffectedLandowners />
          <RecordPossession />
        </div>
      )}

      {actionError && (
        <p className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </p>
      )}

      <div className="mt-8 space-y-4">
        {profileLoading || (allowed && query.isLoading) ? (
          <LoadingCards count={2} label="Loading cases…" />
        ) : query.error ? (
          <ErrorState message={(query.error as Error).message} />
        ) : proposals.length === 0 ? (
          <EmptyState
            title="No cases in this queue yet"
            description="Acquisition proposals will appear here as soon as they are submitted."
          />
        ) : (
          proposals.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              tier={tier}
              busy={advance.isPending || returnForCorrection.isPending}
              onAdvance={() => advance.mutate(p.id)}
              onReturn={(remarks) => returnForCorrection.mutate({ proposalId: p.id, remarks })}
            />
          ))
        )}
      </div>
    </main>
  );
}

function ProposalCard({
  proposal,
  tier,
  busy,
  onAdvance,
  onReturn,
}: {
  proposal: WorkflowProposal;
  tier: Tier | undefined;
  busy: boolean;
  onAdvance: () => void;
  onReturn: (remarks: string) => void;
}) {
  const [showReturn, setShowReturn] = useState(false);
  const [remarks, setRemarks] = useState("");
  const next = nextStatus(proposal.status);
  const waitingOn = stageActor(proposal.status);

  return (
    <article className="surface p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-medium text-card-foreground">{proposal.project_name}</h2>
            {proposal.state_name && (
              <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {proposal.state_name}
              </span>
            )}
            {proposal.district_name && (
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {proposal.district_name}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Submitted {formatDate(proposal.submitted_at ?? proposal.created_at)} ·{" "}
            {proposal.parcel_count} parcel{proposal.parcel_count === 1 ? "" : "s"} mapped
          </p>
        </div>
        <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
          {STATUS_LABEL[proposal.status]}
        </span>
      </div>

      {proposal.purpose && (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{proposal.purpose}</p>
      )}
      {proposal.status === "returned_for_correction" && proposal.remarks && (
        <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          Note: {proposal.remarks}
        </p>
      )}

      {!proposal.can_advance && !proposal.can_return && (
        <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          {waitingOn
            ? `Waiting with the ${waitingOn.toLowerCase()} for the next step.`
            : proposal.status === "approved"
              ? "Approved — the district authority can now map the parcels."
              : "No action is needed from you on this case."}
        </p>
      )}

      {(proposal.can_advance || proposal.can_return) && (
        <div className="mt-5 flex flex-wrap gap-3">
          {proposal.can_advance && next && (
            <button
              type="button"
              disabled={busy}
              onClick={onAdvance}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {`Advance Stage → ${STATUS_LABEL[next]}`}
            </button>
          )}
          {proposal.can_return && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setShowReturn((v) => !v)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground disabled:opacity-50"
            >
              Return for Correction
            </button>
          )}
        </div>
      )}

      {showReturn && (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onReturn(remarks);
            setRemarks("");
            setShowReturn(false);
          }}
        >
          <label className="block text-sm font-medium text-foreground" htmlFor={`r-${proposal.id}`}>
            What needs correcting?
          </label>
          <textarea
            id={`r-${proposal.id}`}
            required
            rows={3}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            placeholder="Explain the correction needed before this case can move forward."
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-50"
          >
            Send back
          </button>
        </form>
      )}

      <DocumentUploader
        entityType="proposal"
        entityId={proposal.id}
        title="Documents for this proposal"
        canUpload={tier === "central_ministry"}
      />
    </article>
  );
}
