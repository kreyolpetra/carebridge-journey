import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Panel, PanelHeader, Pill } from "@/components/grid";
import { toast } from "sonner";

/**
 * Patient-side continuous monitoring: a reading taken at home goes straight
 * into the record and is checked against the patient's own baseline on arrival.
 */
export function HomeReadingCard({ patientId }: { patientId: string }) {
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
      if (sys === null && glu === null) throw new Error("Enter a blood pressure or a sugar reading.");

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
      return raised.length;
    },
    onSuccess: (n) => {
      setSystolic("");
      setDiastolic("");
      setGlucose("");
      setFeedback(
        n > 0
          ? "Thanks — that reading is higher than your usual. Your care team has been alerted and will contact you."
          : "Thanks — your reading is saved and looks in line with your usual range.",
      );
      toast.success("Reading sent to your care team");
      void qc.invalidateQueries({ queryKey: ["patient-bundle", patientId] });
      void qc.invalidateQueries({ queryKey: ["detection_signals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Panel>
      <PanelHeader
        title="Send a reading from home"
        subtitle="No clinic visit needed — your care team sees it straight away"
        right={
          <Pill className="border-primary/40 bg-primary/10 text-primary">
            <Activity className="h-3 w-3" /> monitored
          </Pill>
        }
      />
      <div className="space-y-3 px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Top number" value={systolic} onChange={setSystolic} placeholder="148" />
          <Field label="Bottom number" value={diastolic} onChange={setDiastolic} placeholder="92" />
          <Field label="Sugar (mmol/L)" value={glucose} onChange={setGlucose} placeholder="7.8" />
        </div>
        <button
          onClick={() => send.mutate()}
          disabled={send.isPending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[13.5px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> {send.isPending ? "Sending…" : "Send to my care team"}
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
