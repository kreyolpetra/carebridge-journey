import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  alertsQuery,
  facilitiesQuery,
  islandsQuery,
  patientBundleQuery,
  patientsQuery,
  providersQuery,
  referralsQuery,
  riskScoresQuery,
  stockQuery,
  slotsQuery,
  consentGrantsQuery,
  type Patient,
  type Provider,
} from "@/lib/api";
import { Panel, Stat, RowList, Row } from "@/components/grid";
import { HealthSummary } from "@/components/patient/HealthSummary";
import { usd, timeAgo, LANGUAGE_LABEL } from "@/lib/format";
import { activityQuery, type ActivityItem } from "@/lib/activity";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABEL } from "@/lib/demo-accounts";
import { navFor } from "@/lib/nav";
import { useScope } from "@/hooks/useScope";
import { useAccessIndex } from "@/lib/access-basis";
import { useWorklist, useContactedToday, rankTone } from "@/hooks/useWorklist";
import { useMyFacility } from "@/hooks/useMyFacility";
import { allocateAttention, capacityForFacility } from "@/lib/attention";
import { InSessionNow } from "@/components/patient/InSessionNow";
import { HealthTrends } from "@/components/patient/HealthTrends";
import { HomeReadingCard } from "@/components/HomeReadingCard";
import { ActivityFeed } from "@/components/app/ActivityFeed";
import { isGrantActive } from "@/lib/access";
import { firstName } from "@/lib/names";
import {
  ArrowRight,
  Bell,
  Coins,
  HeartPulse,
  MessageSquareText,
  ShieldCheck,
  Stethoscope,
  Activity,
  CalendarClock,
  AlertTriangle,
  ClipboardList,
  History,
  ArrowRightLeft,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePatientLang } from "@/hooks/usePatientLang";

const ACTIVITY_META: Record<ActivityItem["kind"], { icon: typeof HeartPulse; tone: string }> = {
  message: { icon: MessageSquareText, tone: "text-primary bg-primary/12" },
  triage: { icon: Stethoscope, tone: "text-high bg-high/12" },
  referral: { icon: ArrowRightLeft, tone: "text-low bg-low/12" },
  consent: { icon: ShieldCheck, tone: "text-moderate bg-moderate/12" },
  alert: { icon: TriangleAlert, tone: "text-critical bg-critical/12" },
};

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Home — CareBridge Journey" },
      {
        name: "description",
        content:
          "Your role-aware CareBridge Journey home: messages, clinician queue, regional coordination or insurer engine, personalised to your sign-in.",
      },
      {
        property: "og:title",
        content: "CareBridge Journey — The Front Door to Caribbean Healthcare",
      },
      {
        property: "og:description",
        content:
          "One patient identity, one longitudinal record, one triage brain, one capacity-aware routing engine across the Caribbean.",
      },
    ],
  }),
  component: Home,
});

function bandTone(band?: string) {
  if (band === "critical") return "text-critical";
  if (band === "high") return "text-critical";
  if (band === "rising") return "text-[#b45309]";
  return "text-low";
}

function Greeting({ subtitle }: { subtitle: string }) {
  const { t } = usePatientLang();
  const { profile, role } = useAuth();
  const name = profile?.full_name ?? "there";
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
          {ROLE_LABEL[role] ?? role}
          {profile?.organisation ? ` · ${profile.organisation}` : ""}
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight md:text-4xl">
          {role === "patient"
            ? t("Hello, {name}.", { name: firstName(name) })
            : `Good day, ${firstName(name)}.`}
        </h1>
        <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-muted-foreground">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

function SurfaceLinks() {
  const { role } = useAuth();
  const { staffRole } = useScope();
  const items = navFor(role, staffRole).filter((i) => i.group === "Work" && i.to !== "/");
  if (!items.length) return null;
  return (
    <section>
      <h2 className="mb-3 font-display text-[15px] font-semibold">Your workspaces</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((s) => (
          <Link key={s.to} to={s.to} className="group">
            <Panel className="h-full p-5 transition-transform group-hover:-translate-y-1">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/12 text-primary">
                  <s.icon className="h-4.5 w-4.5" />
                </span>
                <h3 className="font-display text-[15px] font-semibold">{s.label}</h3>
              </div>
              <div className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary">
                Open{" "}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </Panel>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ---------------- Patient home ---------------- */

function PatientHome() {
  const { profile } = useAuth();
  const { t } = usePatientLang();
  const patientId = profile?.patient_id;
  const bundle = useQuery({
    ...patientBundleQuery(patientId ?? "none"),
    enabled: Boolean(patientId),
  });

  const risk = bundle.data?.risk;
  const latestVital = bundle.data?.vitals[0];
  const activeGrants = (bundle.data?.grants ?? []).filter((g) => isGrantActive(g.status));
  const meds = bundle.data?.medications ?? [];
  const lowMeds = meds.filter((m) => m.days_supply_left <= 7);
  const adherence = meds.length
    ? Math.round(meds.reduce((s, m) => s + m.adherence_pct, 0) / meds.length)
    : null;

  return (
    <>
      <div className="screen-only">
        <Greeting
          subtitle={t("Today's readings, your medications and what needs your attention.")}
        />
      </div>

      {/* The context a clinician sees at the top of her chart, on her own
          home: how far she is from care, what she speaks, who pays. */}
      {bundle.data?.patient ? (
        <p className="screen-only -mt-2 text-[13px] text-muted-foreground">
          {bundle.data.patient.age}
          {bundle.data.patient.sex} · {bundle.data.patient.parish},{" "}
          {bundle.data.patient.island_code} · {bundle.data.patient.km_to_facility} km from the
          clinic · {LANGUAGE_LABEL[bundle.data.patient.language] ?? bundle.data.patient.language} ·{" "}
          {bundle.data.patient.insurer ?? "Uninsured"}
        </p>
      ) : null}

      <section className="screen-only grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t("My risk level")}
          value={risk ? `${risk.band.toUpperCase()} · ${Math.round(risk.score)}` : "—"}
          hint={risk ? `Trend: ${risk.trend}` : "Log a reading to compute"}
          tone={risk?.band === "critical" || risk?.band === "high" ? "critical" : "low"}
        />
        <Stat
          label={t("Blood pressure")}
          value={latestVital?.systolic ? `${latestVital.systolic}/${latestVital.diastolic}` : "—"}
          hint={
            latestVital ? `Last reading ${timeAgo(latestVital.measured_at)}` : "No readings yet"
          }
          tone={latestVital?.systolic && latestVital.systolic >= 160 ? "critical" : "signal"}
        />
        <Stat
          label={t("Blood sugar")}
          value={latestVital?.glucose_mmol ? Number(latestVital.glucose_mmol).toFixed(1) : "—"}
          hint="mmol/L, most recent"
        />
        <Stat
          label={t("Medication adherence")}
          value={adherence !== null ? `${adherence}%` : "—"}
          hint={
            lowMeds.length
              ? `${lowMeds.length} refill${lowMeds.length > 1 ? "s" : ""} due within 7 days`
              : "Refills on track"
          }
        />
      </section>

      {/* The daily loop: send today's reading, then see what it did to the
          trend. These were on My record, behind the care network and the visit
          archive — the wrong depth for the thing a patient opens the app to
          do. */}
      {patientId ? (
        <div className="screen-only">
          <HomeReadingCard patientId={patientId} />
        </div>
      ) : null}
      {bundle.data ? (
        <div className="screen-only">
          <HealthTrends bundle={bundle.data} />
        </div>
      ) : null}

      <section className="screen-only grid items-start gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Panel className="p-5">
          <div className="flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-primary" />
            <h3 className="font-display text-[15px] font-semibold">What needs my attention</h3>
          </div>
          <ul className="mt-4 space-y-3 text-[13.5px]">
            {risk &&
            (risk.band === "high" || risk.band === "critical" || risk.band === "rising") ? (
              <li className="flex gap-2.5 rounded-lg border border-critical/25 bg-critical/5 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-critical" />
                <span>
                  Your risk is <strong className={bandTone(risk.band)}>{risk.band}</strong>.{" "}
                  {risk.drivers[0] ? `Main driver: ${risk.drivers[0].label}.` : ""} Message the line
                  today so a clinician can review you.
                </span>
              </li>
            ) : (
              <li className="flex gap-2.5 rounded-lg border border-low/25 bg-low/5 p-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-low" />
                <span>
                  Your readings look steady. Keep logging daily — it keeps your risk score accurate.
                </span>
              </li>
            )}
            {lowMeds.map((m) => (
              <li
                key={m.id}
                className="flex gap-2.5 rounded-lg border border-border bg-surface p-3"
              >
                <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  <strong>{m.name}</strong> has {m.days_supply_left} days left — ask the line to
                  route a refill before it runs out.
                </span>
              </li>
            ))}
            <li className="flex gap-2.5 rounded-lg border border-border bg-surface p-3">
              <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                Feeling unwell? Message your care team in plain language — Patois or English — and
                the AI triage will route you.
              </span>
            </li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link
              to="/patient"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground"
            >
              Open my messages <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/record"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-[13px] font-semibold"
            >
              View my full record
            </Link>
            <Link
              to="/consent"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-[13px] font-semibold"
            >
              Manage my consent
            </Link>
          </div>
        </Panel>

        <Panel className="p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h3 className="font-display text-[15px] font-semibold">My active consents</h3>
          </div>
          {activeGrants.length === 0 ? (
            <p className="mt-4 text-[13px] text-muted-foreground">
              No active grants — only your care team sees your record.
            </p>
          ) : (
            <RowList className="mt-2">
              {activeGrants.slice(0, 4).map((g) => (
                <Row
                  key={g.id}
                  title={g.purpose}
                  detail={
                    `Scope: ${g.scope.join(", ")}` +
                    (g.expires_at
                      ? ` · expires ${new Date(g.expires_at).toLocaleDateString()}`
                      : "")
                  }
                />
              ))}
            </RowList>
          )}
        </Panel>
      </section>

      <div className="screen-only">
        <ActivityFeed maxHeight="440px" />
      </div>

      {/*
        The summary that used to be its own menu item. Same facts as the
        screens above, in the form you can fold into a pocket and hand to a
        clinician whose system cannot reach this one. Printing from here drops
        everything above it.
      */}
      <HealthSummary />
    </>
  );
}

/* ---------------- Clinician home ---------------- */

function ClinicianHome({ provider }: { provider: Provider | null }) {
  const risks = useQuery(riskScoresQuery);
  const patients = useQuery(patientsQuery);
  const referrals = useQuery(referralsQuery);
  const slots = useQuery(slotsQuery);

  const { index: access, ready: accessReady } = useAccessIndex();

  const patientById = new Map((patients.data ?? []).map((p) => [p.id, p]));
  // Same rule as the console: the tile counts this clinician's own panel, and
  // the named list below only ever shows patients a lawful basis reaches.
  const regionQueue = (risks.data ?? []).filter((r) => r.band === "critical" || r.band === "high");
  const queue = accessReady ? regionQueue.filter((r) => access.decide(r.patient_id).allowed) : [];
  const restricted = regionQueue.length - queue.length;
  const myReferrals = (referrals.data ?? []).filter(
    (r) => provider && r.to_provider_id === provider.id && r.status !== "completed",
  );
  const mySlots = (slots.data ?? []).filter(
    (s) => provider && s.provider_id === provider.id && s.status === "open",
  );
  const myFacility = useMyFacility();
  const { items: work } = useWorklist();
  const contactedToday = useContactedToday();
  /**
   * Cut to the size of a session, from the same function the Patients screen
   * uses. A home screen that drew the line in a different place from the list
   * you act on would be telling you two different days.
   */
  const allocation = allocateAttention(work, {
    spent: contactedToday.size,
    capacity: capacityForFacility(myFacility),
  });

  return (
    <>
      <Greeting
        subtitle={`${provider ? `${provider.specialty} · ${provider.island_code}` : "Regional clinician"} — your queue is ranked by risk, not arrival order.`}
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="High-risk queue"
          value={queue.length}
          hint={
            restricted > 0
              ? `Your panel · ${restricted} more outside your access`
              : "Critical + high, your panel"
          }
          tone="critical"
        />
        <Stat
          label="Referrals routed to me"
          value={myReferrals.length}
          hint="Cross-island teleconsults awaiting review"
          tone="signal"
        />
        <Stat
          label="My open teleconsult slots"
          value={mySlots.length}
          hint="Bookable by other islands"
          tone="low"
        />
        <Stat
          label="Avg. local wait bypassed"
          value={
            myReferrals.length
              ? `${Math.round(myReferrals.reduce((s, r) => s + (r.wait_days_local - r.wait_days_routed), 0) / myReferrals.length)} days`
              : "—"
          }
          hint="Saved per routed patient"
        />
      </section>

      {/* Being seen right now, above who still needs seeing. */}
      <InSessionNow />

      <section className="grid items-start gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Panel className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-primary" />
              <h3 className="font-display text-[15px] font-semibold">What needs you today</h3>
            </div>
            <Link
              to="/patients"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary"
            >
              Open worklist <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {/* The top of the same worklist the Patients screen shows, from the
              same hook — a home screen that ranked patients differently from
              the list you act on would send you to the wrong person first. */}
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {work.length
              ? `${allocation.above.length} for this session · ${allocation.below.length} handed to the nurse list or an automatic check-in`
              : "Nothing outstanding."}
          </p>
          {/* The whole day, not a sample of it. A panel that says "17 to action
              today" above a list of five invites the obvious question, and a
              truncated list answers "here is some of your morning" — which is
              not what anyone opens this page to find out. It scrolls rather
              than swamping the page, and the week stays a number below. */}
          <ul className="mt-3 max-h-[420px] divide-y divide-border overflow-y-auto">
            {allocation.above.map((item) => (
              <li key={item.patient.id}>
                <Link
                  to="/patients"
                  search={{ patient: item.patient.id }}
                  className="flex items-start gap-3 py-2.5 transition-colors hover:text-primary"
                >
                  <span
                    className={cn(
                      "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-[12.5px] font-bold",
                      rankTone(item.rank),
                    )}
                  >
                    {item.risk ? Math.round(item.risk.score) : "—"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">
                      {item.patient.full_name}
                    </span>
                    <span className="block truncate text-[12px] text-muted-foreground">
                      <strong className="font-semibold text-foreground/75">{item.reason}</strong> ·{" "}
                      {item.detail}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
            {work.length === 0 && (
              <li className="py-3 text-[13px] leading-relaxed text-muted-foreground">
                Nothing needs action right now — no referrals waiting on you, no appointments today,
                and every critical and high-risk patient has been contacted.
              </li>
            )}
          </ul>
        </Panel>

        <Panel className="p-5">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            <h3 className="font-display text-[15px] font-semibold">Referrals waiting on me</h3>
          </div>
          {myReferrals.length === 0 ? (
            <p className="mt-4 text-[13px] text-muted-foreground">
              No pending referrals routed to you.
            </p>
          ) : (
            <RowList className="mt-2">
              {myReferrals.slice(0, 4).map((r) => {
                const p = patientById.get(r.patient_id);
                return (
                  <Row
                    key={r.id}
                    title={`${p?.full_name ?? "Patient"} · ${r.specialty}`}
                    detail={`${r.cross_island ? "Cross-island" : "Local"} · local wait ${r.wait_days_local}d → routed ${r.wait_days_routed}d · ${r.status}`}
                  />
                );
              })}
            </RowList>
          )}
        </Panel>
      </section>
    </>
  );
}

/* ---------------- Ministry home ---------------- */

function MinistryHome() {
  const islands = useQuery(islandsQuery);
  const facilities = useQuery(facilitiesQuery);
  const risks = useQuery(riskScoresQuery);
  const alerts = useQuery(alertsQuery);
  const referrals = useQuery(referralsQuery);
  const stock = useQuery(stockQuery);
  const patients = useQuery(patientsQuery);

  const highRisk = (risks.data ?? []).filter(
    (r) => r.band === "critical" || r.band === "high",
  ).length;
  const stockouts = (stock.data ?? []).filter((s) => s.status !== "ok").length;
  // Only care that actually happened. Counting a referral still sitting in the
  // queue would bill the region for savings it has not made yet.
  const retained = (referrals.data ?? [])
    .filter((r) => r.status === "completed")
    .reduce((s, r) => s + r.retained_value_usd, 0);
  const criticalAlerts = (alerts.data ?? []).filter(
    (a) => a.severity === "critical" || a.severity === "high",
  );

  const riskByIsland = new Map<string, number>();
  const patientIsland = new Map((patients.data ?? []).map((p) => [p.id, p.island_code]));
  for (const r of risks.data ?? []) {
    if (r.band === "critical" || r.band === "high") {
      const code = patientIsland.get(r.patient_id);
      if (code) riskByIsland.set(code, (riskByIsland.get(code) ?? 0) + 1);
    }
  }
  const hotspot = [...riskByIsland.entries()].sort((a, b) => b[1] - a[1])[0];

  return (
    <>
      <Greeting subtitle="Population risk, capacity and supply across eleven Caribbean health systems — from Cuba's clinical depth to Haiti's shortfall — in one operational picture." />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="High-risk population"
          value={highRisk}
          hint="Queued for outreach today"
          tone="critical"
        />
        <Stat
          label="Open system alerts"
          value={alerts.data?.length ?? 0}
          hint={`${criticalAlerts.length} critical/high`}
        />
        <Stat
          label="Medication stockouts"
          value={stockouts}
          hint="Facilities below safe cover"
          tone="critical"
        />
        <Stat
          label="Care retained in-region"
          value={usd(retained)}
          hint="Kept out of Miami this quarter"
          tone="low"
        />
      </section>

      <section className="grid items-start gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Panel className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h3 className="font-display text-[15px] font-semibold">Island risk picture</h3>
            </div>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary"
            >
              Open coordination <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="mt-4 space-y-2">
            {(islands.data ?? []).map((island) => {
              const count = riskByIsland.get(island.code) ?? 0;
              const max = Math.max(1, ...[...riskByIsland.values()]);
              return (
                <div key={island.code} className="flex items-center gap-3">
                  <span className="w-24 truncate text-[12.5px] font-medium">{island.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        count > max * 0.6 ? "bg-critical" : "bg-primary",
                      )}
                      style={{ width: `${Math.max(3, (count / max) * 100)}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-mono text-[12px] text-muted-foreground">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
          {hotspot && (
            <p className="mt-4 text-[12.5px] text-muted-foreground">
              Current hotspot: <strong className="text-foreground">{hotspot[0]}</strong> with{" "}
              {hotspot[1]} high-risk patients.
            </p>
          )}
        </Panel>

        <Panel className="p-5">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <h3 className="font-display text-[15px] font-semibold">Needs a decision</h3>
          </div>
          <ul className="mt-4 space-y-2.5">
            {criticalAlerts.slice(0, 5).map((a) => (
              <li key={a.id} className="rounded-lg border border-border bg-surface p-3 text-[13px]">
                <p className="font-medium">{a.title}</p>
                <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">{a.detail}</p>
              </li>
            ))}
            {criticalAlerts.length === 0 && (
              <li className="text-[13px] text-muted-foreground">No critical alerts open.</li>
            )}
          </ul>
        </Panel>
      </section>

      <p className="text-[12px] text-muted-foreground">
        {facilities.data?.length ?? 0} facilities reporting · capacity data refreshed continuously.
      </p>
    </>
  );
}

/* ---------------- Insurer home ---------------- */

function InsurerHome() {
  const patients = useQuery(patientsQuery);
  const referrals = useQuery(referralsQuery);
  const risks = useQuery(riskScoresQuery);
  const grants = useQuery(consentGrantsQuery);

  const members = patients.data ?? [];
  const insured = members.filter((p: Patient) => p.insurer);
  const enrolled = (grants.data ?? []).filter(
    (g) => g.scope.includes("vitals") && g.status === "active",
  ).length;
  // Only care that actually happened. Counting a referral still sitting in the
  // queue would bill the region for savings it has not made yet.
  const retained = (referrals.data ?? [])
    .filter((r) => r.status === "completed")
    .reduce((s, r) => s + r.retained_value_usd, 0);
  const highRisk = (risks.data ?? []).filter(
    (r) => r.band === "critical" || r.band === "high",
  ).length;

  return (
    <>
      <Greeting subtitle="Live adherence and monitoring data turns chronic-disease pricing from guesswork into an incentive engine." />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Members in network"
          value={insured.length}
          hint="With a Caribbean Mutual policy"
        />
        <Stat
          label="Sharing vitals with us"
          value={enrolled}
          hint="Consent-gated, member-approved"
          tone="signal"
        />
        <Stat
          label="High-risk members"
          value={highRisk}
          hint="Candidates for outreach incentives"
          tone="critical"
        />
        <Stat
          label="Avoided evacuation cost"
          value={usd(retained)}
          hint="Care routed in-region instead"
          tone="low"
        />
      </section>

      <section className="grid items-start gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Panel className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-primary" />
              <h3 className="font-display text-[15px] font-semibold">
                How the engine pays for itself
              </h3>
            </div>
            <Link
              to="/insurer"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary"
            >
              Open insurer engine <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <ul className="mt-4 space-y-3 text-[13.5px] leading-relaxed text-muted-foreground">
            <li className="flex gap-2.5">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              Members on monitoring streaks earn premium credits — adherence becomes a discount, not
              a survey.
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              Every cross-island teleconsult that keeps a member out of Miami saves an order of
              magnitude versus evacuation and US billing.
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              Risk scores recompute daily from real vitals, so pricing reflects this week — not a
              1990s actuarial table.
            </li>
          </ul>
        </Panel>

        <Panel className="p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h3 className="font-display text-[15px] font-semibold">Data access standing</h3>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            Every data pull is consent-gated and logged in the shared ledger. Members can revoke at
            any time, and revocations take effect immediately.
          </p>
          <Link
            to="/consent"
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-[13px] font-semibold"
          >
            View consent ledger
          </Link>
        </Panel>
      </section>
    </>
  );
}

/* ---------------- Home ---------------- */

function Home() {
  const { profile, role } = useAuth();
  const providers = useQuery(providersQuery);
  const provider = providers.data?.find((p) => p.id === profile?.provider_id) ?? null;

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-8 px-5 py-8">
      {role === "patient" ? (
        <PatientHome />
      ) : role === "clinician" ? (
        <ClinicianHome provider={provider} />
      ) : role === "ministry" ? (
        <MinistryHome />
      ) : role === "insurer" ? (
        <InsurerHome />
      ) : (
        <>
          <Greeting subtitle="A coordination layer connecting detection, access and treatment across eight Caribbean islands." />
        </>
      )}
      {role === "patient" ? null : <ActivityFeed maxHeight="420px" />}
      {/* A list of links is never part of a printed document. */}
      <div className="screen-only">
        <SurfaceLinks />
      </div>
    </div>
  );
}
