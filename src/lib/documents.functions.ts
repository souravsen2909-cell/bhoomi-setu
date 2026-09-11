import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const DOCUMENTS_BUCKET = "documents";

export type EntityDocument = {
  id: string;
  file_name: string;
  description: string | null;
  version: number;
  uploaded_at: string | null;
  uploaded_by: string | null;
  uploader_name: string | null;
  /** Long-lived signed link (7 days); the bucket is private. */
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

    // Gather all related entity IDs (e.g. project <-> proposals) so documents show on both pages!
    let targetIds: string[] = [data.entityId];

    if (data.entityType === "project") {
      const { data: props } = await supabaseAdmin
        .from("proposals")
        .select("id")
        .eq("project_id", data.entityId);
      if (props && props.length > 0) {
        targetIds = [...targetIds, ...props.map((p) => p.id)];
      }
    } else if (data.entityType === "proposal") {
      const { data: prop } = await supabaseAdmin
        .from("proposals")
        .select("project_id")
        .eq("id", data.entityId)
        .maybeSingle();
      if (prop?.project_id) {
        targetIds = [...targetIds, prop.project_id];
        const { data: siblingProps } = await supabaseAdmin
          .from("proposals")
          .select("id")
          .eq("project_id", prop.project_id);
        if (siblingProps && siblingProps.length > 0) {
          targetIds = Array.from(new Set([...targetIds, ...siblingProps.map((p) => p.id)]));
        }
      }
    }

    const { data: rows, error } = await supabaseAdmin
      .from("documents")
      .select(
        "id, file_name, file_url, checksum, version, uploaded_at, uploaded_by, users(full_name)",
      )
      .in("entity_id", targetIds)
      .order("uploaded_at", { ascending: false });
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
              .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days
            url = signed?.signedUrl ?? null;
          } else {
            url = row.file_url;
          }
        }
        return {
          id: row.id,
          file_name: row.file_name,
          description: row.checksum ?? null,
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
  description?: string;
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
    const description = (input.description ?? "").trim().slice(0, 500);
    return {
      ...ref,
      fileName,
      contentType: input.contentType || "application/octet-stream",
      contentBase64,
      description: description || undefined,
    };
  })
  .handler(async ({ data, context }): Promise<{ id: string; version: number }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Check caller permission
    const { data: caller, error: callerError } = await supabaseAdmin
      .from("users")
      .select("id, roles(tier)")
      .eq("id", context.userId)
      .maybeSingle();
    if (callerError) throw new Error(callerError.message);
    const role = (caller?.roles ?? null) as unknown as { tier: string } | null;
    const tier = role?.tier ?? "public";
    if (
      tier !== "central_ministry" &&
      tier !== "implementing_agency" &&
      tier !== "state_government" &&
      tier !== "district_authority"
    ) {
      throw new Error("Only authorized administrative accounts can upload official documents.");
    }

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
        checksum: data.description || null,
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

    // If document was uploaded for a proposal, also link it for the project so both direct and indirect queries succeed
    if (data.entityType === "proposal") {
      const { data: prop } = await supabaseAdmin
        .from("proposals")
        .select("project_id")
        .eq("id", data.entityId)
        .maybeSingle();
      if (prop?.project_id) {
        await supabaseAdmin.from("documents").insert({
          entity_type: "project",
          entity_id: prop.project_id,
          file_name: data.fileName,
          checksum: data.description || null,
          file_url: path,
          version,
          uploaded_by: context.userId,
          uploaded_at: new Date().toISOString(),
        });
      }
    }

    return { id: inserted.id, version: inserted.version ?? version };
  });
