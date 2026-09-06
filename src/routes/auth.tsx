import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile, landingPathForTier } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicTopBar } from "@/components/AppShell";
import { BrandMark } from "@/components/Brand";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Bhoomi Setu Land Acquisition Register" },
      {
        name: "description",
        content:
          "Secure sign-in for officers, agencies and landowners of the land acquisition register.",
      },
      { property: "og:title", content: "Sign in — Bhoomi Setu Land Acquisition Register" },
      {
        property: "og:description",
        content:
          "Secure sign-in for officers, agencies and landowners of the land acquisition register.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const ROLES = [
  { title: "Ministry & state", copy: "Programme dashboards, projects and jurisdictions." },
  { title: "District & agency", copy: "Proposals, awards, parcels and possession." },
  { title: "Landowners", copy: "Your parcels, compensation and disputes." },
];

function AuthPage() {
  const navigate = useNavigate();
  const fetchProfile = useServerFn(getMyProfile);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active || !data.session) return;
      const profile = await fetchProfile({}).catch(() => null);
      if (!active || !profile) return;
      navigate({ to: landingPathForTier(profile.tier), replace: true });
    });
    return () => {
      active = false;
    };
  }, [fetchProfile, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      setError(signInError.message);
      setBusy(false);
      return;
    }
    try {
      const profile = await fetchProfile({});
      if (!profile) {
        setError("Your sign-in worked, but no record was found for this account.");
        setBusy(false);
        return;
      }
      if (!profile.is_active) {
        await supabase.auth.signOut();
        setError("This account has been deactivated. Contact your administrator.");
        setBusy(false);
        return;
      }
      navigate({ to: landingPathForTier(profile.tier), replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your account details.");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicTopBar />
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:gap-14 lg:py-16">
        <section className="relative order-2 hidden overflow-hidden rounded-2xl brand-gradient p-8 text-primary-foreground shadow-card lg:order-1 lg:block">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -left-20 bottom-[-6rem] size-72 rounded-full bg-gold/15 blur-3xl"
          />
          <div className="relative">
            <BrandMark />
            <h2 className="mt-6 font-display text-3xl font-semibold leading-tight">
              One record for every parcel, from notification to possession.
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-primary-foreground/75">
              A single register that keeps officers, agencies and landowners looking at the same
              facts — areas, awards, compensation and disputes.
            </p>
            <ul className="mt-8 space-y-4">
              {ROLES.map((r) => (
                <li key={r.title} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-1 h-full w-0.5 shrink-0 rounded-full bg-gold/70"
                  />
                  <span>
                    <span className="block text-sm font-semibold">{r.title}</span>
                    <span className="block text-sm text-primary-foreground/70">{r.copy}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="order-1 lg:order-2">
          <div className="surface mx-auto w-full max-w-md p-6 sm:p-8">
            <p className="eyebrow">Secure access</p>
            <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-card-foreground">
              Sign in to the register
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Accounts are issued by your administrator. There is no public registration.
            </p>

            <form onSubmit={onSubmit} className="mt-7 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@department.gov.in"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error ? (
                <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <Button type="submit" className="h-11 w-full" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <p className="mt-6 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
              Looking for parcel status only? The{" "}
              <a href="/" className="font-medium text-primary hover:underline">
                public map
              </a>{" "}
              needs no login and never shows landowner names.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
