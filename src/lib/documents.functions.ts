import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const DOCUMENTS_BUCKET = "documents";

export type EntityDocument = {
  id: string;
  file_name: string;
  version: number;
  uploaded_at: string | null;
  uploaded_by: string | null;
  uploader_name: string | null;
  /** Short-lived signed link; the bucket is private. */
  url: string | null;
};

type EntityRef = { entityType: string; entityId: string };

function validateRef(input: EntityRef): EntityRef {
  const entityType = (input?.entityType ?? "").trim();
  const entityId = (input?.entityId ?? "").trim();
  if (!entityType) throw new Error("Missing document category.");
  if (!entityId) throw new Error("Missing record reference.");
  return { entityType, entityId };
}

export const getEntityDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateRef)
  .handler(async ({ data }): Promise<EntityDocument[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("documents")
      .select("id, file_name, file_url, version, uploaded_at, uploaded_by, users(full_name)")
      .eq("entity_type", data.entityType)
      .eq("entity_id", data.entityId)
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);

    return Promise.all(
      (rows ?? []).map(async (row) => {
        const uploader = (row.users ?? null) as unknown as { full_name: string } | null;
        let url: string | null = null;
        if (row.file_url) {
          const path = row.file_url.startsWith("http") ? null : row.file_url;
          if (path) {
            const { data: signed } = await supabaseAdmin.storage
              .from(DOCUMENTS_BUCKET)
              .createSignedUrl(path, 60 * 10);
            url = signed?.signedUrl ?? null;
          } else {
            url = row.file_url;
          }
        }
        return {
          id: row.id,
          file_name: row.file_name,
          version: row.version ?? 1,
          uploaded_at: row.uploaded_at,
          uploaded_by: row.uploaded_by,
          uploader_name: uploader?.full_name ?? null,
          url,
        };
      }),
    );
  });

type UploadInput = EntityRef & {
  fileName: string;
  contentType: string;
  /** Base64-encoded file contents (no data: prefix). */
  contentBase64: string;
};

const MAX_BYTES = 20 * 1024 * 1024;

export const uploadEntityDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UploadInput) => {
    const ref = validateRef(input);
    const fileName = (input.fileName ?? "").trim();
    if (!fileName) throw new Error("Choose a file to upload.");
    if (fileName.length > 200) throw new Error("That file name is too long.");
    const contentBase64 = input.contentBase64 ?? "";
    if (!contentBase64) throw new Error("The file appears to be empty.");
    if (contentBase64.length * 0.75 > MAX_BYTES) throw new Error("Files must be under 20 MB.");
    return {
      ...ref,
      fileName,
      contentType: input.contentType || "application/octet-stream",
      contentBase64,
    };
  })
  .handler(async ({ data, context }): Promise<{ id: string; version: number }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Only the central ministry may attach documents to the record.
    const { data: caller, error: callerError } = await supabaseAdmin
      .from("users")
      .select("id, roles(tier)")
      .eq("id", context.userId)
      .maybeSingle();
    if (callerError) throw new Error(callerError.message);
    const role = (caller?.roles ?? null) as unknown as { tier: string } | null;
    if ((role?.tier ?? "public") !== "central_ministry")
      throw new Error("Only the central ministry can upload documents.");

    const { data: latest, error: latestError } = await supabaseAdmin
      .from("documents")
      .select("version")
      .eq("entity_type", data.entityType)
      .eq("entity_id", data.entityId)
      .order("version", { ascending: false })
      .limit(1);
    if (latestError) throw new Error(latestError.message);
    const version = (latest?.[0]?.version ?? 0) + 1;

    const bytes = Buffer.from(data.contentBase64, "base64");
    const safeName = data.fileName.replace(/[^A-Za-z0-9._-]/g, "_");
    const path = `${data.entityType}/${data.entityId}/v${version}-${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(DOCUMENTS_BUCKET)
      .upload(path, bytes, { contentType: data.contentType, upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const { data: inserted, error } = await supabaseAdmin
      .from("documents")
      .insert({
        entity_type: data.entityType,
        entity_id: data.entityId,
        file_name: data.fileName,
        file_url: path,
        version,
        uploaded_by: context.userId,
        uploaded_at: new Date().toISOString(),
      })
      .select("id, version")
      .single();
    if (error) {
      await supabaseAdmin.storage.from(DOCUMENTS_BUCKET).remove([path]);
      throw new Error(error.message);
    }
    return { id: inserted.id, version: inserted.version ?? version };
  });
