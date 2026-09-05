import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Radar, Activity, Check, Radio, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { patientsQuery, riskScoresQuery } from "@/lib/api";
import { detectionSignalsQuery, METRIC_LABEL, SEVERITY_TONE } from "@/lib/prevention";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Prevention } from "@/components/outreach/Prevention";
import { Panel, PanelHeader, Pill, Stat, Loading } from "@/components/grid";
import { timeAgo } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/detection")({
  head: () => ({
    meta: [
      { title: "Early Detection — Catch Deterioration Before Crisis | CareBridge Journey" },
      {
        name: "description",
        content:
          "Home cuff and glucometer readings stream into CareBridge, trends are compared against each patient's own baseline, and clinicians get a worklist of people drifting toward crisis.",
      },
      { property: "og:title", content: "Early Detection — CareBridge Journey" },
      {
        property: "og:description",
        content:
          "Continuous vitals ingestion and trend-based deterioration alerts across the Caribbean.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Detection,
});

type HomeReading = {
  id: string;
  patient_id: string;
  measured_at: string;
  systolic: number | null;
  diastolic: number | null;
  glucose_mmol: number | null;
  device: string | null;
  reported_by: string;
};

function Detection() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const signals = useQuery(detectionSignalsQuery);
  const patients = useQuery(patientsQuery);
  const risks = useQuery(riskScoresQuery);
  const [filter, setFilter] = useState<"all" | "urgent" | "elevated" | "watch">("all");

  const homeReadings = useQuery({
    queryKey: ["home_readings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vitals")
        .select(
          "id, patient_id, measured_at, systolic, diastolic, glucose_mmol, device, reported_by",
        )
        .eq("source", "home")
        .order("measured_at", { ascending: false })
        .limit(30);
      if (error) throw new Error(error.message);
      return (data ?? []) as HomeReading[];
    },
    staleTime: 5_000,
  });

  const patientById = useMemo(
    () => new Map((patients.data ?? []).map((p) => [p.id, p])),
    [patients.data],
  );

  const open = (signals.data ?? []).filter((s) => s.status === "open");
  const shown = filter === "all" ? open : open.filter((s) => s.severity === filter);

  const counts = {
    urgent: open.filter((s) => s.severity === "urgent").length,
    elevated: open.filter((s) => s.severity === "elevated").length,
    watch: open.filter((s) => s.severity === "watch").length,
  };

  const sweep = useMutation({
    mutationFn: async () => {
      const top = (risks.data ?? []).slice(0, 25);
      let raised = 0;
      for (const r of top) {
        const { data } = await supabase.rpc("detect_trend", { p_patient: r.patient_id });
        for (const t of data ?? []) {
          const dup = (signals.data ?? []).some(
            (s) => s.patient_id === r.patient_id && s.metric === t.metric && s.status === "open",
          );
          if (dup) continue;
          await supabase.from("detection_signals").insert({
            patient_id: r.patient_id,
            kind: "trend",
            metric: t.metric,
            current_value: t.current_value,
            baseline_value: t.baseline_value,
            delta_pct: t.delta_pct,
            severity: t.severity,
            narrative: t.narrative,
            recommended_action: t.recommended_action,
          });
          raised += 1;
        }
      }
      return raised;
    },
    onSuccess: (n) => {
      toast.success(
        n > 0 ? `${n} new signal(s) raised` : "Sweep complete — no new deterioration found",
      );
      void qc.invalidateQueries({ queryKey: ["detection_signals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const acknowledge = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("detection_signals")
        .update({
          status: "actioned",
          acknowledged_by: profile?.full_name ?? "Care team",
          acknowledged_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Signal actioned");
      void qc.invalidateQueries({ queryKey: ["detection_signals"] });
    },
  });

  // Detection emits the signals that prevention acts on — one loop that used to
  // be two nav entries. Same screen, two tabs.
  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-8">
      <Tabs defaultValue="signals">
        <TabsList>
          <TabsTrigger value="signals">Signals</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
        </TabsList>

        <TabsContent value="signals" className="mt-4">
          <div className="space-y-5">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                  Early detection
                </p>
                <h1 className="font-display text-[26px] font-semibold tracking-tight">
                  Deterioration, days before the crisis
                </h1>
                <p className="mt-1 max-w-3xl text-[13.5px] text-muted-foreground">
                  Every reading — home cuff, glucometer, community screening or clinic device — is
                  compared against that patient's own 40-day baseline. Drift raises a signal with a
                  named action, long before an emergency presentation.
                </p>
              </div>
              <button
                onClick={() => sweep.mutate()}
                disabled={sweep.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
              >
                <Radar className={`h-4 w-4 ${sweep.isPending ? "animate-spin" : ""}`} />
                {sweep.isPending ? "Scanning cohort…" : "Run detection sweep"}
              </button>
            </header>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Urgent signals" value={counts.urgent} hint="Act today" tone="critical" />
              <Stat label="Elevated" value={counts.elevated} hint="Within the week" />
              <Stat label="Watch" value={counts.watch} hint="Trend forming" tone="low" />
              <Stat
                label="Home readings"
                value={homeReadings.data?.length ?? 0}
                hint="Streaming in without a clinic visit"
                tone="signal"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {(["all", "urgent", "elevated", "watch"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold capitalize ${
                    filter === f
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {f} ({f === "all" ? open.length : counts[f]})
                </button>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <Panel>
                <PanelHeader
                  title="Early-warning worklist"
                  subtitle="Newest first · each signal names the next action"
                />
                {signals.isLoading ? (
                  <Loading />
                ) : shown.length === 0 ? (
                  <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">
                    Nothing drifting right now. Run a sweep to re-check the cohort.
                  </p>
                ) : (
                  <div className="max-h-[620px] divide-y divide-border overflow-y-auto">
                    {shown.map((s) => {
                      const p = patientById.get(s.patient_id);
                      return (
                        <div key={s.id} className="px-5 py-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 text-[13.5px] font-semibold">
                                <Activity className="h-4 w-4 text-primary" />
                                {p?.full_name ?? "Patient"}
                                <span className="text-[12px] font-normal text-muted-foreground">
                                  {p ? `${p.age} · ${p.parish}, ${p.island_code}` : ""}
                                </span>
                              </p>
                              <p className="mt-1 text-[13px]">{s.narrative}</p>
                              <p className="mt-1 text-[12.5px] text-primary">
                                {s.recommended_action}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <Pill
                                className={SEVERITY_TONE[s.severity] ?? SEVERITY_TONE["watch"]!}
                              >
                                {s.severity}
                              </Pill>
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {timeAgo(s.detected_at)}
                              </p>
                            </div>
                          </div>
                          <div className="mt-2.5 flex flex-wrap items-center gap-2">
                            <Pill className="border-border bg-muted text-muted-foreground">
                              {METRIC_LABEL[s.metric] ?? s.metric}
                              {s.current_value != null ? ` ${s.current_value}` : ""}
                              {s.baseline_value != null ? ` vs ${s.baseline_value}` : ""}
                            </Pill>
                            {s.kind === "home_reading" ? (
                              <Pill className="border-primary/40 bg-primary/10 text-primary">
                                <Smartphone className="h-3 w-3" /> from home
                              </Pill>
                            ) : null}
                            <Link
                              to="/clinician"
                              search={{ patient: s.patient_id }}
                              className="rounded-lg border border-border px-2.5 py-1 text-[12px] font-semibold hover:bg-muted"
                            >
                              Open chart
                            </Link>
                            <button
                              onClick={() => acknowledge.mutate(s.id)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-[12px] font-semibold text-primary-foreground"
                            >
                              <Check className="h-3.5 w-3.5" /> Actioned
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>

              <Panel>
                <PanelHeader
                  title="Live reading stream"
                  subtitle="Home cuffs, glucometers and community screening"
                  right={
                    <Pill className="border-low/40 bg-low/10 text-low">
                      <Radio className="h-3 w-3" /> ingesting
                    </Pill>
                  }
                />
                <div className="max-h-[620px] divide-y divide-border overflow-y-auto">
                  {(homeReadings.data ?? []).map((v) => {
                    const p = patientById.get(v.patient_id);
                    return (
                      <div key={v.id} className="flex items-start justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold">{p?.full_name ?? "Patient"}</p>
                          <p className="text-[12px] text-muted-foreground">
                            {v.systolic ? `${v.systolic}/${v.diastolic} mmHg` : ""}
                            {v.systolic && v.glucose_mmol ? " · " : ""}
                            {v.glucose_mmol ? `${v.glucose_mmol} mmol/L` : ""}
                          </p>
                          <p className="text-[11.5px] text-muted-foreground">
                            {v.device ?? "device"} · {v.reported_by}
                          </p>
                        </div>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {timeAgo(v.measured_at)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="campaigns" className="mt-4">
          <Prevention />
        </TabsContent>
      </Tabs>
    </div>
  );
}
