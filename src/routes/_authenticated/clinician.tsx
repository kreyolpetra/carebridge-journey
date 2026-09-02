import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Sparkles, ShieldAlert } from "lucide-react";
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
import { useLogRecordAccess } from "@/lib/audit";
import { BreakGlassButton } from "@/components/BreakGlassButton";
import { Panel, PanelHeader, Pill, Loading, Stat } from "@/components/grid";
import { bandClasses, severityClasses, shortDate, timeAgo } from "@/lib/format";

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
  const bundle = useQuery(patientBundleQuery(selected));
  const qc = useQueryClient();
  useLogRecordAccess(selected, "Full clinical record (clinician console)");

  const queue = useMemo(() => {
    const byPatient = new Map<string, RiskScore>();
    for (const r of risks.data ?? []) {
      const prev = byPatient.get(r.patient_id);
      if (!prev || new Date(r.computed_at) > new Date(prev.computed_at)) byPatient.set(r.patient_id, r);
    }
    const pmap = new Map((patients.data ?? []).map((p) => [p.id, p] as const));
    return [...byPatient.values()]
      .map((r) => ({ risk: r, patient: pmap.get(r.patient_id) }))
      .filter((row): row is { risk: RiskScore; patient: Patient } => Boolean(row.patient))
      .filter((row) => bandFilter === "all" || row.risk.band === bandFilter)
      .sort((a, b) => b.risk.score - a.risk.score)
      .slice(0, 40);
  }, [risks.data, patients.data, bandFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { critical: 0, high: 0, moderate: 0, low: 0 };
    for (const r of risks.data ?? []) if (c[r.band] !== undefined) c[r.band] = (c[r.band] ?? 0) + 1;
    return c;
  }, [risks.data]);

  const acceptConsult = useMutation({
    mutationFn: async (referralId: string) => {
      const { error } = await supabase.from("referrals").update({ status: "accepted" }).eq("id", referralId);
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
  const providerName = (id: string | null) => providers.data?.find((p) => p.id === id)?.full_name ?? "Unassigned";

  // Sensitive categories are gated independently of the care relationship, so
  // the chart must apply the same rule the agent does. Without this the console
  // rendered entries the agent had just refused to read.
  const grantedCategories = useMemo(
    () => new Set((b?.grants ?? []).filter((g) => g.status === "granted").flatMap((g) => g.scope)),
    [b?.grants],
  );
  const visibleConditions = useMemo(
    () =>
      (b?.conditions ?? []).filter((c) => {
        const s = (c as { sensitivity?: string }).sensitivity;
        return !s || s === "standard" || grantedCategories.has(s);
      }),
    [b?.conditions, grantedCategories],
  );
  const withheldConditions = (b?.conditions.length ?? 0) - visibleConditions.length;

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

  const chartData = useMemo(
    () =>
      (b?.vitals ?? [])
        .slice()
        .reverse()
        .map((v) => ({
          date: shortDate(v.measured_at),
          systolic: v.systolic,
          diastolic: v.diastolic,
          glucose: v.glucose_mmol ? Number(v.glucose_mmol) : null,
        })),
    [b?.vitals],
  );

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-8">
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Critical" value={counts["critical"] ?? 0} hint="Contact today" tone="critical" />
        <Stat label="High" value={counts["high"] ?? 0} hint="Contact this week" />
        <Stat label="Moderate" value={counts["moderate"] ?? 0} hint="Monitoring" />
        <Stat label="Stable" value={counts["low"] ?? 0} hint="Self-management" tone="low" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Panel className="h-fit">
          <PanelHeader
            title="Escalation queue"
            subtitle="Ordered by deterioration risk, not arrival time"
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
          </div>
        </Panel>

        <div className="space-y-4">
          {!b ? (
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
              <Panel>
                <PanelHeader
                  title={`${b.patient.full_name} · ${b.patient.age}${b.patient.sex}`}
                  subtitle={`${b.patient.parish}, ${b.patient.island_code} · ${b.patient.km_to_facility} km from care · ${b.patient.insurer ?? "Uninsured"}`}
                  right={
                    <div className="flex items-center gap-2">
                      {b.risk ? <Pill className={bandClasses(b.risk.band)}>risk {b.risk.score}</Pill> : null}
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
                      <BreakGlassButton patientId={b.patient.id} />
                    </div>
                  }
                />
                <div className="grid gap-4 p-5 md:grid-cols-3">
                  <div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Conditions
                    </h4>
                    <ul className="mt-2 space-y-1 text-[13px]">
                      {visibleConditions.map((c) => (
                        <li key={c.id}>
                          {c.name}{" "}
                          <span className="text-muted-foreground">since {new Date(c.diagnosed_on).getFullYear()}</span>
                        </li>
                      ))}
                      {/* Redaction, not concealment: the clinician is told a
                          restricted entry exists rather than being shown a chart
                          that silently looks complete. */}
                      {withheldConditions > 0 ? (
                        <li className="flex items-start gap-1.5 text-high">
                          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            {withheldConditions} restricted{" "}
                            {withheldConditions === 1 ? "entry" : "entries"} withheld — no active grant
                          </span>
                        </li>
                      ) : null}
                      {!visibleConditions.length && !withheldConditions ? (
                        <li className="text-muted-foreground">None recorded</li>
                      ) : null}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Medications
                    </h4>
                    <ul className="mt-2 space-y-1 text-[13px]">
                      {b.medications.map((m) => (
                        <li key={m.id}>
                          {m.name} {m.dosage}{" "}
                          <span className={m.adherence_pct < 70 ? "text-critical" : "text-muted-foreground"}>
                            · {m.adherence_pct}% adherence · {m.days_supply_left}d supply
                          </span>
                        </li>
                      ))}
                      {!b.medications.length ? <li className="text-muted-foreground">None recorded</li> : null}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Risk drivers
                    </h4>
                    <ul className="mt-2 space-y-1 text-[13px]">
                      {(b.risk?.drivers ?? []).map((d) => (
                        <li key={d.label} className="flex justify-between gap-3">
                          <span className="text-muted-foreground">{d.label}</span>
                          <span className="mono-num">+{d.points}</span>
                        </li>
                      ))}
                      {!b.risk ? <li className="text-muted-foreground">Not yet scored</li> : null}
                    </ul>
                  </div>
                </div>
              </Panel>

              <div className="grid gap-4 lg:grid-cols-2">
                <Panel>
                  <PanelHeader title="Blood pressure" subtitle="Home readings via WhatsApp" />
                  <div className="h-[220px] p-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid stroke="var(--color-border)" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} minTickGap={24} />
                        <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} width={32} domain={[50, 200]} />
                        <Tooltip
                          contentStyle={{
                            background: "var(--color-card)",
                            border: "1px solid var(--color-border)",
                            borderRadius: 10,
                            fontSize: 12,
                          }}
                        />
                        <Line type="monotone" dataKey="systolic" stroke="var(--color-critical)" dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey="diastolic" stroke="var(--color-primary)" dot={false} strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
                <Panel>
                  <PanelHeader title="Glucose" subtitle="mmol/L" />
                  <div className="h-[220px] p-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <CartesianGrid stroke="var(--color-border)" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} minTickGap={24} />
                        <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} width={32} />
                        <Tooltip
                          contentStyle={{
                            background: "var(--color-card)",
                            border: "1px solid var(--color-border)",
                            borderRadius: 10,
                            fontSize: 12,
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="glucose"
                          stroke="var(--color-moderate)"
                          fill="var(--color-moderate)"
                          fillOpacity={0.18}
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Panel>
                  <PanelHeader title="Triage history" subtitle="Every inbound message, clinically read" />
                  <div className="max-h-[320px] space-y-3 overflow-y-auto p-5">
                    {b.triage.map((t) => (
                      <div key={t.id} className="rounded-lg border border-border bg-surface p-3">
                        <div className="flex items-center justify-between gap-2">
                          <Pill className={severityClasses(t.severity)}>{t.severity.replace("_", " ")}</Pill>
                          <span className="text-[11.5px] text-muted-foreground">{timeAgo(t.created_at)}</span>
                        </div>
                        <div className="mt-2 text-[13px] font-semibold">{t.category}</div>
                        <p className="mt-1 text-[12.5px] text-muted-foreground">{t.rationale}</p>
                      </div>
                    ))}
                    {!b.triage.length ? (
                      <p className="text-[13px] text-muted-foreground">No triage events yet for this patient.</p>
                    ) : null}
                  </div>
                </Panel>

                <Panel>
                  <PanelHeader title="Referrals & teleconsults" subtitle="Cross-island routing for this patient" />
                  <div className="max-h-[320px] space-y-3 overflow-y-auto p-5">
                    {b.referrals.map((r) => (
                      <div key={r.id} className="rounded-lg border border-border bg-surface p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-semibold">
                            {r.specialty} · {providerName(r.to_provider_id)}
                          </span>
                          <Pill className="border-border bg-background text-muted-foreground">{r.status}</Pill>
                        </div>
                        <p className="mt-1 text-[12.5px] text-muted-foreground">
                          {r.cross_island ? "Cross-island" : "On-island"} · local wait {r.wait_days_local}d → routed{" "}
                          {r.wait_days_routed}d · ${r.retained_value_usd.toLocaleString()} retained in-region
                        </p>
                        {r.status === "routed" ? (
                          <button
                            onClick={() => acceptConsult.mutate(r.id)}
                            className="mt-2 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground"
                          >
                            Open teleconsult
                          </button>
                        ) : null}
                      </div>
                    ))}
                    {!b.referrals.length ? (
                      <p className="text-[13px] text-muted-foreground">No referrals raised yet.</p>
                    ) : null}
                  </div>
                </Panel>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
