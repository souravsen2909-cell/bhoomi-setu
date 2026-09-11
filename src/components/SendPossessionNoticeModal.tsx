import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Mail, MessageSquare, Send, ShieldCheck, X } from "lucide-react";
import {
  getPossessionNoticePreview,
  sendPossessionNotice,
  type PossessionNoticeResult,
} from "@/lib/possession.functions";

export function SendPossessionNoticeModal({
  parcelId,
  projectId,
  onClose,
  onSent,
}: {
  parcelId: string;
  projectId?: string;
  onClose: () => void;
  onSent?: () => void;
}) {
  const fetchPreview = useServerFn(getPossessionNoticePreview);
  const dispatch = useServerFn(sendPossessionNotice);
  const queryClient = useQueryClient();

  const [customNote, setCustomNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [sentResult, setSentResult] = useState<PossessionNoticeResult | null>(null);

  const previewQuery = useQuery({
    queryKey: ["possession-notice-preview", parcelId],
    queryFn: () => fetchPreview({ data: { parcelId } }),
  });

  const preview = previewQuery.data;

  const mutation = useMutation({
    mutationFn: () => dispatch({ data: { parcelId, projectId, customNote } }),
    onSuccess: (result) => {
      toast.success("Possession notice sent to landowner");
      setSentResult(result);
      queryClient.invalidateQueries({ queryKey: ["my-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["agency-project"] });
      queryClient.invalidateQueries({ queryKey: ["possession-parcels"] });
      if (onSent) onSent();
    },
    onError: (e: Error) => toast.error(e.message || "Failed to dispatch possession notice"),
  });

  const messageText = sentResult
    ? sentResult.noticeMessage
    : preview
      ? `OFFICIAL NOTICE: POSSESSION OF LAND TAKEN OVER\n` +
        `-----------------------------------------\n` +
        `Dear ${preview.landownerName ?? "Landowner"},\n\n` +
        `This is to formally notify you that physical possession of your land parcel has been taken over by ${preview.requiringBody} for the "${preview.projectName}" project.\n\n` +
        `• Survey Number: ${preview.surveyNumber}\n` +
        `• Area: ${preview.areaHectares != null ? `${preview.areaHectares} hectares` : "Recorded plot"}\n` +
        `• Project: ${preview.projectName}\n` +
        `• Acquiring Authority: ${preview.requiringBody}\n` +
        `• Date of Handover/Takeover: ${preview.takenOverDate}\n` +
        `• Status: Possession Formally Recorded in Bhoomi Setu Register\n` +
        (customNote.trim() ? `• Officer Remarks: ${customNote.trim()}\n` : "") +
        `\nCompensation proceedings and records have been entered in the register. You may review your official ledger and download acquisition records anytime by signing into your Bhoomi Setu portal account.\n\n` +
        `Issued by: Office of the Implementing Agency / District Competent Authority.`
      : "Loading official notice details…";

  function copyNotice() {
    navigator.clipboard.writeText(messageText);
    setCopied(true);
    toast.success("Notice text copied to clipboard");
    setTimeout(() => setCopied(false), 2500);
  }

  function openWhatsApp() {
    const phoneDigits = (preview?.landownerPhone ?? "").replace(/\D/g, "");
    const encoded = encodeURIComponent(messageText);
    const url = phoneDigits
      ? `https://api.whatsapp.com/send?phone=${phoneDigits}&text=${encoded}`
      : `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function openEmail() {
    const email = preview?.landownerEmail ?? "";
    const subject = encodeURIComponent(
      `Official Notice: Land Possession Recorded — Survey No. ${preview?.surveyNumber ?? "Parcel"}`,
    );
    const body = encodeURIComponent(messageText);
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="possession-notice-title"
    >
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Close dialog"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 text-primary">
          <ShieldCheck className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            Official Land Acquisition Dispatch
          </span>
        </div>

        <h2
          id="possession-notice-title"
          className="mt-1 font-display text-xl font-semibold text-card-foreground"
        >
          Send Land Takeover Notice
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Send a structured, legal notification to the landowner confirming that physical possession
          of their plot has been formally taken over and recorded in the register.
        </p>

        {previewQuery.isLoading ? (
          <div className="mt-6 flex h-40 items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading parcel and landowner details…</p>
          </div>
        ) : previewQuery.error ? (
          <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            Could not load notice details: {(previewQuery.error as Error).message}
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {/* Summary details card */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-xl border border-border bg-muted/40 p-3.5 text-xs">
              <div>
                <span className="block text-muted-foreground">Survey number</span>
                <span className="font-semibold text-card-foreground">
                  {preview?.surveyNumber ?? "—"}
                </span>
              </div>
              <div>
                <span className="block text-muted-foreground">Area</span>
                <span className="font-semibold text-card-foreground">
                  {preview?.areaHectares != null ? `${preview.areaHectares} ha` : "—"}
                </span>
              </div>
              <div>
                <span className="block text-muted-foreground">Takeover date</span>
                <span className="font-semibold text-card-foreground">
                  {preview?.takenOverDate ?? "Today"}
                </span>
              </div>
              <div>
                <span className="block text-muted-foreground">Landowner</span>
                <span className="font-semibold text-card-foreground truncate block">
                  {preview?.landownerName ?? "Registered Landowner"}
                </span>
              </div>
            </div>

            {/* Landowner Contact Badges */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-muted-foreground">Recipient Channels:</span>
              {preview?.landownerEmail ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-foreground">
                  <Mail className="h-3 w-3 text-primary" />
                  {preview.landownerEmail}
                </span>
              ) : (
                <span className="text-muted-foreground italic">No email on file</span>
              )}
              {preview?.landownerPhone ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-foreground">
                  <MessageSquare className="h-3 w-3 text-emerald-600" />
                  {preview.landownerPhone}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-primary font-medium">
                <ShieldCheck className="h-3 w-3" />
                In-App Portal Alert
              </span>
            </div>

            {/* Optional note input */}
            {!sentResult && (
              <div>
                <label
                  htmlFor="custom-officer-note"
                  className="block text-xs font-medium text-foreground"
                >
                  Optional officer note or dispatch reference
                </label>
                <input
                  id="custom-officer-note"
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  placeholder="e.g. Possession memo no. SDM/LA/2026/412 signed on site"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            )}

            {/* Formatted Message Preview */}
            <div>
              <div className="flex items-center justify-between pb-1.5">
                <label className="text-xs font-medium text-foreground">
                  Official Notice Content
                </label>
                <button
                  type="button"
                  onClick={copyNotice}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Copy text
                    </>
                  )}
                </button>
              </div>
              <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-muted/60 p-3 text-xs leading-relaxed text-card-foreground font-mono">
                {messageText}
              </pre>
            </div>

            {/* Success state banner if dispatched */}
            {sentResult && (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-950 dark:text-emerald-200">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <Check className="h-4 w-4 text-emerald-600" />
                  Official Takeover Notice Successfully Dispatched
                </div>
                <p className="mt-1 text-xs opacity-90">
                  Recorded in landowner portal alerts and system audit logs at{" "}
                  {new Date(sentResult.sentAt).toLocaleTimeString("en-IN")}.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={openWhatsApp}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
                >
                  <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                  Share via WhatsApp
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </button>
                {preview?.landownerEmail && (
                  <button
                    type="button"
                    onClick={openEmail}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    <Mail className="h-3.5 w-3.5 text-primary" />
                    Open Email Client
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                >
                  {sentResult ? "Close" : "Cancel"}
                </button>
                {!sentResult && (
                  <button
                    type="button"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    {mutation.isPending ? "Sending…" : "Send Official Notice"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SendPossessionNoticeModal;
