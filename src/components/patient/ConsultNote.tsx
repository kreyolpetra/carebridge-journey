/**
 * Writing down what happened, and closing the visit.
 *
 * The product could start a consult and never finish one. An encounter was
 * created when the call opened and then never touched again, so the journey it
 * demonstrates ended with the record in exactly the state it began: the next
 * clinician could see that a consult had occurred and nothing about what came
 * of it. On a shared record that is the most conspicuous hole there is —
 * the whole argument for pooling the record is that the next person can read
 * what the last one did.
 *
 * Two fields, kept apart on purpose. "What happened" is the history. "What
 * happens next" is the instruction, and it is the half the receiving clinic
 * actually acts on — the same reason a discharge keeps medication changes in
 * their own box rather than buried in a paragraph.
 *
 * Closing is the point: an open episode is a patient still in the building as
 * far as every count in this product is concerned, so a visit nobody closes
 * quietly inflates the clinic census and the ward list.
 */
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { NotebookPen, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Encounter } from "@/lib/org";
import { saveDraft, readDraft, clearDraft } from "@/lib/offline";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ConsultNote({
  encounter,
  patientName,
  open,
  onOpenChange,
}: {
  encounter: Encounter | null;
  patientName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [summary, setSummary] = useState("");
  const [plan, setPlan] = useState("");

  /**
   * A half-written note survives the machine dying.
   *
   * Keyed to the encounter, so two visits open in two tabs do not overwrite
   * each other, and cleared the moment the note is saved. This is the commonest
   * way a power cut could waste somebody's afternoon.
   */
  const draftKey = encounter ? `note:${encounter.id}` : null;

  useEffect(() => {
    if (!open || !draftKey) return;
    const d = readDraft<{ summary: string; plan: string }>(draftKey);
    if (d) {
      setSummary(d.summary ?? "");
      setPlan(d.plan ?? "");
    }
  }, [open, draftKey]);

  useEffect(() => {
    if (!open || !draftKey) return;
    if (!summary && !plan) return;
    saveDraft(draftKey, { summary, plan });
  }, [open, draftKey, summary, plan]);

  const save = useMutation({
    mutationFn: async () => {
      if (!encounter) return;
      const { error } = await supabase
        .from("encounters")
        .update({
          summary: summary.trim(),
          plan: plan.trim(),
          // Closing the episode is half the job: an open one counts as a
          // patient still present everywhere else in the product.
          status: "closed",
          ended_at: new Date().toISOString(),
        })
        .eq("id", encounter.id);
      if (error) throw new Error(error.message);

      await supabase.from("workflow_events").insert({
        patient_id: encounter.patient_id,
        actor_id: profile?.provider_id ?? profile?.id ?? null,
        actor_name: profile?.full_name ?? "Clinician",
        action: "consult_note_recorded",
        label: `Visit closed — ${summary.trim().slice(0, 60)}`,
        detail: plan.trim(),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["encounters"] });
      void qc.invalidateQueries({ queryKey: ["workflow_events"] });
      if (draftKey) clearDraft(draftKey);
      onOpenChange(false);
      setSummary("");
      setPlan("");
      toast("Visit closed", {
        description: "The note is on the record for whoever sees them next.",
      });
    },
    onError: (e: Error) => toast("Could not save the note", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <NotebookPen className="h-4 w-4 text-primary" />
            Close the visit · {patientName}
          </DialogTitle>
          <DialogDescription>
            {encounter?.reason ? `${encounter.reason}. ` : ""}
            This goes on the shared record, so the next clinician to open this patient reads what
            you did rather than only that you saw them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cn-summary">What happened</Label>
            <Textarea
              id="cn-summary"
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Reviewed blood pressure — 168/98 on today's reading, symptomatic on standing…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cn-plan">What happens next</Label>
            <Textarea
              id="cn-plan"
              rows={2}
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              placeholder="Amlodipine increased to 10mg. Home readings twice daily. Review in 2 weeks."
            />
            {/* Separate on purpose — this is the half the receiving clinic acts on. */}
            <p className="text-[11.5px] text-muted-foreground">
              Kept apart from the history because this is the part somebody has to do.
            </p>
          </div>

          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={!summary.trim() || save.isPending}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save note and close the visit"}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
