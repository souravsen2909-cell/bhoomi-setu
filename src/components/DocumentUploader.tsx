import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileCheck, FileText, Upload, X, ExternalLink } from "lucide-react";
import { getEntityDocuments, uploadEntityDocument } from "@/lib/documents.functions";
import { Skeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  entityType: string;
  entityId: string;
  title?: string;
  /** Hide the upload control for read-only surfaces. */
  canUpload?: boolean;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function toBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function DocumentUploader({
  entityType,
  entityId,
  title = "Official Documents & Gazette Notifications",
  canUpload = true,
}: Props) {
  const queryClient = useQueryClient();
  const loadDocs = useServerFn(getEntityDocuments);
  const upload = useServerFn(uploadEntityDocument);

  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const queryKey = ["documents", entityType, entityId];

  const documentsQuery = useQuery({
    queryKey,
    queryFn: () => loadDocs({ data: { entityType, entityId } }),
  });

  const mutation = useMutation({
    mutationFn: async ({ file, docDescription }: { file: File; docDescription: string }) => {
      const contentBase64 = await toBase64(file);
      return upload({
        data: {
          entityType,
          entityId,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          contentBase64,
          description: docDescription || undefined,
        },
      });
    },
    onSuccess: async (result) => {
      toast.success(
        `Document submitted successfully as Version ${result.version}! Visible across project and workflow pages.`,
      );
      setSelectedFile(null);
      setDescription("");
      if (inputRef.current) inputRef.current.value = "";
      // Invalidate all document queries and project queries across the app
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      await queryClient.invalidateQueries({ queryKey: ["agency-projects"] });
      await queryClient.invalidateQueries({ queryKey: ["agency-project"] });
      await queryClient.invalidateQueries({ queryKey: ["workflow-proposals"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not submit the document"),
  });

  const handleFileSelect = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File exceeds 20 MB limit.");
      return;
    }
    setSelectedFile(file);
    const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
    setDescription(cleanName);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.error("Please select a document or PDF first.");
      return;
    }
    mutation.mutate({ file: selectedFile, docDescription: description });
  };

  const handleClear = () => {
    setSelectedFile(null);
    setDescription("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const docs = documentsQuery.data ?? [];

  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-wide text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">
            Official orders, gazette notifications, and approval documents linked to this
            acquisition.
          </p>
        </div>
        {canUpload && !selectedFile ? (
          <div>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs font-medium"
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="size-3.5" />
              Choose File / PDF
            </Button>
          </div>
        ) : null}
      </div>

      {canUpload && (
        <div className="mt-4">
          {selectedFile ? (
            <form
              onSubmit={handleSubmit}
              className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 transition-all"
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <FileText className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {selectedFile.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(selectedFile.size)} · {selectedFile.type || "Document"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={mutation.isPending}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Remove file"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="doc-title-input" className="text-xs font-medium text-foreground">
                    Document Title / Remarks (Optional)
                  </label>
                  <Input
                    id="doc-title-input"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g., Central Ministry Final Approval Order, Gazette Notification Phase 1"
                    className="h-8 text-xs bg-background"
                    disabled={mutation.isPending}
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-muted-foreground"
                    onClick={handleClear}
                    disabled={mutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    className="h-8 gap-1.5 text-xs font-medium shadow-sm"
                    disabled={mutation.isPending}
                  >
                    {mutation.isPending ? (
                      <>
                        <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Submitting Document…
                      </>
                    ) : (
                      <>
                        <FileCheck className="size-3.5" />
                        Submit Document
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFileSelect(e.dataTransfer.files?.[0]);
              }}
              onClick={() => inputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-4 text-center transition-colors ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border/80 bg-muted/20 hover:border-primary/50 hover:bg-muted/40"
              }`}
            >
              <Upload className="size-5 text-muted-foreground" />
              <p className="mt-1.5 text-xs font-medium text-foreground">
                Drop PDF or official document here, or click to browse
              </p>
              <p className="text-[0.7rem] text-muted-foreground">
                Supports PDF, scanned copies, gazette orders up to 20 MB. After selecting, click
                Submit to publish.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Documents Listing */}
      <div className="mt-4">
        {documentsQuery.isLoading ? (
          <div className="space-y-2" role="status" aria-live="polite">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : documentsQuery.isError ? (
          <p className="text-xs text-destructive">
            {(documentsQuery.error as Error).message || "Could not load documents."}
          </p>
        ) : docs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-center">
            <FileText className="mx-auto size-6 text-muted-foreground/60" />
            <p className="mt-1.5 text-xs font-medium text-foreground">
              No official documents submitted yet
            </p>
            <p className="text-[0.7rem] text-muted-foreground">
              Official approval orders, survey reports, or gazette PDFs submitted by Central
              Ministry will appear here and sync across all authority views.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {docs.map((doc) => {
              const isPdf = doc.file_name.toLowerCase().endsWith(".pdf");
              return (
                <li
                  key={doc.id}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                        isPdf
                          ? "bg-red-500/10 text-red-600 dark:text-red-400"
                          : "bg-primary/10 text-primary"
                      }`}
                    >
                      <FileText className="size-4.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-xs font-semibold text-foreground">
                          {doc.description || doc.file_name}
                        </span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                          v{doc.version}
                        </span>
                        {isPdf && (
                          <span className="rounded bg-red-100 px-1.5 py-0.2 text-[0.65rem] font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300">
                            PDF
                          </span>
                        )}
                      </div>
                      {doc.description && doc.description !== doc.file_name && (
                        <p className="truncate text-[0.7rem] text-muted-foreground">
                          File: {doc.file_name}
                        </p>
                      )}
                      <p className="text-[0.7rem] text-muted-foreground">
                        Submitted on {formatDate(doc.uploaded_at)}
                        {doc.uploader_name ? ` by ${doc.uploader_name}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                    {doc.url ? (
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <ExternalLink className="size-3" />
                        View / Download
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">Link unavailable</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
