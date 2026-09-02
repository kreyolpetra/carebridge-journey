import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABEL } from "@/lib/demo-accounts";
import { firstName } from "@/lib/names";

const TOUR: Record<string, { title: string; points: string[] }> = {
  patient: {
    title: "Your health line",
    points: [
      "Message the Grid in your own words — Patois, Creole or English.",
      "AI triage reads your vitals and tells you what to do next.",
      "Messages queue safely offline and send when signal returns.",
    ],
  },
  clinician: {
    title: "Your escalation queue",
    points: [
      "Patients are ordered by deterioration risk, not arrival time.",
      "Every record is assembled across islands, with consent enforced.",
      "Accept a cross-island teleconsult in one click.",
    ],
  },
  ministry: {
    title: "Regional coordination",
    points: [
      "See risk, capacity and specialty gaps across all islands.",
      "Track medication stockouts before they become emergencies.",
      "Measure care value retained in-region instead of flown out.",
    ],
  },
  insurer: {
    title: "Adherence economics",
    points: [
      "Reward measured adherence with premium credits.",
      "Watch avoidable admissions and leakage fall in real time.",
      "Price risk on live NCD control, not last year's claims.",
    ],
  },
};

export function OnboardingDialog() {
  const { profile, role, refreshProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile && !profile.onboarded) setOpen(true);
  }, [profile]);

  const tour = TOUR[role] ?? TOUR['patient']!;

  const finish = async () => {
    setSaving(true);
    if (profile) await supabase.from("profiles").update({ onboarded: true }).eq("id", profile.id);
    await refreshProfile();
    setSaving(false);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : void finish())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            Welcome to CariCare Grid, {profile ? firstName(profile.full_name) : "there"}
          </DialogTitle>
          <DialogDescription>
            You're signed in as {ROLE_LABEL[role] ?? role}. Here's what this workspace does for you.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="font-display text-[14px] font-semibold">{tour.title}</p>
          <ul className="mt-2 space-y-2">
            {tour.points.map((p) => (
              <li key={p} className="flex gap-2 text-[13px] text-muted-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Tip: press <kbd className="rounded border border-border px-1 font-mono">⌘K</kbd> anywhere to jump to a
          patient or surface.
        </p>
        <Button onClick={finish} disabled={saving} className="w-full">
          {saving ? "Setting up…" : "Enter the Grid"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
