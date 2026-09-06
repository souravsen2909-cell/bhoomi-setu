import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "./client";

export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      return next(token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
    } catch {
      return next();
    }
  },
);
