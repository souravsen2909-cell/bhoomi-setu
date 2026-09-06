import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Tier =
  | "central_ministry"
  | "state_government"
  | "district_authority"
  | "implementing_agency"
  | "landowner"
  | "public";

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  role_id: number;
  role_name: string;
  tier: Tier;
  is_active: boolean;
};

export const landingPathForTier = (tier: Tier): string => {
  switch (tier) {
    case "central_ministry":
    case "state_government":
      return "/dashboard";
    case "implementing_agency":
      return "/projects";
    case "district_authority":
      return "/projects";
    default:
      return "/my-land";
  }
};

// Reads only the caller's own record. The caller is verified by the auth
// middleware before any privileged read happens.
export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Profile | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id, full_name, email, role_id, is_active, roles(name, tier)")
      .eq("id", context.userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    const role = data.roles as unknown as { name: string; tier: Tier } | null;
    return {
      id: data.id,
      full_name: data.full_name,
      email: data.email,
      role_id: data.role_id,
      role_name: role?.name ?? "Unknown role",
      tier: role?.tier ?? "public",
      is_active: data.is_active ?? true,
    };
  });
