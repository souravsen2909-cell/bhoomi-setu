import { lazy, Suspense, useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useProfile } from "@/hooks/useProfile";
import { landingPathForTier } from "@/lib/profile.functions";
import { PageHeader, SectionCard } from "@/components/PageHeader";
import { ErrorState, LoadingCards } from "@/components/states";
import { AwardForm } from "@/components/AwardForm";
import { DocumentUploader } from "@/components/DocumentUploader";
import { MapLegend } from "@/components/MapLegend";
import { LazyParcelMap } from "@/components/LazyParcelMap";

const DrawNewParcel = lazy(() => import("@/components/DrawNewParcel"));
import {
  PROJECT_EDIT_TIERS,
  PROJECT_BOARD_TIERS,
  getAgencyProject,
  setCompensationPayment,
  setParcelGroundStatus,
  type AgencyIssue,
  type AgencyParcelRow,
  type AgencyPayment,
} from "@/lib/agency.functions";

import { deleteProject } from "@/lib/projects.functions";
import { updateDisputeStatus } from "@/lib/disputes.functions";

const money = (n: number | null) =>
  n === null
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(Number.isFinite(n) ? n : 0);

const area = (n: number | null) =>
  n === null ? "—" : `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n)} ha`;

const label = (value: string) => value.replace(/_/g, " ");

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Project Details — Land Acquisition Register" },
      {
        name: "description",
        content:
          "Project detail view for agencies: parcels mapped by the district, declared amounts, landowner logins and compensation payment status.",
      },
      { property: "og:title", content: "Project Details — Land Acquisition Register" },
      {
        property: "og:description",
        content:
          "See the parcels, affected families and payment status of one acquisition project, and mark compensation as paid.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const { profile, isLoading: profileLoading } = useProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tier = profile?.tier;

  useEffect(() => {
    if (!tier) return;
    if (!PROJECT_BOARD_TIERS.includes(tier))
      navigate({ to: landingPathForTier(tier), replace: true });
  }, [tier, navigate]);

  const allowed = !!tier && PROJECT_BOARD_TIERS.includes(tier);
  const isDistrict = tier === "district_authority";
  const isAgency = !!tier && PROJECT_EDIT_TIERS.includes(tier);
  const isCentral = tier === "central_ministry";
  const fetchProject = useServerFn(getAgencyProject);
  const removeProject = useServerFn(deleteProject);

  const query = useQuery({
    queryKey: ["agency-project", projectId],
    queryFn: () => fetchProject({ data: { projectId } }),
    enabled: allowed,
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
  });

  const remove = useMutation({
    mutationFn: () => removeProject({ data: { id: projectId } }),
    onSuccess: () => {
      toast.success("Project removed");
      queryClient.invalidateQueries({ queryKey: ["agency-projects"] });
      navigate({ to: "/projects", replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (profileLoading || (allowed && query.isLoading)) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <LoadingCards count={2} label="Loading project…" />
      </main>
    );
  }
  if (query.error) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <ErrorState message={(query.error as Error).message} />
      </main>
    );
  }

  const detail = query.data;
  if (!detail) return null;
  const project = detail.project;
  const parcels = detail.parcels ?? [];
  const payments = detail.payments ?? [];
  const issues = detail.issues ?? [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <Link to="/projects" className="text-sm text-primary hover:underline">
        ← All projects
      </Link>

      <div className="mt-3">
        <PageHeader
          eyebrow={project.stage}
          title={project.name}
          description={`${project.requiring_body}${
            project.district_name ? ` · ${project.district_name}` : ""
          }${project.state_name ? `, ${project.state_name}` : ""}`}
          actions={
            !isAgency ? undefined : (
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm("Remove this project and everything recorded under it?")) {
                    remove.mutate();
                  }
                }}
                className="rounded-lg border border-destructive/50 px-4 py-2 text-sm font-medium text-destructive disabled:opacity-50"
              >
                Remove project
              </button>
            )
          }
        />
      </div>

      {isCentral && (
        <p className="mt-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          View-only record. The ministry approves projects and attaches official documents; plots,
          amounts and payments are recorded by the district office and the implementing agency.
        </p>
      )}

      <dl className="mt-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Parcels mapped", String(project.parcels)],
          ["Families affected", String(project.families)],
          ["Land notified", area(project.area_notified)],
          ["Land taken over", area(project.area_taken)],
          ["Compensation paid", money(project.paid)],
          ["Still pending", money(project.pending)],
        ].map(([k, v]) => (
          <div key={k} className="surface p-4">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="mt-1 text-lg font-semibold text-card-foreground">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8">
        <SectionCard
          title="Parcels in this project"
          description="Parcels are drawn by the district authority once the project is approved."
        >
          {parcels.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No parcels yet — the district authority draws them after approval.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2">Survey no.</th>
                    <th className="py-2">Village</th>
                    <th className="py-2">Area</th>
                    <th className="py-2">Stage</th>
                    <th className="py-2">Families</th>
                  </tr>
                </thead>
                <tbody>
                  {parcels.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="py-2 font-medium text-card-foreground">{p.survey_number}</td>
                      <td className="py-2 text-muted-foreground">{p.village ?? "—"}</td>
                      <td className="py-2 text-muted-foreground">{area(p.area_hectares)}</td>
                      <td className="py-2 capitalize text-muted-foreground">{label(p.status)}</td>
                      <td className="py-2 text-muted-foreground">{p.families}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      {isDistrict && (
        <div className="mt-8">
          <Suspense
            fallback={<p className="text-sm text-muted-foreground">Loading parcel tools…</p>}
          >
            <DrawNewParcel lockedProjectId={projectId} />
          </Suspense>
        </div>
      )}

      <div className="mt-8">
        <SectionCard
          title="Land acquired & issues raised"
          description="Where each plot stands right now, any objection the landowner has raised, and a map that refreshes itself as the record changes."
        >
          {parcels.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing to show yet — this appears once the district authority maps the plots.
            </p>
          ) : (
            <div className="space-y-6">
              <dl className="grid gap-4 sm:grid-cols-3">
                {[
                  [
                    "Plots acquired",
                    `${parcels.filter((p) => p.acquired).length} of ${parcels.length}`,
                  ],
                  ["Still to be handed over", String(parcels.filter((p) => !p.acquired).length)],
                  ["Open issues", String(issues.filter((i) => i.status !== "resolved").length)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-border p-4">
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="mt-1 text-lg font-semibold text-card-foreground">{v}</dd>
                  </div>
                ))}
              </dl>

              <ul className="space-y-3">
                {parcels.map((parcel) => (
                  <ParcelStatusRow
                    key={parcel.id}
                    projectId={projectId}
                    parcel={parcel}
                    issues={issues.filter((i) => i.parcel_id === parcel.id)}
                    canSetGroundStatus={isAgency}
                  />
                ))}
              </ul>

              <div>
                <MapLegend />
                <div className="mt-3 overflow-hidden rounded-xl border border-border">
                  <LazyParcelMap
                    parcels={parcels.map((p) => ({
                      id: p.id,
                      survey_number: p.survey_number,
                      area_hectares: p.area_hectares,
                      status: p.status,
                      geometry: p.geometry,
                    }))}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Colours follow each plot's current stage and update on their own — red means an
                  issue has been raised.
                </p>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {isDistrict && (
        <div className="mt-8">
          <SectionCard
            title="Resolve land issues"
            description="Objections raised on plots in this project. Mark one as being looked at, or record the outcome once it is settled — the plot then returns to its normal stage everywhere."
          >
            {issues.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No objections have been raised on this project.
              </p>
            ) : (
              <ul className="space-y-3">
                {issues.map((issue) => (
                  <IssueResolveRow key={issue.id} projectId={projectId} issue={issue} />
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      )}

      {isAgency && (
        <div className="mt-8">
          <AwardForm projectId={projectId} />
        </div>
      )}

      <div className="mt-8">
        <SectionCard
          title="Compensation payments"
          description={
            isAgency
              ? "Mark each landowner's money as paid once it leaves your account. They see the change in their own portal straight away."
              : "Payment status for every landowner in this project."
          }
        >
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No amounts declared yet.</p>
          ) : (
            <ul className="space-y-3">
              {payments.map((row) => (
                <PaymentRow
                  key={row.compensation_id}
                  projectId={projectId}
                  payment={row}
                  canEdit={isAgency}
                />
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="mt-8">
        <DocumentUploader
          entityType="project"
          entityId={projectId}
          title="Official documents for this project"
          canUpload={isCentral}
        />
      </div>
    </main>
  );
}

function ParcelStatusRow({
  projectId,
  parcel,
  issues,
  canSetGroundStatus = true,
}: {
  projectId: string;
  parcel: AgencyParcelRow;
  issues: AgencyIssue[];
  canSetGroundStatus?: boolean;
}) {
  const open = issues.filter((i) => i.status !== "resolved");
  const queryClient = useQueryClient();
  const save = useServerFn(setParcelGroundStatus);
  const current: "possession_taken" | "disputed" | "pending" =
    parcel.status === "possession_taken"
      ? "possession_taken"
      : parcel.status === "disputed"
        ? "disputed"
        : "pending";
  const [mode, setMode] = useState<"possession_taken" | "disputed" | "pending">(current);
  const [note, setNote] = useState("");

  useEffect(() => {
    setMode(current);
  }, [current]);

  const mutation = useMutation({
    mutationFn: () => save({ data: { projectId, parcelId: parcel.id, mode, note } }),
    onSuccess: () => {
      toast.success("Plot status updated.");
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["agency-project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["agency-projects"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not update this plot."),
  });

  return (
    <li className="rounded-lg border border-border p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-card-foreground">
            Survey no. {parcel.survey_number} · {area(parcel.area_hectares)}
          </p>
          <p className="mt-1 text-xs capitalize text-muted-foreground">
            Stage: {label(parcel.status)}
            {parcel.village ? ` · ${parcel.village}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              parcel.acquired ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}
          >
            {parcel.acquired ? "Land acquired" : "Not acquired yet"}
          </span>
          {open.length > 0 && (
            <span className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
              {open.length} issue{open.length > 1 ? "s" : ""} raised
            </span>
          )}
        </div>
      </div>

      {canSetGroundStatus && (
        <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            aria-label={`Set status for survey number ${parcel.survey_number}`}
          >
            <option value="pending">Possession not taken yet</option>
            <option value="possession_taken">Possession taken over</option>
            <option value="disputed">Disputed / issue raised</option>
          </select>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={mode === "disputed" ? "What is the issue? (optional)" : "Note (optional)"}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          />
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || (mode === current && !note)}
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {mutation.isPending ? "Saving…" : "Update status"}
          </button>
        </div>
      )}

      {issues.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-border pt-3">
          {issues.map((issue) => (
            <li key={issue.id} className="text-xs text-muted-foreground">
              <span className="font-medium capitalize text-card-foreground">
                {label(issue.dispute_type)}
              </span>{" "}
              — <span className="capitalize">{label(issue.status)}</span>
              {issue.filed_at ? ` · raised ${issue.filed_at.slice(0, 10)}` : ""}
              {issue.raised_by_name ? ` · by ${issue.raised_by_name}` : ""}
              {issue.description ? <span className="block mt-1">{issue.description}</span> : null}
              {issue.resolution_notes ? (
                <span className="block mt-1 italic">Outcome: {issue.resolution_notes}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function PaymentRow({
  projectId,
  payment,
  canEdit = true,
}: {
  projectId: string;
  payment: AgencyPayment;
  canEdit?: boolean;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(setCompensationPayment);
  const [ref, setRef] = useState(payment.transaction_ref ?? "");
  const paid = payment.status === "disbursed";

  const mutation = useMutation({
    mutationFn: (nextPaid: boolean) =>
      save({
        data: {
          projectId,
          compensationId: payment.compensation_id,
          paid: nextPaid,
          transactionRef: ref,
        },
      }),
    onSuccess: (_data, nextPaid) => {
      toast.success(nextPaid ? "Marked as paid" : "Moved back to pending");
      queryClient.invalidateQueries({ queryKey: ["agency-project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["agency-projects"] });
      queryClient.invalidateQueries({ queryKey: ["award-parcels", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <li className="rounded-lg border border-border p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-card-foreground">
            Survey no. {payment.survey_number} · {money(payment.assessed_amount)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {payment.landowner_name}
            {payment.landowner_email ? ` · ${payment.landowner_email}` : ""}
            {paid && payment.disbursed_date ? ` · paid ${payment.disbursed_date}` : ""}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            paid ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {paid ? "Paid" : "Pending"}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canEdit && !paid && (
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="Payment reference (optional)"
            className="w-full max-w-xs rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        )}
        {canEdit && (
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(!paid)}
            className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${
              paid ? "border border-border text-foreground" : "bg-primary text-primary-foreground"
            }`}
          >
            {paid ? "Move back to pending" : "Mark as paid"}
          </button>
        )}
        {!canEdit && payment.transaction_ref && (
          <span className="text-xs text-muted-foreground">
            Reference: {payment.transaction_ref}
          </span>
        )}
      </div>
    </li>
  );
}

function IssueResolveRow({ projectId, issue }: { projectId: string; issue: AgencyIssue }) {
  const queryClient = useQueryClient();
  const save = useServerFn(updateDisputeStatus);
  const resolved = issue.status === "resolved";
  const [status, setStatus] = useState<"under_review" | "resolved">(
    issue.status === "under_review" ? "resolved" : "under_review",
  );
  const [notes, setNotes] = useState(issue.resolution_notes ?? "");

  const mutation = useMutation({
    mutationFn: () => save({ data: { disputeId: issue.id, status, notes } }),
    onSuccess: () => {
      toast.success(
        status === "resolved" ? "Issue marked as resolved." : "Issue marked as under review.",
      );
      queryClient.invalidateQueries({ queryKey: ["agency-project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["agency-projects"] });
      queryClient.invalidateQueries({ queryKey: ["disputes"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not update this issue."),
  });

  return (
    <li className="rounded-lg border border-border p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium capitalize text-card-foreground">
            Survey no. {issue.survey_number} · {label(issue.dispute_type)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {issue.filed_at ? `Raised ${issue.filed_at.slice(0, 10)}` : "Raised"}
            {issue.raised_by_name ? ` · by ${issue.raised_by_name}` : ""}
          </p>
          {issue.description ? (
            <p className="mt-2 text-xs text-muted-foreground">{issue.description}</p>
          ) : null}
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
            resolved ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
          }`}
        >
          {label(issue.status)}
        </span>
      </div>

      {resolved ? (
        issue.resolution_notes ? (
          <p className="mt-3 border-t border-border pt-3 text-xs italic text-muted-foreground">
            Outcome: {issue.resolution_notes}
            {issue.resolved_at ? ` · ${issue.resolved_at.slice(0, 10)}` : ""}
          </p>
        ) : null
      ) : (
        <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            aria-label={`Set status for the issue on survey number ${issue.survey_number}`}
          >
            <option value="under_review">Being looked at</option>
            <option value="resolved">Issue solved</option>
          </select>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              status === "resolved" ? "How was it settled? (required)" : "Note (optional)"
            }
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          />
          <button
            type="button"
            onClick={() => {
              if (status === "resolved" && !notes.trim()) {
                toast.error("Please write how the issue was settled before marking it solved.");
                return;
              }
              mutation.mutate();
            }}
            disabled={mutation.isPending}
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {mutation.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </li>
  );
}
