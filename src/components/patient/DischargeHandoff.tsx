/**
 * The hospital hand-off, sitting in the chart until somebody takes it on.
 *
 * The strip is deliberately loud while unacknowledged and quiet afterwards.
 * An accepted discharge is history; an unaccepted one is a patient nobody has
 * agreed to follow up, and there is a date on it.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Hospital, Pill as PillIcon, CalendarClock, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { facilitiesQuery, patientsQuery } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import {
  dischargesQuery,
  daysSince,
  isOverdue,
  DISCHARGE_ACCEPTED_COPY,
  type Discharge,
} from "@/lib/discharge";
import { Pill } from "@/components/grid";
import { shortDate } from "@/lib/format";

export function DischargeHandoff({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const discharges = useQuery(dischargesQuery);
  const facilities = useQuery(facilitiesQuery);
  const patients = useQuery(patientsQuery);

  /** The most recent one, since an older discharge is not the live question. */
  const d = useMemo(() => {
    const mine = (discharges.data ?? []).filter((x: Discharge) => x.patient_id === patientId);
    return mine.length ? mine[0]! : null;
  }, [discharges.data, patientId]);

  const accept = useMutation({
    mutationFn: async () => {
      if (!d) return;
      const { error } = await supabase
        .from("discharges")
        .update({
          acknowledged_at: new Date().toISOString(),
          acknowledged_by_provider_id: profile?.provider_id ?? null,
        })
        .eq("id", d.id);
      if (error) throw new Error(error.message);

      const patient = (patients.data ?? []).find((p) => p.id === patientId);
      const language = patient?.language ?? "en";
      await supabase.from("messages").insert({
        patient_id: patientId,
        direction: "out",
        body: DISCHARGE_ACCEPTED_COPY[language] ?? DISCHARGE_ACCEPTED_COPY["en"]!,
        kind: "text",
        language,
        channel: "whatsapp",
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["discharges"] });
      void qc.invalidateQueries({ queryKey: ["messages"] });
      toast("Follow-up accepted", { description: "The patient has been told on their care line." });
    },
    onError: (e: Error) => toast("Could not accept", { description: e.message }),
  });

  if (!d) return null;

  const from = (facilities.data ?? []).find((f) => f.id === d.from_facility_id);
  const days = daysSince(d.discharged_at);
  const overdue = isOverdue(d);
  const open = !d.acknowledged_at;

  return (
    <div
      className={
        "mb-4 rounded-xl border px-4 py-3 " +
        (overdue
          ? "border-critical/40 bg-critical/10"
          : open
            ? "border-high/40 bg-high/10"
            : "border-border bg-surface")
      }
    >
      <div className="flex flex-wrap items-start gap-2.5">
        <Hospital
          className={
            "mt-0.5 h-4 w-4 shrink-0 " +
            (overdue ? "text-critical" : open ? "text-high" : "text-muted-foreground")
          }
        />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold">
            Discharged from {from?.name ?? "hospital"} · {days === 0 ? "today" : `${days}d ago`}
            {overdue ? (
              <Pill className="border-critical/40 bg-critical/20 text-critical">
                follow-up overdue
              </Pill>
            ) : open ? (
              <Pill className="border-high/40 bg-high/20 text-high">needs follow-up</Pill>
            ) : (
              <Pill className="border-low/40 bg-low/10 text-low">
                <Check className="h-3 w-3" />
                accepted
              </Pill>
            )}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed">{d.summary}</p>
          {d.medication_changes ? (
            <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] leading-relaxed">
              <PillIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-semibold">Medication changed: </span>
                {d.medication_changes}
              </span>
            </p>
          ) : null}
          <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" />
            Asked to be seen within {d.follow_up_days || 7} days of {shortDate(d.discharged_at)}
            {d.acknowledged_at ? ` · accepted ${shortDate(d.acknowledged_at)}` : ""}
          </p>

          {open ? (
            <button
              type="button"
              onClick={() => accept.mutate()}
              disabled={accept.isPending}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-[12px] font-semibold text-primary-foreground disabled:opacity-60"
            >
              <Check className="h-3.5 w-3.5" />
              {accept.isPending ? "Accepting…" : "Accept the follow-up"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
