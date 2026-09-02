import { createFileRoute, useNavigate } from "@tanstack/react-router";
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

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Profile & Settings — CariCare Grid" },
      {
        name: "description",
        content: "Manage your CariCare Grid profile, island, workspace role and notification preferences.",
      },
      { property: "og:title", content: "Profile & Settings — CariCare Grid" },
      { property: "og:description", content: "Your account and workspace preferences on the Grid." },
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
        <Panel>
          <PanelHeader title="Your profile" subtitle="Shown across consoles and on every audit entry" />
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
          <PanelHeader title="Notifications" subtitle="What the Grid pushes to you while you work" />
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
      </div>
    </div>
  );
}
