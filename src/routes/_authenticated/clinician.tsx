import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  HERO_PATIENT_ID,
  islandsQuery,
  patientBundleQuery,
  patientsQuery,
  providersQuery,
  riskScoresQuery,
  type Patient,
  type RiskScore,
} from "@/lib/api";
import { runClinicianBrief } from "@/lib/agents/clinician";
import { AgentBrief } from "@/components/app/AgentBrief";
import { useAuth } from "@/hooks/useAuth";
import { useScope } from "@/hooks/useScope";
import { useLogRecordAccess } from "@/lib/audit";
import { useAccessIndex, type AccessDecision } from "@/lib/access-basis";
import { PatientChart } from "@/components/patient/PatientChart";
import { NoBasisPanel } from "@/components/patient/NoBasisPanel";
import { Panel, PanelHeader, Pill, Loading, Stat } from "@/components/grid";
import { bandClasses } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/clinician")({
  head: () => ({
    meta: [
      { title: "Clinician Console — Risk-Ranked NCD Queue | CariCare Grid" },
      {
        name: "description",
        content:
          "A queue ordered by clinical risk instead of arrival time, with the patient's whole longitudinal record assembled from fragmented island systems.",
      },
      { property: "og:title", content: "Clinician Console — Risk-Ranked NCD Queue" },
      {
        property: "og:description",
        content: "See who is deteriorating before they arrive at the emergency room.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { patient?: string } =>
    typeof search["patient"] === "string" ? { patient: search["patient"] as string } : {},
  component: Clinician,
});

function Clinician() {
  const search = Route.useSearch();
  const { profile } = useAuth();
  const [selected, setSelected] = useState(search.patient ?? HERO_PATIENT_ID);
  const [bandFilter, setBandFilter] = useState<string>("all");
  const patients = useQuery(patientsQuery);
  const risks = useQuery(riskScoresQuery);
  const providers = useQuery(providersQuery);
  const { index: access, ready: accessReady } = useAccessIndex();

  const decision = useMemo<AccessDecision | null>(
    () => (accessReady && selected ? access.decide(selected) : null),
    [access, accessReady, selected],
  );

  // The chart is not fetched at all without a basis. Refusing to render a
  // record we already pulled into the browser would be theatre, not access
  // control.
  const bundle = useQuery({ ...patientBundleQuery(selected), enabled: decision?.allowed === true });
  const qc = useQueryClient();
  useLogRecordAccess(selected, "Full clinical record (clinician console)", decision);

  /**
   * The queue is the reader's own panel, not the region's. Every row is
   * resolved against the access model; patients with no lawful basis are
   * counted but never named, so the console still tells a clinician how much
   * regional need sits outside their reach without leaking who those people
   * are.
   */
  const { queue, restricted } = useMemo(() => {
    const byPatient = new Map<string, RiskScore>();
    for (const r of risks.data ?? []) {
      const prev = byPatient.get(r.patient_id);
      if (!prev || new Date(r.computed_at) > new Date(prev.computed_at))
        byPatient.set(r.patient_id, r);
    }
    const pmap = new Map((patients.data ?? []).map((p) => [p.id, p] as const));
    const rows = [...byPatient.values()]
      .map((r) => ({ risk: r, patient: pmap.get(r.patient_id) }))
      .filter((row): row is { risk: RiskScore; patient: Patient } => Boolean(row.patient))
      .filter((row) => bandFilter === "all" || row.risk.band === bandFilter);

    if (!accessReady) return { queue: [], restricted: 0 };

    const mine: { risk: RiskScore; patient: Patient; decision: AccessDecision }[] = [];
    let withheld = 0;
    for (const row of rows) {
      const d = access.decide(row.patient.id);
      if (d.allowed) mine.push({ ...row, decision: d });
      else withheld += 1;
    }
    return {
      queue: mine.sort((a, b) => b.risk.score - a.risk.score).slice(0, 40),
      restricted: withheld,
    };
  }, [risks.data, patients.data, bandFilter, access, accessReady]);

  // Band counts follow the same rule: they describe the panel this clinician is
  // responsible for, not every scored patient in eleven countries.
  const counts = useMemo(() => {
    const c: Record<string, number> = { critical: 0, high: 0, moderate: 0, low: 0 };
    if (!accessReady) return c;
    const byPatient = new Map<string, RiskScore>();
    for (const r of risks.data ?? []) {
      const prev = byPatient.get(r.patient_id);
      if (!prev || new Date(r.computed_at) > new Date(prev.computed_at))
        byPatient.set(r.patient_id, r);
    }
    for (const r of byPatient.values()) {
      if (!access.decide(r.patient_id).allowed) continue;
      if (c[r.band] !== undefined) c[r.band] = (c[r.band] ?? 0) + 1;
    }
    return c;
  }, [risks.data, access, accessReady]);

  const acceptConsult = useMutation({
    mutationFn: async (referralId: string) => {
      const { error } = await supabase
        .from("referrals")
        .update({ status: "accepted" })
        .eq("id", referralId);
      if (error) throw new Error(error.message);
      await supabase.from("consultations").insert({
        referral_id: referralId,
        patient_id: selected,
        status: "in_progress",
        notes: "Teleconsult opened from the clinician console.",
      });
    },
    onSuccess: () => {
      toast.success("Teleconsult opened — patient notified on WhatsApp");
      qc.invalidateQueries();
    },
  });

  const b = bundle.data;
  // ---- pre-consult brief agent -------------------------------------------
  const islands = useQuery(islandsQuery);
  const [briefFor, setBriefFor] = useState<string | null>(null);
  const [briefDecision, setBriefDecision] = useState<"accepted" | "dismissed" | null>(null);

  const brief = useMemo(() => {
    if (!b || briefFor !== selected) return null;
    const island = (islands.data ?? []).find((i) => i.code === b.patient.island_code);
    return runClinicianBrief({
      patient: b.patient,
      vitals: b.vitals,
      medications: b.medications,
      conditions: b.conditions,
      messages: b.messages,
      risk: b.risk,
      referrals: b.referrals,
      grants: b.grants,
      actor: { name: profile?.full_name ?? "Clinician", island: profile?.island_code ?? null },
      localSpecialties: [
        ...new Set(
          (providers.data ?? [])
            .filter((p) => p.island_code === b.patient.island_code)
            .map((p) => p.specialty),
        ),
      ],
      islandTier: island?.tier,
    });
  }, [b, briefFor, selected, islands.data, providers.data, profile]);

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-8">
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat
          label="Critical"
          value={counts["critical"] ?? 0}
          hint="Contact today"
          tone="critical"
        />
        <Stat label="High" value={counts["high"] ?? 0} hint="Contact this week" />
        <Stat label="Moderate" value={counts["moderate"] ?? 0} hint="Monitoring" />
        <Stat label="Stable" value={counts["low"] ?? 0} hint="Self-management" tone="low" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Panel className="h-fit">
          <PanelHeader
            title="Escalation queue"
            subtitle="Your panel, ordered by deterioration risk, not arrival time"
            right={
              <select
                value={bandFilter}
                onChange={(e) => setBandFilter(e.target.value)}
                className="rounded-lg border border-border bg-background px-2 py-1 text-[12px]"
              >
                <option value="all">All bands</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="moderate">Moderate</option>
                <option value="low">Stable</option>
              </select>
            }
          />
          <div className="max-h-[720px] overflow-y-auto p-2">
            {risks.isLoading ? <Loading label="Scoring the panel…" /> : null}
            {queue.map(({ risk, patient }) => (
              <button
                key={patient.id}
                onClick={() => setSelected(patient.id)}
                className={
                  "mb-1 w-full rounded-lg px-3 py-2.5 text-left transition-colors " +
                  (patient.id === selected ? "bg-primary/12" : "hover:bg-surface")
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13.5px] font-semibold">{patient.full_name}</span>
                  <span className="mono-num text-[15px] font-semibold">{risk.score}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <Pill className={bandClasses(risk.band)}>{risk.band}</Pill>
                  <span className="truncate text-[11.5px] text-muted-foreground">
                    {patient.parish}, {patient.island_code} · {risk.trend}
                  </span>
                </div>
              </button>
            ))}
            {accessReady && !queue.length ? (
              <p className="px-3 py-6 text-[13px] text-muted-foreground">
                No patients in your panel. A referral you accept, an episode at your facility, or a
                consent grant from the patient will place someone here.
              </p>
            ) : null}
          </div>
          {restricted > 0 ? (
            <div className="flex items-start gap-2 border-t border-border px-4 py-3 text-[12px] text-muted-foreground">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <strong className="font-semibold text-foreground">{restricted}</strong> further
                scored {restricted === 1 ? "patient" : "patients"} in the region sit outside your
                lawful access. Accept a referral, record an episode, or request the patient's
                consent to see who they are.
              </span>
            </div>
          ) : null}
        </Panel>

        <div className="space-y-4">
          {decision && !decision.allowed ? (
            <NoBasisPanel patientId={selected} decision={decision} />
          ) : !b ? (
            <Panel>
              <Loading label="Assembling the longitudinal record…" />
            </Panel>
          ) : (
            <>
              {brief && (
                <AgentBrief
                  run={brief}
                  decision={briefDecision}
                  onAccept={() => {
                    setBriefDecision("accepted");
                    void supabase.from("workflow_events").insert({
                      patient_id: b.patient.id,
                      actor_name: profile?.full_name ?? "Clinician",
                      action: "agent_brief_accepted",
                      label: "Pre-consult brief accepted",
                      detail: JSON.stringify({
                        engine: brief.model,
                        findings: brief.findings.length,
                        confidence: brief.confidence,
                      }),
                    });
                    toast.success("Brief accepted — recorded against this episode");
                  }}
                  onDismiss={() => {
                    setBriefDecision("dismissed");
                    void supabase.from("workflow_events").insert({
                      patient_id: b.patient.id,
                      actor_name: profile?.full_name ?? "Clinician",
                      action: "agent_brief_dismissed",
                      label: "Pre-consult brief dismissed",
                      detail: JSON.stringify({ engine: brief.model }),
                    });
                    toast("Brief dismissed — nothing written to the record");
                  }}
                />
              )}
              <PatientChart
                bundle={b}
                decision={decision}
                providers={providers.data ?? []}
                onAcceptReferral={(id) => acceptConsult.mutate(id)}
                headerActions={
                  <button
                    type="button"
                    onClick={() => {
                      setBriefFor(selected);
                      setBriefDecision(null);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-[12.5px] font-medium text-primary transition-colors hover:bg-primary/20"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {briefFor === selected ? "Re-run brief" : "Prepare consult brief"}
                  </button>
                }
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
