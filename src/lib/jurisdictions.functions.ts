import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Tier } from "@/lib/profile.functions";

export type JurisdictionLevel = "national" | "state" | "district";

export type Jurisdiction = {
  id: string;
  name: string;
  level: JurisdictionLevel;
  parent_id: string | null;
  parent_name: string | null;
};

export const MANAGE_TIERS: Tier[] = ["central_ministry", "state_government"];

async function callerTier(userId: string): Promise<Tier> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, roles(tier)")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const role = (data?.roles ?? null) as unknown as { tier: Tier } | null;
  return role?.tier ?? "public";
}

// Any signed-in user may read the jurisdiction list: it feeds dropdowns
// across project creation and user administration.
export const getJurisdictions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<Jurisdiction[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("jurisdictions")
      .select("id, name, level, parent_id")
      .order("level", { ascending: true })
      .order("name", { ascending: true })
      .range(0, 4999);
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const byId = new Map(rows.map((r) => [r.id, r.name]));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      level: (r.level as JurisdictionLevel) ?? "district",
      parent_id: r.parent_id ?? null,
      parent_name: r.parent_id ? (byId.get(r.parent_id) ?? null) : null,
    }));
  });

export type NewJurisdiction = {
  name: string;
  level: "state" | "district";
  parent_id: string | null;
};

export const createJurisdiction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: NewJurisdiction) => {
    const name = input.name?.trim() ?? "";
    if (!name) throw new Error("Name is required.");
    if (name.length > 120) throw new Error("Name is too long.");
    if (input.level !== "state" && input.level !== "district") {
      throw new Error("Level must be state or district.");
    }
    if (input.level === "district" && !input.parent_id) {
      throw new Error("A district needs a parent state.");
    }
    return {
      name,
      level: input.level,
      parent_id: input.level === "district" ? input.parent_id : (input.parent_id ?? null),
    } satisfies NewJurisdiction;
  })
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const tier = await callerTier(context.userId);
    if (!MANAGE_TIERS.includes(tier)) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.level === "district" && data.parent_id) {
      const { data: parent, error: parentError } = await supabaseAdmin
        .from("jurisdictions")
        .select("id, level")
        .eq("id", data.parent_id)
        .maybeSingle();
      if (parentError) throw new Error(parentError.message);
      if (!parent || parent.level !== "state") throw new Error("Parent must be an existing state.");
    }

    let parentId = data.parent_id;
    if (data.level === "state" && !parentId) {
      const { data: national } = await supabaseAdmin
        .from("jurisdictions")
        .select("id")
        .eq("level", "national")
        .limit(1)
        .maybeSingle();
      parentId = national?.id ?? null;
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("jurisdictions")
      .insert({ name: data.name, level: data.level, parent_id: parentId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });
