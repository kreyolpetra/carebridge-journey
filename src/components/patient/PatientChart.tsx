/**
 * The assembled patient record.
 *
 * Lifted out of the clinician console so the console's split pane and the
 * addressable /patients/$patientId profile render the same chart from the same
 * code. Two copies would drift, and the one that drifted would be the one that
 * forgot a redaction rule.
 *
 * This component renders clinical content and therefore assumes a resolved,
 * allowed AccessDecision. Callers gate on that before mounting it.
 */
import { useMemo, type ReactNode } from "react";
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
import { ShieldAlert } from "lucide-react";
import type { PatientBundle, Provider } from "@/lib/api";
import { BASIS_LABEL, BASIS_TONE, TIER_LABEL, TIER_SCOPE, isGrantActive } from "@/lib/access";
import type { AccessDecision } from "@/lib/access-basis";
import { CareTimeline } from "@/components/patient/CareTimeline";
import { BookAppointment } from "@/components/patient/BookAppointment";
import { AddPaperRecord } from "@/components/patient/AddPaperRecord";
import { SafetyPanel } from "@/components/patient/SafetyPanel";
import { PatientContinuityNote } from "@/components/ContinuityBanner";
import { DischargeHandoff } from "@/components/patient/DischargeHandoff";
import { CareRequests } from "@/components/patient/CareRequests";
import { ResultsOnCareBridge } from "@/components/patient/ResultsOnCareBridge";
import { PatientLine as CareLine } from "@/components/patient/CareLineView";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Panel, PanelHeader, Pill } from "@/components/grid";
import { bandClasses, severityClasses, shortDate, timeAgo } from "@/lib/format";

/**
 * The basis this chart is being read under, stated on the chart itself rather
 * than hidden in a tooltip — it is the same sentence the patient will see in
 * their own access log.
 */
export function BasisStrip({ decision }: { decision: AccessDecision }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-border bg-surface px-5 py-2.5 text-[12px] text-muted-foreground">
      <span className="font-semibold text-foreground">{decision.detail}</span>
      {decision.tier ? (
        <span>
          · {TIER_LABEL[decision.tier]} — {TIER_SCOPE[decision.tier].toLowerCase()}
        </span>
      ) : null}
      {decision.expiresAt ? <span>· access closes {shortDate(decision.expiresAt)}</span> : null}
    </div>
  );
}

/**
 * A date-only value is a calendar date, not an instant. `new Date("1968-03-14")`
 * parses as UTC midnight and then renders in local time, which west of Greenwich
 * shows the 13th — a birth date that disagrees with the record by a day is worse
 * than none, because it is the thing a clinician reads back to the patient.
 */
function longDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function PatientChart({
  bundle: b,
  decision,
  providers,
  headerActions,
  onAcceptReferral,
}: {
  bundle: PatientBundle;
  decision: AccessDecision | null;
  providers: Provider[];
  /** Surface-specific controls for the identity header (e.g. the console's brief). */
  headerActions?: ReactNode;
  onAcceptReferral?: (referralId: string) => void;
}) {
  const providerName = (id: string | null) =>
    providers.find((p) => p.id === id)?.full_name ?? "Unassigned";

  // Sensitive categories are gated independently of the care relationship, so
  // the chart must apply the same rule the agent does. Without this the console
  // rendered entries the agent had just refused to read.
  const grantedCategories = useMemo(
    () => new Set((b.grants ?? []).filter((g) => isGrantActive(g.status)).flatMap((g) => g.scope)),
    [b.grants],
  );
  const visibleConditions = useMemo(
    () =>
      (b.conditions ?? []).filter((c) => {
        const s = (c as { sensitivity?: string }).sensitivity;
        return !s || s === "standard" || grantedCategories.has(s);
      }),
    [b.conditions, grantedCategories],
  );
  const withheldConditions = (b.conditions?.length ?? 0) - visibleConditions.length;

  const chartData = useMemo(
    () =>
      (b.vitals ?? [])
        .slice()
        .reverse()
        .map((v) => ({
          date: shortDate(v.measured_at),
          systolic: v.systolic,
          diastolic: v.diastolic,
          glucose: v.glucose_mmol ? Number(v.glucose_mmol) : null,
        })),
    [b.vitals],
  );

  return (
    <>
      {/* Whose record this is, pinned.
          The identity used to scroll away with the rest of the header, so a
          clinician typing into the care line or reading a note had nothing on
          screen telling them whose chart they were in — the classic setup for a
          wrong-patient action. It also carries two identifiers now, because a
          name is not one: 82 names in this dataset belong to more than one
          person, four of them to a "Paulette Cumberbatch". */}
      <div className="sticky top-16 z-20 -mx-1 px-1 pb-1 pt-1">
        <Panel className="border-primary/25 shadow-panel">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
            <div className="min-w-0">
              <p className="truncate font-display text-[16px] font-bold tracking-tight">
                {b.patient.full_name}
              </p>
              <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                <span className="font-medium text-foreground">{b.patient.mrn}</span>
                {" · born "}
                {longDate(b.patient.date_of_birth)}
                {` · ${b.patient.age}${b.patient.sex}`}
              </p>
              {/*
                An allergy list the safety engine checks every new drug against,
                and which no screen showed. It belongs on the identity line for
                the same reason it goes on a wristband: it is the fact a
                clinician must have before they decide anything, not one they
                should have to go and look for.
              */}
              {b.patient.allergies?.length ? (
                <p className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-critical">
                    Allergies
                  </span>
                  {b.patient.allergies.map((a) => (
                    <Pill key={a} className="border-critical/40 bg-critical/10 text-critical">
                      {a}
                    </Pill>
                  ))}
                </p>
              ) : (
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  No allergies recorded — which is not the same as none.
                </p>
              )}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {decision ? (
                <Pill className={BASIS_TONE[decision.basis]}>{BASIS_LABEL[decision.basis]}</Pill>
              ) : null}
              {b.risk ? (
                <Pill className={bandClasses(b.risk.band)}>risk {b.risk.score}</Pill>
              ) : null}
              <BookAppointment patient={b.patient} />
              <AddPaperRecord patientId={b.patient.id} patientName={b.patient.full_name} />
              {headerActions}
            </div>
          </div>
        </Panel>
      </div>

      <PatientContinuityNote patientId={b.patient.id} />

      {/* Never behind a tab.
          Everything else about this patient is now tabbed, and that is right —
          a chart is a filing cabinet and you open the drawer you need. A safety
          stop is not filing. It is the one thing that has to be true whichever
          drawer is open, so it sits above them where it cannot be navigated
          away from. */}
      <SafetyPanel bundle={b} />

      {/*
        The tabs are the chart's navigation, so they sit at the top of it.
        They used to sit at the bottom, under a request panel, a discharge
        panel, a safety panel and a summary — about two thousand pixels of
        scroll before a clinician reached the trends, the conversation, the
        visit history or the referral log. Navigation at the foot of the thing
        it navigates is not navigation, it is a footnote.
        Overview holds what that scroll used to be, in two columns: what needs
        a decision on the left, the clinical picture on the right.
      */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="careline">Care line</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="referrals">Triage &amp; referrals</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid items-start gap-4 xl:grid-cols-[1.12fr_1fr]">
            <div className="space-y-4">
              <CareRequests patientId={b.patient.id} />
              <DischargeHandoff patientId={b.patient.id} />
            </div>
            <Panel>
              <PanelHeader
                title="Summary"
                subtitle={`${b.patient.parish}, ${b.patient.island_code} · ${b.patient.km_to_facility} km from care · ${b.patient.insurer ?? "Uninsured"}`}
              />
              {decision ? <BasisStrip decision={decision} /> : null}
              <div className="grid gap-4 p-5 md:grid-cols-3">
                <div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Conditions
                  </h4>
                  <ul className="mt-2 space-y-1 text-[13px]">
                    {visibleConditions.map((c) => (
                      <li key={c.id}>
                        {c.name}{" "}
                        <span className="text-muted-foreground">
                          {c.diagnosed_on
                            ? `since ${c.diagnosed_on ? new Date(c.diagnosed_on).getFullYear() : null}`
                            : "onset not recorded"}
                        </span>
                      </li>
                    ))}
                    {/* Redaction, not concealment: the clinician is told a restricted
                    entry exists rather than being shown a chart that silently
                    looks complete. */}
                    {withheldConditions > 0 ? (
                      <li className="flex items-start gap-1.5 text-high">
                        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                          {withheldConditions} restricted{" "}
                          {withheldConditions === 1 ? "entry" : "entries"} withheld — no active
                          grant
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
                        <span
                          className={
                            m.adherence_pct < 70 ? "text-critical" : "text-muted-foreground"
                          }
                        >
                          · {m.adherence_pct}% adherence · {m.days_supply_left}d supply
                        </span>
                      </li>
                    ))}
                    {!b.medications.length ? (
                      <li className="text-muted-foreground">None recorded</li>
                    ) : null}
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
          </div>
        </TabsContent>

        <TabsContent value="trends" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <PanelHeader title="Blood pressure" subtitle="Home readings via WhatsApp" />
              <div className="h-[220px] p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="var(--color-border)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                      minTickGap={24}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                      width={32}
                      domain={[50, 200]}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 10,
                        fontSize: 12,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="systolic"
                      stroke="var(--color-critical)"
                      dot={false}
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="diastolic"
                      stroke="var(--color-primary)"
                      dot={false}
                      strokeWidth={2}
                    />
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
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                      minTickGap={24}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                      width={32}
                    />
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
        </TabsContent>

        <TabsContent value="careline" className="mt-4">
          <Panel className="p-4">
            <Panel className="p-4">
              <CareLine pinnedPatientId={b.patient.id} />
            </Panel>
          </Panel>
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-4">
          {/* Before the timeline: the commonest waste on a small island is
              re-ordering a test whose result already sits at another facility. */}
          <ResultsOnCareBridge patientId={b.patient.id} />

          <CareTimeline
            patientId={b.patient.id}
            decision={decision}
            grantedCategories={grantedCategories}
            bundle={b}
          />
        </TabsContent>

        <TabsContent value="referrals" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <PanelHeader
                title="Triage history"
                subtitle="Every inbound message, clinically read"
              />
              <div className="max-h-[320px] space-y-3 overflow-y-auto p-5">
                {b.triage.map((t) => (
                  <div key={t.id} className="rounded-lg border border-border bg-surface p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Pill className={severityClasses(t.severity)}>
                        {t.severity.replace("_", " ")}
                      </Pill>
                      <span className="text-[11.5px] text-muted-foreground">
                        {timeAgo(t.created_at)}
                      </span>
                    </div>
                    <div className="mt-2 text-[13px] font-semibold">{t.category}</div>
                    <p className="mt-1 text-[12.5px] text-muted-foreground">{t.rationale}</p>
                  </div>
                ))}
                {!b.triage.length ? (
                  <p className="text-[13px] text-muted-foreground">
                    No triage events yet for this patient.
                  </p>
                ) : null}
              </div>
            </Panel>

            <Panel>
              <PanelHeader
                title="Referrals & teleconsults"
                subtitle="Cross-island routing for this patient"
              />
              <div className="max-h-[320px] space-y-3 overflow-y-auto p-5">
                {b.referrals.map((r) => (
                  <div key={r.id} className="rounded-lg border border-border bg-surface p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold">
                        {r.specialty} · {providerName(r.to_provider_id)}
                      </span>
                      <Pill className="border-border bg-background text-muted-foreground">
                        {r.status}
                      </Pill>
                    </div>
                    <p className="mt-1 text-[12.5px] text-muted-foreground">
                      {r.cross_island ? "Cross-island" : "On-island"} · local wait{" "}
                      {r.wait_days_local}d → routed {r.wait_days_routed}d · $
                      {r.retained_value_usd.toLocaleString()} retained in-region
                    </p>
                    {r.status === "routed" && onAcceptReferral ? (
                      <button
                        onClick={() => onAcceptReferral(r.id)}
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
        </TabsContent>
      </Tabs>
    </>
  );
}
