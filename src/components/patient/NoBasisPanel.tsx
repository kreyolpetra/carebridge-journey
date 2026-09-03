/**
 * What a clinician sees when no lawful basis resolves for a record.
 *
 * It deliberately shows nothing clinical — not even the patient's name —
 * because the point is that the reader has not established a right to know who
 * this is. The refusal itself is written to the patient's access log by
 * useLogRecordAccess on the surface that mounted this.
 *
 * It is also the only place the two ways *out* of a refusal live, which is why
 * it is shared rather than inlined: accepting the referral that was routed to
 * you, or asking the patient. Without them a refusal would be a dead end, and
 * the chart panel that normally carries "Open teleconsult" is exactly what a
 * refusal withholds.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { referralsQuery } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useScope } from "@/hooks/useScope";
import type { AccessDecision } from "@/lib/access-basis";
import { BreakGlassButton } from "@/components/BreakGlassButton";
import { Panel } from "@/components/grid";

export function NoBasisPanel({
  patientId,
  patientName,
  patientMrn,
  decision,
}: {
  patientId: string;
  /** Known where identity is shown alongside the refusal; absent otherwise. */
  patientName?: string | undefined;
  patientMrn?: string | undefined;
  decision: AccessDecision;
}) {
  const { profile } = useAuth();
  const { isAggregateOnly } = useScope();
  const qc = useQueryClient();
  const referrals = useQuery(referralsQuery);

  const pendingReferral =
    (referrals.data ?? []).find(
      (r) =>
        r.patient_id === patientId &&
        r.to_provider_id === profile?.provider_id &&
        r.status === "routed",
    ) ?? null;

  const acceptReferral = useMutation({
    mutationFn: async (referralId: string) => {
      const { error } = await supabase
        .from("referrals")
        .update({ status: "accepted" })
        .eq("id", referralId);
      if (error) throw new Error(error.message);
      await supabase.from("consultations").insert({
        referral_id: referralId,
        patient_id: patientId,
        status: "in_progress",
        notes: "Teleconsult opened from the clinician console.",
      });
    },
    onSuccess: () => {
      toast.success("Teleconsult opened — patient notified on WhatsApp");
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const requestConsent = useMutation({
    mutationFn: async () => {
      const purpose = window.prompt(
        "The patient will see this request in their care line. What are you asking to review, and why?",
        "Cross-island cardiology review of blood pressure trend and current medications",
      );
      if (!purpose) return null;
      const { error } = await supabase.from("consent_grants").insert({
        patient_id: patientId,
        provider_id: profile?.provider_id ?? null,
        scope: ["vitals", "medications", "conditions"],
        purpose,
        status: "pending",
        granted_at: null,
        expires_at: null,
      });
      if (error) throw new Error(error.message);
      return true;
    },
    onSuccess: (ok) => {
      if (!ok) return;
      toast.success("Consent request sent — the patient decides on their care line");
      void qc.invalidateQueries({ queryKey: ["consent_grants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Panel>
      <div className="flex flex-col items-start gap-4 p-8">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-critical/10 text-critical">
          <Lock className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-display text-[17px] font-semibold tracking-tight">
            No lawful basis for this record
          </h3>
          {/* Where the surface already shows the directory entry, withholding
              the name here buys no privacy and costs safety: the two actions
              below — asking this patient for consent, breaking glass on this
              patient — are consequential, and the reader has to know who they
              are about to take them against. */}
          {patientName ? (
            <p className="mt-1 text-[13.5px] font-semibold text-foreground">
              {patientName}
              {patientMrn ? (
                <span className="ml-2 font-mono text-[12px] font-medium text-muted-foreground">
                  {patientMrn}
                </span>
              ) : null}
            </p>
          ) : null}
          <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-muted-foreground">
            {decision.detail}
          </p>
          <p className="mt-3 max-w-xl text-[12.5px] leading-relaxed text-muted-foreground">
            This attempt has been recorded in the patient's access log, which they can read. Nothing
            clinical was loaded.
          </p>
        </div>
        {/* Ministry and insurer have no route to an identified record at all, so
            offering them a way to ask for one would misdescribe the model. */}
        {isAggregateOnly ? null : (
          <div className="flex flex-wrap items-center gap-2">
            {pendingReferral ? (
              <button
                onClick={() => acceptReferral.mutate(pendingReferral.id)}
                disabled={acceptReferral.isPending}
                className="rounded-lg bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-60"
              >
                {acceptReferral.isPending
                  ? "Accepting…"
                  : `Accept the ${pendingReferral.specialty.toLowerCase()} referral`}
              </button>
            ) : null}
            <button
              onClick={() => requestConsent.mutate()}
              disabled={requestConsent.isPending}
              className={
                pendingReferral
                  ? "rounded-lg border border-border px-3.5 py-2 text-[13px] font-semibold hover:bg-surface disabled:opacity-60"
                  : "rounded-lg bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-60"
              }
            >
              Request the patient's consent
            </button>
            <BreakGlassButton patientId={patientId} patientName={patientName} />
          </div>
        )}
      </div>
    </Panel>
  );
}
