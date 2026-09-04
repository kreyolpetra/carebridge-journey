/**
 * The escort on an appointment: whether one is needed, who it is, and the two
 * things a clinic can do about it.
 *
 * Deliberately not a blocker. The rule that says "this patient cannot go home
 * alone" is real, but a screen that refuses to let anyone past it gets worked
 * around by lunchtime — the same reason the safety panel grades its findings
 * instead of stopping everything. What this does is make the gap visible while
 * there is still time to close it, and give somebody a button that closes it.
 *
 * See lib/escort.ts for why any of this matters and what is stored.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserCheck, UserX, MessageCircle, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Consultation, Patient } from "@/lib/api";
import { escortNeed, ESCORT_REQUEST_COPY, escortConfirmedMessage } from "@/lib/escort";
import { Pill } from "@/components/grid";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function hoursLabel(h: number) {
  if (h < 1) return "within the hour";
  if (h < 24) return `in ${Math.round(h)}h`;
  return `in ${Math.round(h / 24)}d`;
}

/** The one-glance state, used on both the clinic list and the patient's own. */
export function EscortPill({ consultation }: { consultation: Consultation }) {
  const need = escortNeed(consultation);
  if (!need.required) return null;

  if (need.confirmed) {
    return (
      <Pill className="border-low/40 bg-low/10 text-low">
        <UserCheck className="h-3 w-3" />
        {need.escortName}
        {need.escortRelationship ? ` · ${need.escortRelationship}` : ""}
      </Pill>
    );
  }
  if (need.atRisk) {
    return (
      <Pill className="border-critical/40 bg-critical/10 text-critical">
        <UserX className="h-3 w-3" />
        no escort · {hoursLabel(need.hoursAway)}
      </Pill>
    );
  }
  return (
    <Pill className="border-high/40 bg-high/10 text-high">
      <ShieldAlert className="h-3 w-3" />
      escort needed
    </Pill>
  );
}

/** What the patient is told on their own appointment list. */
export function EscortNoteForPatient({ consultation }: { consultation: Consultation }) {
  const need = escortNeed(consultation);
  if (!need.required) return null;
  return (
    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
      {need.confirmed ? (
        <>
          <UserCheck className="mr-1 inline h-3.5 w-3.5 text-low" />
          {need.escortName} is bringing you home. Nothing else to arrange.
        </>
      ) : (
        <>
          <ShieldAlert className="mr-1 inline h-3.5 w-3.5 text-high" />
          You will need an adult to bring you home and stay with you — you will not be able to
          travel on your own.
        </>
      )}
    </p>
  );
}

/**
 * The clinic's two actions: ask the patient, or write down the answer.
 *
 * Asking is one message on the care line in the patient's own language, and it
 * is recorded so nobody asks the same person three times.
 */
export function EscortActions({
  consultation,
  patient,
}: {
  consultation: Consultation;
  patient: Patient | null | undefined;
}) {
  const qc = useQueryClient();
  const need = escortNeed(consultation);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["consultations"] });
    void qc.invalidateQueries({ queryKey: ["messages"] });
  };

  const ask = useMutation({
    mutationFn: async () => {
      const language = patient?.language ?? "en";
      await supabase.from("messages").insert({
        patient_id: consultation.patient_id,
        direction: "out",
        body: ESCORT_REQUEST_COPY[language] ?? ESCORT_REQUEST_COPY["en"]!,
        kind: "text",
        language,
        channel: "whatsapp",
      });
      const { error } = await supabase
        .from("consultations")
        .update({ escort_asked_at: new Date().toISOString() })
        .eq("id", consultation.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      refresh();
      toast("Asked on the care line", {
        description: `Sent to ${patient?.full_name ?? "the patient"} in ${patient?.language === "jam" ? "Patois" : patient?.language === "ht" ? "Kreyòl" : patient?.language === "es" ? "Spanish" : "English"}.`,
      });
    },
    onError: (e: Error) => toast("Could not send", { description: e.message }),
  });

  const record = useMutation({
    mutationFn: async () => {
      const language = patient?.language ?? "en";
      const { error } = await supabase
        .from("consultations")
        .update({
          escort_name: name.trim(),
          escort_relationship: relationship.trim(),
          escort_confirmed_at: new Date().toISOString(),
        })
        .eq("id", consultation.id);
      if (error) throw new Error(error.message);
      // The patient is told what was written down, because an arrangement the
      // patient does not know about is not an arrangement.
      await supabase.from("messages").insert({
        patient_id: consultation.patient_id,
        direction: "out",
        body: escortConfirmedMessage(language, name.trim()),
        kind: "text",
        language,
        channel: "whatsapp",
      });
    },
    onSuccess: () => {
      refresh();
      setOpen(false);
      setName("");
      setRelationship("");
      toast("Escort recorded", { description: "The patient has been told on their care line." });
    },
    onError: (e: Error) => toast("Could not record", { description: e.message }),
  });

  if (!need.required || need.confirmed) return null;

  return (
    <>
      <span className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => ask.mutate()}
          disabled={ask.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[12px] font-semibold transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-60"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          {need.asked ? "Ask again" : "Ask the patient"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-[12px] font-semibold text-primary-foreground"
        >
          <UserCheck className="h-3.5 w-3.5" />
          Record escort
        </button>
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Who is bringing {patient?.full_name ?? "the patient"} home?</DialogTitle>
            <DialogDescription>
              {need.reason}. A name, because "yes" is not an arrangement — someone who can name a
              person has usually spoken to them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="escort-name">Name of the person bringing them</Label>
              <Input
                id="escort-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Denise Alleyne"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="escort-rel">How they know the patient</Label>
              <Input
                id="escort-rel"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                placeholder="e.g. daughter, neighbour"
              />
            </div>
            {/* Said out loud, because it is somebody else's information. */}
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Only the name and the relationship are kept. This person is not a patient here, and
              nothing else about them is recorded.
            </p>
            <button
              type="button"
              onClick={() => record.mutate()}
              disabled={!name.trim() || record.isPending}
              className="w-full rounded-lg bg-primary px-3 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {record.isPending ? "Recording…" : "Record and tell the patient"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
