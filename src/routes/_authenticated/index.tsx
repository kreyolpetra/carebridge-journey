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
import { Panel, Stat } from "@/components/grid";
import { usd, timeAgo } from "@/lib/format";
import { activityQuery, type ActivityItem } from "@/lib/activity";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABEL } from "@/lib/demo-accounts";
import { navFor } from "@/lib/nav";
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
      { title: "Home — CariCare Grid" },
      {
        name: "description",
        content:
          "Your role-aware CariCare Grid home: patient line, clinician queue, regional coordination or insurer engine, personalised to your sign-in.",
      },
      { property: "og:title", content: "CariCare Grid — The Front Door to Caribbean Healthcare" },
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
          {role === "patient" ? `Hello, ${firstName(name)}.` : `Good day, ${firstName(name)}.`}
        </h1>
        <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function SurfaceLinks() {
  const { role } = useAuth();
  const items = navFor(role).filter((i) => i.group === "Work" && i.to !== "/");
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
                Open <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
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
  const patientId = profile?.patient_id;
  const bundle = useQuery({
    ...patientBundleQuery(patientId ?? "none"),
    enabled: Boolean(patientId),
  });

  const risk = bundle.data?.risk;
  const latestVital = bundle.data?.vitals[0];
  const activeGrants = (bundle.data?.grants ?? []).filter((g) => g.status === "active");
  const meds = bundle.data?.medications ?? [];
  const lowMeds = meds.filter((m) => m.days_supply_left <= 7);
  const adherence = meds.length
    ? Math.round(meds.reduce((s, m) => s + m.adherence_pct, 0) / meds.length)
    : null;

  return (
    <>
      <Greeting subtitle="Your health on the Grid: today’s readings, your medications, and who can see your record — all in one place." />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="My risk level"
          value={risk ? `${risk.band.toUpperCase()} · ${Math.round(risk.score)}` : "—"}
          hint={risk ? `Trend: ${risk.trend}` : "Log a reading to compute"}
          tone={risk?.band === "critical" || risk?.band === "high" ? "critical" : "low"}
        />
        <Stat
          label="Latest blood pressure"
          value={latestVital?.systolic ? `${latestVital.systolic}/${latestVital.diastolic}` : "—"}
          hint={latestVital ? new Date(latestVital.measured_at).toLocaleDateString() : "No readings yet"}
          tone="signal"
        />
        <Stat
          label="Medication adherence"
          value={adherence !== null ? `${adherence}%` : "—"}
          hint={lowMeds.length ? `${lowMeds.length} refill${lowMeds.length > 1 ? "s" : ""} due within 7 days` : "Refills on track"}
        />
        <Stat
          label="Who can see my record"
          value={activeGrants.length}
          hint="Active consent grants"
          tone="signal"
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Panel className="p-5">
          <div className="flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-primary" />
            <h3 className="font-display text-[15px] font-semibold">What needs my attention</h3>
          </div>
          <ul className="mt-4 space-y-3 text-[13.5px]">
            {risk && (risk.band === "high" || risk.band === "critical" || risk.band === "rising") ? (
              <li className="flex gap-2.5 rounded-lg border border-critical/25 bg-critical/5 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-critical" />
                <span>
                  Your risk is <strong className={bandTone(risk.band)}>{risk.band}</strong>.{" "}
                  {risk.drivers[0] ? `Main driver: ${risk.drivers[0].label}.` : ""} Message the line today so a
                  clinician can review you.
                </span>
              </li>
            ) : (
              <li className="flex gap-2.5 rounded-lg border border-low/25 bg-low/5 p-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-low" />
                <span>Your readings look steady. Keep logging daily — it keeps your risk score accurate.</span>
              </li>
            )}
            {lowMeds.map((m) => (
              <li key={m.id} className="flex gap-2.5 rounded-lg border border-border bg-surface p-3">
                <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  <strong>{m.name}</strong> has {m.days_supply_left} days left — ask the line to route a refill before
                  it runs out.
                </span>
              </li>
            ))}
            <li className="flex gap-2.5 rounded-lg border border-border bg-surface p-3">
              <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                Feeling unwell? Message the patient line in plain language — Patois or English — and the AI triage
                will route you.
              </span>
            </li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link
              to="/patient"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground"
            >
              Open my patient line <ArrowRight className="h-4 w-4" />
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
          <ul className="mt-4 space-y-2.5">
            {activeGrants.length === 0 && (
              <li className="text-[13px] text-muted-foreground">No active grants — only your care team sees your record.</li>
            )}
            {activeGrants.slice(0, 4).map((g) => (
              <li key={g.id} className="rounded-lg border border-border bg-surface p-3 text-[13px]">
                <p className="font-medium">{g.purpose}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  Scope: {g.scope.join(", ")}
                  {g.expires_at ? ` · expires ${new Date(g.expires_at).toLocaleDateString()}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      <PatientActivity patientId={patientId ?? null} />
    </>
  );
}

function PatientActivity({ patientId }: { patientId: string | null }) {
  const feed = useQuery({ ...activityQuery(patientId), enabled: Boolean(patientId) });
  const items = (feed.data ?? []).slice(0, 12);

  return (
    <section>
      <Panel className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <h3 className="font-display text-[15px] font-semibold">My activity</h3>
          </div>
          <span className="text-[12px] text-muted-foreground">Live · your record only</span>
        </div>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Your messages, triage results, referrals and every time your file was opened.
        </p>
        <div className="mt-4 divide-y divide-border/60">
          {feed.isLoading ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">Loading your activity…</p>
          ) : null}
          {!feed.isLoading && !items.length ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">Nothing on your record yet.</p>
          ) : null}
          {items.map((item) => {
            const meta = ACTIVITY_META[item.kind];
            return (
              <div key={item.id} className="flex gap-3 py-3 first:pt-0">
                <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", meta.tone)}>
                  <meta.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold">{item.title}</p>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">{item.detail}</p>
                </div>
                <span className="shrink-0 text-[11.5px] text-muted-foreground">{timeAgo(item.at)}</span>
              </div>
            );
          })}
        </div>
      </Panel>
    </section>
  );
}


/* ---------------- Clinician home ---------------- */

function ClinicianHome({ provider }: { provider: Provider | null }) {
  const risks = useQuery(riskScoresQuery);
  const patients = useQuery(patientsQuery);
  const referrals = useQuery(referralsQuery);
  const slots = useQuery(slotsQuery);

  const patientById = new Map((patients.data ?? []).map((p) => [p.id, p]));
  const queue = (risks.data ?? []).filter((r) => r.band === "critical" || r.band === "high");
  const myReferrals = (referrals.data ?? []).filter(
    (r) => provider && r.to_provider_id === provider.id && r.status !== "completed",
  );
  const mySlots = (slots.data ?? []).filter((s) => provider && s.provider_id === provider.id && s.status === "open");
  const topQueue = queue.slice(0, 5);

  return (
    <>
      <Greeting
        subtitle={`${provider ? `${provider.specialty} · ${provider.island_code}` : "Regional clinician"} — your queue is ranked by risk, not arrival order.`}
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="High-risk queue" value={queue.length} hint="Critical + high, region-wide" tone="critical" />
        <Stat
          label="Referrals routed to me"
          value={myReferrals.length}
          hint="Cross-island teleconsults awaiting review"
          tone="signal"
        />
        <Stat label="My open teleconsult slots" value={mySlots.length} hint="Bookable by other islands" tone="low" />
        <Stat
          label="Avg. local wait bypassed"
          value={myReferrals.length ? `${Math.round(myReferrals.reduce((s, r) => s + (r.wait_days_local - r.wait_days_routed), 0) / myReferrals.length)} days` : "—"}
          hint="Saved per routed patient"
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Panel className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-primary" />
              <h3 className="font-display text-[15px] font-semibold">Highest-risk patients right now</h3>
            </div>
            <Link to="/clinician" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary">
              Open console <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-border">
            {topQueue.map((r) => {
              const p = patientById.get(r.patient_id);
              return (
                <li key={r.id}>
                  <Link
                    to="/clinician"
                    search={{ patient: r.patient_id }}
                    className="flex items-center gap-3 py-2.5 transition-colors hover:text-primary"
                  >
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 font-mono text-[11px] font-bold",
                        r.band === "critical" ? "bg-critical/10 text-critical" : "bg-[#b45309]/10 text-[#b45309]",
                      )}
                    >
                      {Math.round(r.score)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{p?.full_name ?? "Patient"}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {p ? `${p.island_code} · ${p.parish}` : ""} · {r.drivers[0]?.label ?? "Multiple drivers"}
                      </span>
                    </span>
                    <span className="text-[11.5px] uppercase tracking-wide text-muted-foreground">{r.band}</span>
                  </Link>
                </li>
              );
            })}
            {topQueue.length === 0 && <li className="py-3 text-[13px] text-muted-foreground">Queue is clear.</li>}
          </ul>
        </Panel>

        <Panel className="p-5">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            <h3 className="font-display text-[15px] font-semibold">Referrals waiting on me</h3>
          </div>
          <ul className="mt-4 space-y-2.5">
            {myReferrals.slice(0, 4).map((r) => {
              const p = patientById.get(r.patient_id);
              return (
                <li key={r.id} className="rounded-lg border border-border bg-surface p-3 text-[13px]">
                  <p className="font-medium">
                    {p?.full_name ?? "Patient"} · {r.specialty}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {r.cross_island ? "Cross-island" : "Local"} · local wait {r.wait_days_local}d → routed{" "}
                    {r.wait_days_routed}d · {r.status}
                  </p>
                </li>
              );
            })}
            {myReferrals.length === 0 && (
              <li className="text-[13px] text-muted-foreground">No pending referrals routed to you.</li>
            )}
          </ul>
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

  const highRisk = (risks.data ?? []).filter((r) => r.band === "critical" || r.band === "high").length;
  const stockouts = (stock.data ?? []).filter((s) => s.status !== "ok").length;
  const retained = (referrals.data ?? []).reduce((s, r) => s + r.retained_value_usd, 0);
  const criticalAlerts = (alerts.data ?? []).filter((a) => a.severity === "critical" || a.severity === "high");

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
        <Stat label="High-risk population" value={highRisk} hint="Queued for outreach today" tone="critical" />
        <Stat label="Open system alerts" value={alerts.data?.length ?? 0} hint={`${criticalAlerts.length} critical/high`} />
        <Stat label="Medication stockouts" value={stockouts} hint="Facilities below safe cover" tone="critical" />
        <Stat label="Care retained in-region" value={usd(retained)} hint="Kept out of Miami this quarter" tone="low" />
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Panel className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h3 className="font-display text-[15px] font-semibold">Island risk picture</h3>
            </div>
            <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary">
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
                      className={cn("h-full rounded-full", count > max * 0.6 ? "bg-critical" : "bg-primary")}
                      style={{ width: `${Math.max(3, (count / max) * 100)}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-mono text-[12px] text-muted-foreground">{count}</span>
                </div>
              );
            })}
          </div>
          {hotspot && (
            <p className="mt-4 text-[12.5px] text-muted-foreground">
              Current hotspot: <strong className="text-foreground">{hotspot[0]}</strong> with {hotspot[1]} high-risk
              patients.
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
  const enrolled = (grants.data ?? []).filter((g) => g.scope.includes("vitals") && g.status === "active").length;
  const retained = (referrals.data ?? []).reduce((s, r) => s + r.retained_value_usd, 0);
  const highRisk = (risks.data ?? []).filter((r) => r.band === "critical" || r.band === "high").length;

  return (
    <>
      <Greeting subtitle="Live adherence and monitoring data turns chronic-disease pricing from guesswork into an incentive engine." />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Members in network" value={insured.length} hint="With a Caribbean Mutual policy" />
        <Stat label="Sharing vitals with us" value={enrolled} hint="Consent-gated, member-approved" tone="signal" />
        <Stat label="High-risk members" value={highRisk} hint="Candidates for outreach incentives" tone="critical" />
        <Stat label="Avoided evacuation cost" value={usd(retained)} hint="Care routed in-region instead" tone="low" />
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Panel className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-primary" />
              <h3 className="font-display text-[15px] font-semibold">How the engine pays for itself</h3>
            </div>
            <Link to="/insurer" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary">
              Open insurer engine <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <ul className="mt-4 space-y-3 text-[13.5px] leading-relaxed text-muted-foreground">
            <li className="flex gap-2.5">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              Members on monitoring streaks earn premium credits — adherence becomes a discount, not a survey.
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              Every cross-island teleconsult that keeps a member out of Miami saves an order of magnitude versus
              evacuation and US billing.
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              Risk scores recompute daily from real vitals, so pricing reflects this week — not a 1990s actuarial
              table.
            </li>
          </ul>
        </Panel>

        <Panel className="p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h3 className="font-display text-[15px] font-semibold">Data access standing</h3>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            Every data pull is consent-gated and logged in the shared ledger. Members can revoke at any time, and
            revocations take effect immediately.
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
      <SurfaceLinks />
    </div>
  );
}
