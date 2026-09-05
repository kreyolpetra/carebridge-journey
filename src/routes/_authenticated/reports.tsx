/**
 * Reports — one per role, because a report is only useful to whoever has to
 * answer for the numbers in it.
 *
 * Every role in this product already has a screen full of live figures. What
 * none of them had was a document: something dated, scoped, printable, and
 * defensible in a meeting. A ministry officer asked "what is the NCD burden
 * and where is capacity short" cannot forward a dashboard, and a patient
 * walking into a clinic with no connectivity cannot show one either.
 *
 * Each report below is built from the same live queries the dashboards use, so
 * there is no second source of truth to drift — the report is a rendering of
 * the record, not a copy of it.
 */
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  alertsQuery,
  consultationsQuery,
  consentGrantsQuery,
  facilitiesQuery,
  islandsQuery,
  patientsQuery,
  providersQuery,
  referralsQuery,
  riskScoresQuery,
  stockQuery,
  accessLogQuery,
  patientBundleQuery,
  cooperativeMembersQuery,
  dataRequestsQuery,
} from "@/lib/api";
import { agreementsQuery, isGrantActive, TIER_LABEL as CARE_TIER_LABEL } from "@/lib/access";
import { useAuth } from "@/hooks/useAuth";
import { useScope } from "@/hooks/useScope";
import { useAccessIndex } from "@/lib/access-basis";
import { Loading, Panel, Pill, Stat } from "@/components/grid";
import {
  ReportShell,
  ReportSection,
  ReportTable,
  downloadCsv,
} from "@/components/reports/ReportShell";
import { bandClasses, shortDate, timeAgo, usd, TIER_LABEL, LANGUAGE_LABEL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Dated, Printable Summaries by Role | CareBridge Journey" },
      {
        name: "description",
        content:
          "Population health, panel, adherence, governance and personal health summaries — generated from the live record, dated, and printable.",
      },
    ],
  }),
  component: Reports,
});

const LAST_90 = `${shortDate(new Date(Date.now() - 90 * 86400000).toISOString())} – ${shortDate(new Date().toISOString())} (90 days)`;

function Reports() {
  const { role } = useAuth();
  // The patient summary moved onto the patient home — see
  // components/patient/HealthSummary.tsx. Anyone arriving here on an old
  // link goes where it lives now rather than to an orphan page.
  if (role === "patient") return <Navigate to="/" />;
  if (role === "ministry") return <MinistryReport />;
  if (role === "insurer") return <InsurerReport />;
  if (role === "admin") return <GovernanceReport />;
  return <ClinicianReport />;
}

/* ------------------------------------------------------------------ */
/* Ministry — the regional health system report                        */
/* ------------------------------------------------------------------ */

function MinistryReport() {
  const islands = useQuery(islandsQuery);
  const patients = useQuery(patientsQuery);
  const risks = useQuery(riskScoresQuery);
  const facilities = useQuery(facilitiesQuery);
  const providers = useQuery(providersQuery);
  const referrals = useQuery(referralsQuery);
  const stock = useQuery(stockQuery);
  const alerts = useQuery(alertsQuery);
  const consults = useQuery(consultationsQuery);

  const latestRisk = useMemo(() => {
    const m = new Map<string, { score: number; band: string }>();
    for (const r of risks.data ?? []) m.set(r.patient_id, { score: r.score, band: r.band });
    return m;
  }, [risks.data]);

  const byIsland = useMemo(() => {
    const rows = (islands.data ?? []).map((i) => {
      const ps = (patients.data ?? []).filter((p) => p.island_code === i.code);
      const scored = ps.map((p) => latestRisk.get(p.id)).filter(Boolean) as {
        score: number;
        band: string;
      }[];
      const high = scored.filter((r) => r.band === "critical" || r.band === "high").length;
      const fac = (facilities.data ?? []).filter((f) => f.island_code === i.code);
      const beds = fac.reduce((a, f) => a + f.beds_total, 0);
      const occ = fac.reduce((a, f) => a + f.beds_occupied, 0);
      const clin = (providers.data ?? []).filter((p) => p.island_code === i.code).length;
      const refs = (referrals.data ?? []).filter((r) => r.patient_island === i.code);
      return {
        code: i.code,
        name: i.name,
        tier: i.tier,
        patients: ps.length,
        high,
        highPct: ps.length ? (high / ps.length) * 100 : 0,
        occupancy: beds ? (occ / beds) * 100 : 0,
        clinicians: clin,
        referrals: refs.length,
      };
    });
    return rows.sort((a, b) => b.highPct - a.highPct);
  }, [islands.data, patients.data, latestRisk, facilities.data, providers.data, referrals.data]);

  const totalPatients = patients.data?.length ?? 0;
  const highRisk = [...latestRisk.values()].filter(
    (r) => r.band === "critical" || r.band === "high",
  ).length;
  const stockouts = (stock.data ?? []).filter((s) => s.status !== "ok");
  const openAlerts = (alerts.data ?? []).filter((a) => !a.resolved);
  const waiting = (referrals.data ?? []).filter((r) => r.status === "routed");
  const live = (consults.data ?? []).filter(
    (c) => c.kind === "teleconsult" && c.status === "in_progress",
  ).length;
  const retained = (referrals.data ?? [])
    .filter((r) => r.status === "completed")
    .reduce((a, r) => a + r.retained_value_usd, 0);

  if (patients.isLoading) return <Loading label="Assembling the regional report…" />;

  return (
    <ReportShell
      title="Regional health system report"
      subtitle="Chronic disease burden, specialist capacity, medication supply and cross-border referral performance across the countries on CareBridge."
      period={LAST_90}
      onExport={() =>
        downloadCsv("carebridge-regional-report.csv", [
          [
            "Country",
            "Tier",
            "Patients",
            "High risk",
            "High risk %",
            "Occupancy %",
            "Clinicians",
            "Referrals",
          ],
          ...byIsland.map((r) => [
            r.name,
            TIER_LABEL[r.tier] ?? r.tier,
            r.patients,
            r.high,
            r.highPct.toFixed(1),
            r.occupancy.toFixed(1),
            r.clinicians,
            r.referrals,
          ]),
        ])
      }
    >
      <ReportSection title="Headline" note="The four numbers a health minister is asked for first.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Monitored patients"
            value={totalPatients.toLocaleString()}
            hint={`${islands.data?.length ?? 0} countries`}
          />
          <Stat
            label="High or critical risk"
            value={highRisk.toLocaleString()}
            hint={
              totalPatients ? `${((highRisk / totalPatients) * 100).toFixed(1)}% of cohort` : ""
            }
            tone="critical"
          />
          <Stat
            label="Waiting for a specialist"
            value={waiting.length.toLocaleString()}
            hint={`${live} teleconsults in session now`}
            tone={waiting.length ? "signal" : "default"}
          />
          <Stat
            label="Care retained in-region"
            value={usd(retained)}
            hint="Completed referrals only"
            tone="low"
          />
        </div>
      </ReportSection>

      <ReportSection
        title="Burden and capacity by country"
        note="Ordered by the share of the monitored cohort at high or critical risk — where the pressure actually is, not where the population is largest."
      >
        <ReportTable
          head={[
            "Country",
            "Patients",
            "High risk",
            "% high",
            "Bed occupancy",
            "Clinicians",
            "Referrals",
          ]}
          rows={byIsland.map((r) => [
            `${r.name} (${r.code})`,
            r.patients,
            r.high,
            `${r.highPct.toFixed(1)}%`,
            `${r.occupancy.toFixed(0)}%`,
            r.clinicians,
            r.referrals,
          ])}
        />
      </ReportSection>

      <ReportSection
        title="Medication supply risk"
        note="Facilities below the safety threshold, soonest to run out first."
      >
        <ReportTable
          head={["Medication", "Facility", "Days of cover"]}
          rows={stockouts
            .slice()
            .sort((a, b) => a.days_cover - b.days_cover)
            .slice(0, 12)
            .map((s) => [
              s.medication_name,
              (facilities.data ?? []).find((f) => f.id === s.facility_id)?.name ?? "—",
              s.days_cover,
            ])}
          empty="All tracked medications are above the threshold."
        />
      </ReportSection>

      <ReportSection
        title="Open alerts"
        note="Clinical, supply and capacity signals not yet cleared."
      >
        <ReportTable
          head={["Alert", "Severity", "Raised"]}
          rows={openAlerts
            .slice(0, 12)
            .map((a) => [
              a.title,
              <Pill className={bandClasses(a.severity)}>{a.severity}</Pill>,
              timeAgo(a.created_at),
            ])}
          empty="No open alerts."
        />
      </ReportSection>
    </ReportShell>
  );
}

/* ------------------------------------------------------------------ */
/* Clinician — my panel                                                */
/* ------------------------------------------------------------------ */

function ClinicianReport() {
  const { profile } = useAuth();
  const { tier } = useScope();
  const patients = useQuery(patientsQuery);
  const risks = useQuery(riskScoresQuery);
  const referrals = useQuery(referralsQuery);
  const consults = useQuery(consultationsQuery);
  const { index: access, ready } = useAccessIndex();

  const panel = useMemo(() => {
    if (!ready) return [];
    const latest = new Map<string, { score: number; band: string; trend: string }>();
    for (const r of risks.data ?? [])
      latest.set(r.patient_id, { score: r.score, band: r.band, trend: r.trend });
    return (patients.data ?? [])
      .filter((p) => access.decide(p.id).allowed)
      .map((p) => ({ p, risk: latest.get(p.id) ?? null, basis: access.decide(p.id).basis }))
      .sort((a, b) => (b.risk?.score ?? 0) - (a.risk?.score ?? 0));
  }, [patients.data, risks.data, access, ready]);

  const band = (b: string) => panel.filter((r) => r.risk?.band === b).length;
  const myRefs = (referrals.data ?? []).filter((r) => r.to_provider_id === profile?.provider_id);
  const upcoming = (consults.data ?? []).filter(
    (c) =>
      c.provider_id === profile?.provider_id &&
      c.status === "scheduled" &&
      new Date(c.scheduled_at).getTime() > Date.now(),
  );

  if (!ready || patients.isLoading) return <Loading label="Assembling your panel report…" />;

  return (
    <ReportShell
      title="My panel report"
      subtitle="Everyone you hold a lawful basis for, ranked by deterioration risk, with the referrals and appointments attached to you."
      period={LAST_90}
      onExport={() =>
        downloadCsv("carebridge-panel-report.csv", [
          ["MRN", "Name", "Age", "Sex", "Parish", "Country", "Risk", "Band", "Trend", "Basis"],
          ...panel.map((r) => [
            r.p.mrn,
            r.p.full_name,
            r.p.age,
            r.p.sex,
            r.p.parish,
            r.p.island_code,
            r.risk?.score ?? "",
            r.risk?.band ?? "",
            r.risk?.trend ?? "",
            r.basis,
          ]),
        ])
      }
    >
      <ReportSection
        title="Panel at a glance"
        note={`${panel.length} patients, ${(tier ? CARE_TIER_LABEL[tier] : "Clinical").toLowerCase()} scope.`}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Critical" value={band("critical")} hint="Contact today" tone="critical" />
          <Stat label="High" value={band("high")} hint="Contact this week" />
          <Stat
            label="Referrals to me"
            value={myRefs.length}
            hint={`${myRefs.filter((r) => r.status === "routed").length} awaiting acceptance`}
          />
          <Stat
            label="Upcoming appointments"
            value={upcoming.length}
            hint="Scheduled ahead"
            tone="low"
          />
        </div>
      </ReportSection>

      <ReportSection
        title="Highest risk first"
        note="The twenty patients on your panel with the highest deterioration score."
      >
        <ReportTable
          head={["Patient", "MRN", "Age/Sex", "Country", "Risk", "Trend"]}
          rows={panel
            .slice(0, 20)
            .map((r) => [
              r.p.full_name,
              r.p.mrn,
              `${r.p.age}${r.p.sex}`,
              r.p.island_code,
              r.risk ? <Pill className={bandClasses(r.risk.band)}>{r.risk.score}</Pill> : "—",
              r.risk?.trend ?? "—",
            ])}
          empty="No patients on your panel yet."
        />
      </ReportSection>

      <ReportSection
        title="Referrals routed to you"
        note="Accepting one places you on the care team."
      >
        <ReportTable
          head={["Specialty", "Status", "Cross-island", "Raised"]}
          rows={myRefs
            .slice(0, 12)
            .map((r) => [
              r.specialty,
              r.status,
              r.cross_island ? "Yes" : "No",
              timeAgo(r.created_at),
            ])}
          empty="No referrals routed to you."
        />
      </ReportSection>
    </ReportShell>
  );
}

/* ------------------------------------------------------------------ */
/* Insurer — adherence and pricing                                     */
/* ------------------------------------------------------------------ */

function InsurerReport() {
  const patients = useQuery(patientsQuery);
  const risks = useQuery(riskScoresQuery);
  const referrals = useQuery(referralsQuery);
  const islands = useQuery(islandsQuery);

  const latest = useMemo(() => {
    const m = new Map<string, { score: number; band: string }>();
    for (const r of risks.data ?? []) m.set(r.patient_id, { score: r.score, band: r.band });
    return m;
  }, [risks.data]);

  const insured = (patients.data ?? []).filter((p) => p.insurer);
  const byInsurer = useMemo(() => {
    const m = new Map<string, { members: number; high: number }>();
    for (const p of insured) {
      const name = p.insurer;
      if (!name) continue;
      const row = m.get(name) ?? { members: 0, high: 0 };
      row.members += 1;
      const r = latest.get(p.id);
      if (r && (r.band === "critical" || r.band === "high")) row.high += 1;
      m.set(name, row);
    }
    return [...m.entries()]
      .map(([name, v]) => ({ name, ...v, highPct: v.members ? (v.high / v.members) * 100 : 0 }))
      .sort((a, b) => b.members - a.members);
  }, [insured, latest]);

  const retained = (referrals.data ?? [])
    .filter((r) => r.status === "completed")
    .reduce((a, r) => a + r.retained_value_usd, 0);

  if (patients.isLoading) return <Loading label="Assembling the pricing report…" />;

  return (
    <ReportShell
      title="Adherence and risk pricing report"
      subtitle="Insured cohort by carrier, deterioration risk concentration, and the overseas spend avoided by treating in-region."
      period={LAST_90}
      onExport={() =>
        downloadCsv("carebridge-pricing-report.csv", [
          ["Insurer", "Members", "High risk", "High risk %"],
          ...byInsurer.map((r) => [r.name, r.members, r.high, r.highPct.toFixed(1)]),
        ])
      }
    >
      <ReportSection title="Headline" note="Cohort size and where the risk sits.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Insured members"
            value={insured.length.toLocaleString()}
            hint={`${byInsurer.length} carriers`}
          />
          <Stat
            label="Uninsured on CareBridge"
            value={((patients.data?.length ?? 0) - insured.length).toLocaleString()}
            hint="Out of scope for pricing"
          />
          <Stat
            label="High or critical"
            value={byInsurer.reduce((a, r) => a + r.high, 0).toLocaleString()}
            hint="Across all carriers"
            tone="critical"
          />
          <Stat
            label="Overseas spend avoided"
            value={usd(retained)}
            hint="Completed referrals"
            tone="low"
          />
        </div>
      </ReportSection>

      <ReportSection
        title="Cohort by carrier"
        note="Risk concentration is what prices a book. A carrier with the same headcount but twice the high-risk share is not the same risk."
      >
        <ReportTable
          head={["Insurer", "Members", "High risk", "% high"]}
          rows={byInsurer.map((r) => [r.name, r.members, r.high, `${r.highPct.toFixed(1)}%`])}
        />
      </ReportSection>

      <ReportSection
        title="Exposure by country"
        note="Where the insured cohort sits, and how thin the local specialist supply is behind it."
      >
        <ReportTable
          head={["Country", "Insured members", "Resource tier"]}
          rows={(islands.data ?? [])
            .map((i) => ({
              i,
              n: insured.filter((p) => p.island_code === i.code).length,
            }))
            .filter((r) => r.n > 0)
            .sort((a, b) => b.n - a.n)
            .map((r) => [r.i.name, r.n, TIER_LABEL[r.i.tier] ?? r.i.tier])}
        />
      </ReportSection>
    </ReportShell>
  );
}

/* ------------------------------------------------------------------ */
/* Admin — governance                                                  */
/* ------------------------------------------------------------------ */

function GovernanceReport() {
  const agreements = useQuery(agreementsQuery);
  const grants = useQuery(consentGrantsQuery);
  const accessLog = useQuery(accessLogQuery);
  const facilities = useQuery(facilitiesQuery);
  const requests = useQuery(dataRequestsQuery);
  const members = useQuery(cooperativeMembersQuery);

  const facName = (id: string | null) =>
    (facilities.data ?? []).find((f) => f.id === id)?.name ?? "—";

  const log = accessLog.data ?? [];
  const breakGlass = log.filter((l) => l.basis === "break_glass");
  const refused = log.filter((l) => l.allowed === false);
  const expiring = (agreements.data ?? []).filter(
    (a) =>
      a.status === "expiring" ||
      (a.expires_at && new Date(a.expires_at).getTime() < Date.now() + 90 * 86400000),
  );

  if (accessLog.isLoading) return <Loading label="Assembling the governance report…" />;

  return (
    <ReportShell
      title="Governance and access report"
      subtitle="Who reached patient records and under what lawful basis, which agreements need review, and the state of consent across CareBridge."
      period={LAST_90}
      onExport={() =>
        downloadCsv("carebridge-governance-report.csv", [
          ["When", "Actor", "Resource", "Basis", "Allowed"],
          ...log
            .slice(0, 500)
            .map((l) => [
              l.accessed_at,
              l.actor_name ?? "",
              l.resource,
              l.basis,
              l.allowed === false ? "refused" : "allowed",
            ]),
        ])
      }
    >
      <ReportSection title="Headline" note="The four figures a governance panel reviews.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Record accesses logged"
            value={log.length.toLocaleString()}
            hint="Every read, allowed or not"
          />
          <Stat
            label="Break-glass events"
            value={breakGlass.length}
            hint="Each requires review"
            tone={breakGlass.length ? "critical" : "low"}
          />
          <Stat
            label="Refused attempts"
            value={refused.length}
            hint="No lawful basis resolved"
            tone={refused.length ? "signal" : "default"}
          />
          <Stat
            label="Agreements needing review"
            value={expiring.length}
            hint="Expiring within 90 days"
            tone={expiring.length ? "signal" : "low"}
          />
        </div>
      </ReportSection>

      <ReportSection
        title="Data-sharing agreements"
        note="The instruments that let one facility read another's record."
      >
        <ReportTable
          head={["Reference", "From", "To", "Status", "Expires"]}
          rows={(agreements.data ?? []).map((a) => [
            a.reference,
            facName(a.from_facility_id),
            facName(a.to_facility_id),
            <Pill className={bandClasses(a.status === "active" ? "low" : "moderate")}>
              {a.status}
            </Pill>,
            a.expires_at ? shortDate(a.expires_at) : "—",
          ])}
        />
      </ReportSection>

      <ReportSection
        title="Consent grants"
        note="Access a patient granted directly, and its current state."
      >
        <ReportTable
          head={["Purpose", "Scope", "Status"]}
          rows={(grants.data ?? [])
            .slice(0, 15)
            .map((g) => [
              g.purpose,
              g.scope.join(", "),
              <Pill className={bandClasses(isGrantActive(g.status) ? "low" : "moderate")}>
                {g.status}
              </Pill>,
            ])}
          empty="No consent grants recorded."
        />
      </ReportSection>

      <ReportSection
        title="Health Data Cooperative"
        note="Membership is revocable, and releases are governed by a minimum cohort size."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Members"
            value={(members.data ?? [])
              .filter((m) => m.status === "active")
              .length.toLocaleString()}
            hint="Opted into the research pool"
          />
          <Stat
            label="Approved releases"
            value={(requests.data ?? []).filter((r) => r.status === "approved").length}
            hint="Against a stated purpose"
          />
          <Stat
            label="Declined or pending"
            value={(requests.data ?? []).filter((r) => r.status !== "approved").length}
            hint="Awaiting or refused"
          />
        </div>
      </ReportSection>
    </ReportShell>
  );
}

/* ------------------------------------------------------------------ */
/* Patient — my health summary                                         */
/* ------------------------------------------------------------------ */

/** Kept so an unknown role still renders something rather than nothing. */
export function EmptyReport() {
  return (
    <Panel>
      <p className="p-6 text-[13px] text-muted-foreground">No report is defined for this role.</p>
    </Panel>
  );
}
