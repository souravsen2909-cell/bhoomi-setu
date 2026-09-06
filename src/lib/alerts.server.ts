/**
 * Server-only helpers that record an alert whenever a proposal or parcel
 * status changes. Called from server functions after a successful update.
 */

type AlertRow = {
  recipient_id: string;
  channel: string;
  message: string;
  related_entity_type: string;
  related_entity_id: string;
  sent_at: string;
};

async function insertAlerts(rows: AlertRow[]) {
  if (rows.length === 0) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("alerts").insert(rows);
  // Notification failures must never break the underlying action.
  if (error) console.error("alerts insert failed", error.message);
}

const label = (value: string) => value.replace(/_/g, " ");

/** Notify the proposal submitter that their case moved to a new status. */
export async function notifyProposalStatusChange(args: {
  proposalId: string;
  from: string | null;
  to: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("proposals")
    .select("id, submitted_by, projects(name)")
    .eq("id", args.proposalId)
    .maybeSingle();
  if (error || !data?.submitted_by) return;
  const project = (data.projects ?? null) as unknown as { name: string } | null;
  const name = project?.name ?? "your proposal";
  const message = args.from
    ? `Proposal for ${name} moved from ${label(args.from)} to ${label(args.to)}.`
    : `Proposal for ${name} is now ${label(args.to)}.`;

  await insertAlerts([
    {
      recipient_id: data.submitted_by,
      channel: "in_app",
      message,
      related_entity_type: "proposal",
      related_entity_id: args.proposalId,
      sent_at: new Date().toISOString(),
    },
  ]);
}

/** Notify every landowner linked to a parcel that its status changed. */
export async function notifyParcelStatusChange(args: {
  parcelId: string;
  from: string | null;
  to: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: parcel } = await supabaseAdmin
    .from("parcels")
    .select("id, survey_number")
    .eq("id", args.parcelId)
    .maybeSingle();

  const { data: owners } = await supabaseAdmin
    .from("parcel_ownership")
    .select("landowner_id, landowners(user_id)")
    .eq("parcel_id", args.parcelId);

  const recipients = new Set<string>();
  for (const row of owners ?? []) {
    const owner = (row.landowners ?? null) as unknown as { user_id: string | null } | null;
    if (owner?.user_id) recipients.add(owner.user_id);
  }
  if (recipients.size === 0) return;

  const survey = parcel?.survey_number ? `Parcel ${parcel.survey_number}` : "Your parcel";
  const message = args.from
    ? `${survey} status changed from ${label(args.from)} to ${label(args.to)}.`
    : `${survey} status is now ${label(args.to)}.`;

  const now = new Date().toISOString();
  await insertAlerts(
    [...recipients].map((recipient_id) => ({
      recipient_id,
      channel: "in_app",
      message,
      related_entity_type: "parcel",
      related_entity_id: args.parcelId,
      sent_at: now,
    })),
  );
}
