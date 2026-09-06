import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile } from "@/lib/profile.functions";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

export function useProfile() {
  const { session, loading } = useSession();
  const fetchProfile = useServerFn(getMyProfile);

  const query = useQuery({
    queryKey: ["my-profile", session?.user.id ?? null],
    queryFn: () => fetchProfile({}),
    enabled: !!session,
  });

  return {
    session,
    sessionLoading: loading,
    profile: query.data ?? null,
    isLoading: loading || (!!session && query.isLoading),
    error: query.error,
  };
}
