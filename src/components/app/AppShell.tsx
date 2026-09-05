import { useState } from "react";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { LogOut, Menu, Search, User2, Radio, ShieldQuestion } from "lucide-react";
import { NetworkToggle } from "@/components/NetworkToggle";
import { NotificationsMenu } from "@/components/app/NotificationsMenu";
import { CommandPalette } from "@/components/app/CommandPalette";
import { OnboardingDialog } from "@/components/app/OnboardingDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimeGrid } from "@/hooks/useRealtime";
import { navFor } from "@/lib/nav";
import { useScope } from "@/hooks/useScope";
import { ROLE_LABEL } from "@/lib/demo-accounts";
import { cn } from "@/lib/utils";
import { firstName, initials } from "@/lib/names";

/**
 * Leave the app by reloading rather than by routing.
 *
 * Signing out client-side raced the layout guard: clearing the session makes
 * `_authenticated`'s beforeLoad throw its own redirect to /auth while the menu
 * is navigating there too, and with two transitions in flight the app could
 * lock the main thread outright — reproducibly, with a heartbeat timer
 * stopping dead on the click.
 *
 * A reload cannot race anything. It also tears down every cached query, which
 * is the behaviour you want when the next thing someone does is sign in as a
 * different persona: no chance of one role's data lingering behind another's.
 * The app cold-starts in about 200ms, so this costs nothing a demo would feel.
 */
function hardResetToSignIn() {
  const url = new URL(window.location.href);
  url.hash = "#/auth";
  window.location.replace(url.toString());
  window.location.reload();
}

function Brand({ onDark = false }: { onDark?: boolean }) {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2.5">
      <span
        className={
          "grid h-8 w-8 place-items-center rounded-lg " +
          (onDark ? "bg-sidebar-gold/12 text-sidebar-gold" : "bg-primary/12 text-primary")
        }
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
        >
          <path d="M3 12h4l2-6 3 13 3-9 2 2h4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span
        className={
          "font-display text-[15px] font-bold tracking-tight " +
          (onDark ? "text-sidebar-foreground" : "")
        }
      >
        CariCare
        <span className={onDark ? "text-sidebar-gold" : "text-primary"}> Grid</span>
      </span>
    </Link>
  );
}

function SidebarNav({ role, onNavigate }: { role: string; onNavigate?: () => void }) {
  const { staffRole } = useScope();
  const items = navFor(role, staffRole);
  const groups = ["Work", "Account"] as const;

  return (
    <nav className="flex flex-col gap-4 px-3 py-4">
      {groups.map((group) => {
        const groupItems = items.filter((i) => i.group === group);
        if (!groupItems.length) return null;
        return (
          <div key={group}>
            <p className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-sidebar-gold-muted/85">
              {group}
            </p>
            <div className="flex flex-col gap-0.5">
              {groupItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  activeOptions={{ exact: item.to === "/" }}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium text-sidebar-muted transition-colors hover:bg-sidebar-raised hover:text-sidebar-foreground"
                  activeProps={{
                    className:
                      "bg-sidebar-raised !text-sidebar-foreground border-l-[3px] border-sidebar-gold pl-[9px] shadow-[inset_0_1px_0_oklch(1_0_0/6%)]",
                  }}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

/**
 * A clinical account that has not been confirmed by its facility holds the role
 * but none of its reach. Gating at the shell rather than per route means a new
 * surface cannot forget to check — there is no authenticated page a pending
 * account can render.
 */
function PendingVerification({ onSignOut }: { onSignOut: () => void }) {
  const { profile } = useAuth();
  return (
    <div className="grid min-h-screen place-items-center px-6 py-12">
      <div className="w-full max-w-[520px]">
        <div className="flex items-center gap-2.5">
          <Brand />
        </div>
        <div className="panel mt-6 p-8">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-high/12 text-high">
            <ShieldQuestion className="h-5 w-5" />
          </span>
          <h1 className="mt-4 font-display text-[22px] font-bold tracking-tight">
            Awaiting facility confirmation
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
            Your account is registered as a clinical account
            {profile?.licence_no ? ` against registration ${profile.licence_no}` : ""}. Someone at
            your facility has to confirm that before any patient record opens to you.
          </p>
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
            This is not a queue you can skip. A clinical role reaches other people's records, so it
            is not something an account can assert about itself.
          </p>
          <button
            onClick={onSignOut}
            className="mt-6 rounded-lg border border-border px-3.5 py-2 text-[13px] font-semibold hover:bg-surface"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { session, profile, loading, role, signOut } = useAuth();
  const navigate = useNavigate();
  const live = useRealtimeGrid();

  const name = profile?.full_name ?? "Grid user";

  // Until the profile resolves we know the session but not the role, and
  // useAuth falls back to "patient". Rendering on that fallback would show a
  // brand-new clinician the patient home for a beat — and, worse, skip the
  // verification gate below, which needs the profile to fire at all.
  if (loading || (session && !profile)) {
    return (
      <div className="grid min-h-screen place-items-center">
        <p className="text-[13px] text-muted-foreground">Opening your workspace…</p>
      </div>
    );
  }

  if (profile && profile.verification_status === "pending") {
    return (
      <PendingVerification
        onSignOut={() => {
          void signOut().then(hardResetToSignIn);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Said once, permanently, at the top of the product rather than in a
          pitch deck: what this is, and what it does not decide. */}
      <div className="w-full bg-sidebar px-4 py-1.5 text-center text-[11.5px] font-medium text-sidebar-muted">
        Prototype · synthetic data only · no diagnosis, prescribing or discharge decisions —
        clinical judgement stays human
      </div>
      <div className="flex min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-sidebar-border bg-sidebar lg:flex">
          <div className="flex h-16 items-center border-b border-sidebar-border px-5">
            <Brand onDark />
          </div>
          <div className="flex-1 overflow-y-auto">
            <SidebarNav role={role} />
          </div>
          <div className="border-t border-sidebar-border px-4 py-4">
            <NetworkToggle onDark />
          </div>
        </aside>

        {mobileOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              aria-label="Close navigation"
              className="absolute inset-0 bg-foreground/30"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 flex w-[248px] flex-col border-r border-sidebar-border bg-sidebar">
              <div className="flex h-16 items-center border-b border-sidebar-border px-5">
                <Brand onDark />
              </div>
              <div className="flex-1 overflow-y-auto">
                <SidebarNav role={role} onNavigate={() => setMobileOpen(false)} />
              </div>
              <div className="border-t border-sidebar-border px-4 py-4">
                <NetworkToggle onDark />
              </div>
            </aside>
          </div>
        ) : null}

        <div className="flex min-h-screen w-full flex-col lg:pl-[248px]">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/80 bg-card/88 px-4 shadow-[0_1px_0_oklch(0.24_0.04_264/4%),0_8px_24px_-16px_oklch(0.24_0.04_264/22%)] backdrop-blur-xl sm:px-5">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-foreground lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="lg:hidden">
              <Brand />
            </div>

            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="ml-auto flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground lg:ml-0 lg:w-[380px]"
            >
              <Search className="h-4 w-4" />
              <span className="hidden lg:inline">Search patients, surfaces, actions…</span>
              <kbd className="ml-auto hidden rounded border border-border px-1.5 py-0.5 font-mono text-[10.5px] lg:inline">
                ⌘K
              </kbd>
            </button>

            <div className="ml-auto flex items-center gap-2">
              <span
                className={cn(
                  "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium sm:flex",
                  live
                    ? "border-low/40 bg-low/10 text-low"
                    : "border-border bg-surface text-muted-foreground",
                )}
                title={live ? "Realtime connected" : "Connecting to realtime…"}
              >
                <Radio className="h-3 w-3" />
                {live ? "Live" : "Connecting"}
              </span>

              <NotificationsMenu />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Account menu"
                    className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card pl-1 pr-2.5"
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-md bg-primary/12 text-[11px] font-bold text-primary">
                      {initials(name)}
                    </span>
                    <span className="hidden text-[13px] font-medium sm:inline">
                      {firstName(name)}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>
                    <p className="text-[13.5px] font-semibold">{name}</p>
                    <p className="text-[12px] font-normal text-muted-foreground">
                      {ROLE_LABEL[role] ?? role}
                      {profile?.organisation ? ` · ${profile.organisation}` : ""}
                    </p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void navigate({ to: "/settings" })}>
                    <User2 className="mr-2 h-4 w-4" /> Profile & settings
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      void signOut().then(hardResetToSignIn);
                    }}
                  >
                    <LogOut className="mr-2 h-4 w-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <main className="flex-1">
            <Outlet />
          </main>
        </div>

        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <OnboardingDialog />
      </div>
    </div>
  );
}
