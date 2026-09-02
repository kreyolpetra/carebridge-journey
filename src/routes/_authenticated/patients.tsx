/**
 * The patient directory.
 *
 * Two surfaces that look similar and are governed completely differently.
 *
 * "Your panel" is the set of people this clinician has a lawful basis for. Full
 * rows: risk band, drivers, the basis each one rests on.
 *
 * "Find a patient" searches the whole regional index and returns identity only
 * — name, age, sex, parish. Enough to confirm you have the right person and no
 * more. A clinician has to be able to find the patient standing in front of
 * them, and the app had no answer for that before this page: the only lookup
 * was the command palette, which listed every patient in eleven countries
 * complete with their risk score. Finding someone is not reading their record,
 * but a risk score is clinical data, so it does not appear here.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, Lock, Users } from "lucide-react";
import { patientsQuery, riskScoresQuery, type Patient, type RiskScore } from "@/lib/api";
import { useAccessIndex, type AccessDecision } from "@/lib/access-basis";
import { useScope } from "@/hooks/useScope";
import { BASIS_LABEL, BASIS_TONE } from "@/lib/access";
import { Panel, PanelHeader, Pill, Stat, Loading } from "@/components/grid";
import { bandClasses } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/patients")({
  head: () => ({
    meta: [
      { title: "Patients — CariCare Grid" },
      {
        name: "description",
        content:
          "Your panel of patients, and a regional patient index you can search by name to find someone before establishing a lawful basis to read their record.",
      },
    ],
  }),
  component: Patients,
});

type Row = { patient: Patient; risk: RiskScore | null; decision: AccessDecision };

function Patients() {
  const [query, setQuery] = useState("");
  const [bandFilter, setBandFilter] = useState("all");
  const patients = useQuery(patientsQuery);
  const risks = useQuery(riskScoresQuery);
  const { index: access, ready } = useAccessIndex();
  const { isAggregateOnly } = useScope();

  const latestRisk = useMemo(() => {
    const byPatient = new Map<string, RiskScore>();
    for (const r of risks.data ?? []) {
      const prev = byPatient.get(r.patient_id);
      if (!prev || new Date(r.computed_at) > new Date(prev.computed_at))
        byPatient.set(r.patient_id, r);
    }
    return byPatient;
  }, [risks.data]);

  const { panel, outside } = useMemo(() => {
    if (!ready) return { panel: [] as Row[], outside: [] as Patient[] };
    const mine: Row[] = [];
    const rest: Patient[] = [];
    for (const p of patients.data ?? []) {
      const decision = access.decide(p.id);
      if (decision.allowed) mine.push({ patient: p, risk: latestRisk.get(p.id) ?? null, decision });
      else rest.push(p);
    }
    mine.sort((a, b) => (b.risk?.score ?? 0) - (a.risk?.score ?? 0));
    return { panel: mine, outside: rest };
  }, [patients.data, access, ready, latestRisk]);

  const visiblePanel = useMemo(() => {
    const q = query.trim().toLowerCase();
    return panel.filter((r) => {
      if (bandFilter !== "all" && r.risk?.band !== bandFilter) return false;
      if (!q) return true;
      return (
        r.patient.full_name.toLowerCase().includes(q) || r.patient.parish.toLowerCase().includes(q)
      );
    });
  }, [panel, query, bandFilter]);

  // The index search only runs on a deliberate query. It never lists the region
  // by default — you look someone up, you do not browse strangers.
  const indexMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2 || isAggregateOnly) return [];
    return outside
      .filter((p) => p.full_name.toLowerCase().includes(q) || p.parish.toLowerCase().includes(q))
      .slice(0, 20);
  }, [outside, query, isAggregateOnly]);

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Patients</h1>
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
            Your panel is everyone you hold a lawful basis for. Search by name to find anyone else
            on the Grid — you will see who they are, not what is in their record.
          </p>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat
          label="In your panel"
          value={panel.length}
          hint="You may read these records"
          tone="signal"
        />
        <Stat
          label="Elsewhere in the region"
          value={outside.length}
          hint="Findable by name, records sealed"
        />
        <Stat
          label="Critical in your panel"
          value={panel.filter((r) => r.risk?.band === "critical").length}
          hint="Contact today"
          tone="critical"
        />
      </div>

      <Panel className="mb-4">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="flex min-w-[280px] flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your panel, or find anyone on the Grid by name…"
              className="h-10 w-full bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground"
            />
          </div>
          <select
            value={bandFilter}
            onChange={(e) => setBandFilter(e.target.value)}
            className="h-10 rounded-lg border border-border bg-background px-3 text-[13px]"
          >
            <option value="all">All bands</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="moderate">Moderate</option>
            <option value="low">Stable</option>
          </select>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel className="h-fit">
          <PanelHeader
            title="Your panel"
            subtitle={`${visiblePanel.length} of ${panel.length} · every row names the basis you hold`}
          />
          <div className="divide-y divide-border">
            {!ready || patients.isLoading ? <Loading label="Resolving your panel…" /> : null}
            {visiblePanel.map(({ patient, risk, decision }) => (
              <Link
                key={patient.id}
                to="/patients/$patientId"
                params={{ patientId: patient.id }}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold">
                    {patient.full_name}
                  </span>
                  <span className="block truncate text-[12px] text-muted-foreground">
                    {patient.age}
                    {patient.sex} · {patient.parish}, {patient.island_code}
                  </span>
                </span>
                <Pill className={BASIS_TONE[decision.basis]}>{BASIS_LABEL[decision.basis]}</Pill>
                {risk ? (
                  <Pill className={bandClasses(risk.band)}>
                    {risk.band} {Math.round(risk.score)}
                  </Pill>
                ) : (
                  <Pill className="border-border bg-background text-muted-foreground">
                    not scored
                  </Pill>
                )}
              </Link>
            ))}
            {ready && !visiblePanel.length ? (
              <p className="px-4 py-8 text-[13px] text-muted-foreground">
                {panel.length
                  ? "No one in your panel matches that filter."
                  : "No patients in your panel yet. A referral you accept, an episode at your facility, or a consent grant from the patient will place someone here."}
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel className="h-fit">
          <PanelHeader
            title="Find a patient"
            subtitle="The regional index · identity only, no clinical content"
          />
          {isAggregateOnly ? (
            <p className="px-4 py-8 text-[13px] text-muted-foreground">
              Your role is aggregate and de-identified only, so the patient index is not available
              to it.
            </p>
          ) : query.trim().length < 2 ? (
            <div className="flex flex-col items-start gap-3 px-4 py-8">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-surface text-muted-foreground">
                <Users className="h-4 w-4" />
              </span>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Type at least two characters to look someone up across all eleven countries. The
                index is never browsed as a list — results appear only for a name you search.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {indexMatches.map((p) => (
                <Link
                  key={p.id}
                  to="/patients/$patientId"
                  params={{ patientId: p.id }}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold">
                      {p.full_name}
                    </span>
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {p.age}
                      {p.sex} · {p.parish}, {p.island_code} · speaks {p.language}
                    </span>
                  </span>
                  <Pill className="border-border bg-background text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    sealed
                  </Pill>
                </Link>
              ))}
              {!indexMatches.length ? (
                <p className="px-4 py-8 text-[13px] text-muted-foreground">
                  Nobody outside your panel matches “{query.trim()}”.
                </p>
              ) : (
                <p className="px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
                  Opening one of these shows you who they are and how to get access — a referral to
                  accept, the patient's consent to request, or an emergency override. It does not
                  show their record, and the attempt is written to their access log.
                </p>
              )}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
