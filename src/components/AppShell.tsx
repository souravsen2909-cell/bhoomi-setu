import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { landingPathForTier, type Profile, type Tier } from "@/lib/profile.functions";
import { MANAGE_TIERS } from "@/lib/jurisdictions.functions";

import { FILE_TIERS, REVIEW_TIERS } from "@/lib/disputes.functions";
import { DASHBOARD_TIERS } from "@/lib/dashboard.functions";
import { PROJECT_BOARD_TIERS } from "@/lib/agency.functions";
import { AlertsBell } from "@/components/AlertsBell";
import { BrandLockup, BrandMark } from "@/components/Brand";

type NavItem = { to: string; label: string; hint: string; allow: Tier[] | null };

const WORKFLOW_TIERS: Tier[] = [
  "central_ministry",
  "state_government",
  "district_authority",
  "implementing_agency",
];
const DISPUTE_TIERS = [...FILE_TIERS, ...REVIEW_TIERS] as Tier[];

const NAV: NavItem[] = [
  {
    to: "/dashboard",
    label: "Dashboard",
    hint: "Programme overview",
    allow: DASHBOARD_TIERS as Tier[],
  },
  {
    to: "/projects",
    label: "Projects",
    hint: "Projects & parcels",
    allow: PROJECT_BOARD_TIERS as Tier[],
  },
  { to: "/workflow", label: "Workflow", hint: "Proposals & awards", allow: WORKFLOW_TIERS },
  { to: "/my-land", label: "My land", hint: "Parcels & compensation", allow: ["landowner"] },
  { to: "/disputes", label: "Disputes", hint: "File & resolve", allow: DISPUTE_TIERS },

  {
    to: "/jurisdictions",
    label: "Jurisdictions",
    hint: "States & districts",
    allow: MANAGE_TIERS as Tier[],
  },
  { to: "/map", label: "Parcel map", hint: "Parcel status map", allow: null },
];

function visibleNav(profile: Profile | null | undefined) {
  return NAV.filter((item) => !item.allow || (profile ? item.allow.includes(profile.tier) : false));
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session, profile, isLoading } = useProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);

  const items = visibleNav(profile);
  const current = items.find((i) => i.to === pathname);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const navList = (
    <nav className="space-y-1">
      {items.map((item) => {
        const active = pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setMenuOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-6 w-0.5 rounded-full ${active ? "bg-gold" : "bg-sidebar-border"}`}
            />
            <span className="min-w-0">
              <span className="block truncate font-medium">{item.label}</span>
              <span
                className={`block truncate text-[0.7rem] ${
                  active ? "text-sidebar-primary-foreground/75" : "text-sidebar-foreground/45"
                }`}
              >
                {item.hint}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 lg:flex">
        <Link to={profile ? landingPathForTier(profile.tier) : "/"} className="px-1">
          <BrandLockup tone="dark" />
        </Link>
        <div className="mt-7 flex-1 overflow-y-auto">
          <p className="px-3 pb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/40">
            Navigation
          </p>
          {navList}
        </div>
        <div className="mt-4 rounded-xl border border-sidebar-border bg-sidebar-accent/50 p-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
              {profile ? initials(profile.full_name) : "—"}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-medium text-sidebar-foreground">
                {isLoading ? "Loading…" : (profile?.full_name ?? session?.user.email ?? "Guest")}
              </span>
              <span className="block truncate text-[0.7rem] capitalize text-sidebar-foreground/55">
                {profile?.role_name?.replace(/_/g, " ") ?? "No role assigned"}
              </span>
            </span>
          </div>
          <button
            onClick={handleSignOut}
            className="mt-3 w-full rounded-md border border-sidebar-border px-3 py-1.5 text-xs font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            Log out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <button
              onClick={() => setMenuOpen(true)}
              className="inline-flex size-9 items-center justify-center rounded-lg border border-border text-foreground lg:hidden"
              aria-label="Open navigation"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <p className="eyebrow hidden sm:block">
                {profile?.role_name?.replace(/_/g, " ") ?? "Register"}
              </p>
              <p className="truncate font-display text-sm font-semibold text-foreground">
                {current?.label ?? "Land Acquisition Register"}
              </p>
            </div>
            {session ? <AlertsBell /> : null}
            <Button
              variant="outline"
              size="sm"
              className="hidden lg:inline-flex"
              onClick={handleSignOut}
            >
              Log out
            </Button>
          </div>
        </header>

        <div className="min-w-0 flex-1">{children}</div>

        <footer className="border-t border-border px-4 py-5 text-xs text-muted-foreground sm:px-6">
          Bhoomi Setu · Land Acquisition Register · Records are maintained under the applicable land
          acquisition rules.
        </footer>
      </div>

      {/* Mobile drawer */}
      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close navigation"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-foreground/50 backdrop-blur-sm"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-sidebar px-4 py-5 shadow-float">
            <div className="flex items-center justify-between">
              <BrandLockup tone="dark" />
              <button
                onClick={() => setMenuOpen(false)}
                className="inline-flex size-8 items-center justify-center rounded-md text-sidebar-foreground/70"
                aria-label="Close navigation"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="mt-6 flex-1 overflow-y-auto">{navList}</div>
            <button
              onClick={handleSignOut}
              className="mt-4 w-full rounded-md border border-sidebar-border px-3 py-2 text-sm font-medium text-sidebar-foreground/85"
            >
              Log out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PublicTopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link to="/" className="min-w-0">
          <BrandLockup />
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Link
            to="/auth"
            className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-card transition-colors hover:bg-primary/90"
          >
            Login
          </Link>
        </div>
      </div>
    </header>
  );
}

export { BrandMark };
