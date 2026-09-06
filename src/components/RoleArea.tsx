import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useProfile } from "@/hooks/useProfile";
import { landingPathForTier, type Tier } from "@/lib/profile.functions";
import { PageHeader, SectionCard } from "@/components/PageHeader";

export function RoleArea({
  allow,
  title,
  description,
}: {
  allow: Tier[];
  title: string;
  description: string;
}) {
  const { profile, isLoading } = useProfile();
  const navigate = useNavigate();

  const tier = profile?.tier;
  useEffect(() => {
    if (!tier) return;
    if (!allow.includes(tier)) {
      navigate({ to: landingPathForTier(tier), replace: true });
    }
  }, [tier, allow, navigate]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title={title} description={description} />
      <div className="mt-6">
        <SectionCard title="Your account">
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Loading your account…"
              : profile
                ? `Signed in as ${profile.full_name} · ${profile.role_name}`
                : "No record found for this account."}
          </p>
        </SectionCard>
      </div>
    </main>
  );
}
