import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePatientLang } from "@/hooks/usePatientLang";
import { queueWrite } from "@/lib/offline";
import { Panel, PanelHeader, Pill } from "@/components/grid";
import { toast } from "sonner";

/**
 * Patient-side continuous monitoring: a reading taken at home goes straight
 * into the record and is checked against the patient's own baseline on arrival.
 */
export function HomeReadingCard({ patientId }: { patientId: string }) {
  const { t } = usePatientLang();
  const qc = useQueryClient();
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [glucose, setGlucose] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: async () => {
      const sys = systolic ? Number(systolic) : null;
      const dia = diastolic ? Number(diastolic) : null;
      const glu = glucose ? Number(glucose) : null;
      if (sys === null && glu === null)
        throw new Error(t("Enter a blood pressure or a sugar reading."));

      // The write this feature exists for: a reading sent from a house a long
      // way from the clinic, where the signal is the thing most likely to fail.
      // Queued rather than lost when it does — and the caller is told which.
      const sent = await queueWrite(`Reading for ${patientId.slice(0, 8)}`, async () => {
        const { error } = await supabase.from("vitals").insert({
          patient_id: patientId,
          measured_at: new Date().toISOString(),
          systolic: sys,
          diastolic: dia,
          glucose_mmol: glu,
          source: "home",
          reported_by: "patient",
          device: "Home device",
        });
        if (error) throw new Error(error.message);
      });
      if (!sent) return { queued: true as const };

      const { data: trends } = await supabase.rpc("detect_trend", { p_patient: patientId });
      const raised = (trends ?? []).filter((t) => t.severity !== "watch");
      for (const t of raised) {
        await supabase.from("detection_signals").insert({
          patient_id: patientId,
          kind: "home_reading",
          metric: t.metric,
          current_value: t.current_value,
          baseline_value: t.baseline_value,
          delta_pct: t.delta_pct,
          severity: t.severity,
          narrative: t.narrative,
          recommended_action: t.recommended_action,
        });
      }
      return { queued: false as const, raised: raised.length };
    },
    onSuccess: (r) => {
      setSystolic("");
      setDiastolic("");
      setGlucose("");
      // Queued is not sent, and the patient is told which one happened.
      if (r.queued) {
        setFeedback(
          "Saved on your phone — no signal right now. It will go to your care team as soon as you are back online.",
        );
        toast.warning("Offline — the reading is waiting on your phone");
        return;
      }
      setFeedback(
        r.raised > 0
          ? "Thanks — that reading is higher than your usual. Your care team has been alerted and will contact you."
          : "Thanks — your reading is saved and looks in line with your usual range.",
      );
      toast.success(t("Reading sent to your care team"));
      void qc.invalidateQueries({ queryKey: ["patient-bundle", patientId] });
      void qc.invalidateQueries({ queryKey: ["detection_signals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Panel>
      <PanelHeader
        title={t("Send a reading from home")}
        subtitle={t("No clinic visit needed — your care team sees it straight away")}
        right={
          <Pill className="border-primary/40 bg-primary/10 text-primary">
            <Activity className="h-3 w-3" /> monitored
          </Pill>
        }
      />
      <div className="space-y-3 px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label={t("Top number")}
            value={systolic}
            onChange={setSystolic}
            placeholder="148"
          />
          <Field
            label={t("Bottom number")}
            value={diastolic}
            onChange={setDiastolic}
            placeholder="92"
          />
          <Field
            label={t("Sugar (mmol/L)")}
            value={glucose}
            onChange={setGlucose}
            placeholder="7.8"
          />
        </div>
        <button
          onClick={() => send.mutate()}
          disabled={send.isPending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[13.5px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> {send.isPending ? "Sending…" : t("Send to my care team")}
        </button>
        {feedback ? (
          <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-[12.5px] text-muted-foreground">
            {feedback}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[15px] font-normal normal-case tracking-normal text-foreground"
      />
    </label>
  );
}
