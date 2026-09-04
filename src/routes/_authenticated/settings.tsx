import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Panel, PanelHeader } from "@/components/grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABEL } from "@/lib/demo-accounts";
import { islandsQuery } from "@/lib/api";
import { resetDb } from "@/lib/mock/db";
import { Building2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Profile & Settings — CariCare Grid" },
      {
        name: "description",
        content:
          "Manage your CariCare Grid profile, island, workspace role and notification preferences.",
      },
      { property: "og:title", content: "Profile & Settings — CariCare Grid" },
      {
        property: "og:description",
        content: "Your account and workspace preferences on the Grid.",
      },
    ],
  }),
  component: SettingsPage,
});

const PREF_KEY = "caricare.prefs";

function SettingsPage() {
  const { profile, role, refreshProfile, signOut, user } = useAuth();
  const navigate = useNavigate();
  const islands = useQuery(islandsQuery);
  const [fullName, setFullName] = useState("");
  const [org, setOrg] = useState("");
  const [island, setIsland] = useState("");
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState({ criticalToasts: true, digest: true, patoisReplies: true });

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? "");
    setOrg(profile.organisation ?? "");
    setIsland(profile.island_code ?? "");
  }, [profile]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREF_KEY);
      if (raw) setPrefs((p) => ({ ...p, ...JSON.parse(raw) }));
    } catch {
      /* ignore */
    }
  }, []);

  const setPref = (key: keyof typeof prefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    window.localStorage.setItem(PREF_KEY, JSON.stringify(next));
  };

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, organisation: org, island_code: island || null })
      .eq("id", profile.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refreshProfile();
    toast.success("Profile updated");
  };

  return (
    <div className="mx-auto w-full max-w-[900px] px-5 py-8">
      <h1 className="font-display text-2xl font-bold tracking-tight">Profile & settings</h1>
      <p className="mt-1 text-[13.5px] text-muted-foreground">
        Signed in as {user?.email} · {ROLE_LABEL[role] ?? role}
      </p>

      <div className="mt-6 grid gap-4">
        {/* The workspace, as opposed to the person. Settings only ever held
            personal preferences, so there was nowhere to stand a facility up
            from — or to correct what setup guessed about it. */}
        {role !== "patient" ? (
          <Panel>
            <PanelHeader
              title="Your workspace"
              subtitle="The facility you work in, and what it has in it"
            />
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Adding a new clinic or hospital to the Grid takes four steps, and every one of them
                can be skipped.
              </p>
              <Link
                to="/setup"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground"
              >
                <Building2 className="h-3.5 w-3.5" />
                Set up a facility
              </Link>
            </div>
          </Panel>
        ) : null}

        <Panel>
          <PanelHeader
            title="Your profile"
            subtitle="Shown across consoles and on every audit entry"
          />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org">Organisation</Label>
              <Input id="org" value={org} onChange={(e) => setOrg(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="island">Home island</Label>
              <select
                id="island"
                value={island}
                onChange={(e) => setIsland(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-[13.5px]"
              >
                <option value="">Not set</option>
                {(islands.data ?? []).map((i) => (
                  <option key={i.code} value={i.code}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Workspace role</Label>
              <div className="flex h-9 items-center rounded-md border border-border bg-surface px-3 text-[13.5px] text-muted-foreground">
                {ROLE_LABEL[role] ?? role}
              </div>
            </div>
            <div className="sm:col-span-2">
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Notifications"
            subtitle="What the Grid pushes to you while you work"
          />
          <div className="divide-y divide-border">
            {[
              {
                key: "criticalToasts" as const,
                title: "Critical alert pop-ups",
                detail: "Emergency triage results and stockouts surface instantly.",
              },
              {
                key: "digest" as const,
                title: "Daily escalation digest",
                detail: "A morning list of patients who deteriorated overnight.",
              },
              {
                key: "patoisReplies" as const,
                title: "Dialect-matched replies",
                detail: "Patient responses mirror their own language variety.",
              },
            ].map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-[13.5px] font-semibold">{row.title}</p>
                  <p className="text-[12.5px] text-muted-foreground">{row.detail}</p>
                </div>
                <Switch checked={prefs[row.key]} onCheckedChange={(v) => setPref(row.key, v)} />
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Session" subtitle="End this workspace session" />
          <div className="p-4">
            <Button
              variant="outline"
              onClick={async () => {
                await signOut();
                void navigate({ to: "/auth" });
              }}
            >
              Sign out
            </Button>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Demo data" subtitle="Rebuild the seeded dataset in this browser" />
          <div className="space-y-3 p-4">
            <p className="max-w-xl text-[13px] leading-relaxed text-muted-foreground">
              The demo runs on a dataset generated once and kept in this browser, so anything you
              change here — consent decisions, accepted referrals, break-glass events — stays until
              you reset it. Rebuilding discards those changes and restores the seeded state.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                resetDb();
                toast.success("Demo data rebuilt — reloading");
                window.setTimeout(() => window.location.reload(), 400);
              }}
            >
              Rebuild demo data
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
