import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getEntityDocuments, uploadEntityDocument } from "@/lib/documents.functions";
import { Skeleton } from "@/components/states";
import { Button } from "@/components/ui/button";

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
  });
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
  title = "Documents",
  canUpload = true,
}: Props) {
  const queryClient = useQueryClient();
  const loadDocs = useServerFn(getEntityDocuments);
  const upload = useServerFn(uploadEntityDocument);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const queryKey = ["documents", entityType, entityId];

  const documentsQuery = useQuery({
    queryKey,
    queryFn: () => loadDocs({ data: { entityType, entityId } }),
  });

  const mutation = useMutation({
    mutationFn: async (file: File) => {
      const contentBase64 = await toBase64(file);
      return upload({
        data: {
          entityType,
          entityId,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          contentBase64,
        },
      });
    },
    onSuccess: async (result) => {
      toast.success(`Uploaded as version ${result.version}`);
      if (inputRef.current) inputRef.current.value = "";
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(error.message || "Could not upload the file"),
    onSettled: () => setBusy(false),
  });

  const docs = documentsQuery.data ?? [];

  return (
    <section className="mt-6 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          {title}
        </h3>
        {canUpload ? (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              className="max-w-[220px] text-xs text-muted-foreground"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBusy(true);
                mutation.mutate(file);
              }}
              disabled={busy || mutation.isPending}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || mutation.isPending}
              onClick={() => inputRef.current?.click()}
            >
              {mutation.isPending ? "Uploading…" : "Choose file"}
            </Button>
          </div>
        ) : null}
      </div>

      {documentsQuery.isLoading ? (
        <div className="mt-3 space-y-2" role="status" aria-live="polite">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </div>
      ) : documentsQuery.isError ? (
        <p className="mt-3 text-sm text-destructive">
          {(documentsQuery.error as Error).message || "Could not load documents."}
        </p>
      ) : docs.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No documents uploaded yet — attach a scanned copy to keep the record complete.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <span className="text-sm font-medium text-card-foreground">
                {doc.url ? (
                  <a href={doc.url} target="_blank" rel="noreferrer" className="hover:underline">
                    {doc.file_name}
                  </a>
                ) : (
                  doc.file_name
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                Version {doc.version} · {formatDate(doc.uploaded_at)}
                {doc.uploader_name ? ` · ${doc.uploader_name}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
