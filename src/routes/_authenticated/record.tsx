import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import {
  HeartPulse,
  Pill as PillIcon,
  Stethoscope,
  FileText,
  CalendarDays,
  ChevronRight,
  Lock,
} from "lucide-react";
import { HERO_PATIENT_ID, patientBundleQuery, providersQuery, type Consultation } from "@/lib/api";
import { VisitDialog, resultsForVisit } from "@/components/VisitDialog";
import { CareNetwork } from "@/components/CareNetwork";
import { CooperativeCard } from "@/components/patient/CooperativeCard";
import { HomeReadingCard } from "@/components/HomeReadingCard";
import { Panel, PanelHeader, Pill, Stat, Loading } from "@/components/grid";
import {
  bandClasses,
  severityClasses,
  shortDate,
  timeAgo,
  clockTime,
  LANGUAGE_LABEL,
} from "@/lib/format";
import { useScope } from "@/hooks/useScope";
import { useLogRecordAccess } from "@/lib/audit";
import { SENSITIVE_LABEL, isSensitive, isGrantActive } from "@/lib/access";
import { useAccessDecision } from "@/lib/access-basis";

export const Route = createFileRoute("/_authenticated/record")({
  head: () => ({
    meta: [
      { title: "My Health Record — Vitals, Medications & Care History | CariCare Grid" },
      {
        name: "description",
        content:
          "Your full chronic-care record in one place: risk score, blood pressure and glucose trends, medications, conditions, triage history and referrals.",
      },
      { property: "og:title", content: "My Health Record — CariCare Grid" },
      {
        property: "og:description",
        content:
          "Every reading, medication and referral in your chronic-care record, in plain language.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MyRecord,
});

function MyRecord() {
  const { isPatient, patientId } = useScope();
  const id = isPatient ? (patientId ?? HERO_PATIENT_ID) : HERO_PATIENT_ID;
  const bundle = useQuery(patientBundleQuery(id));
  // A third party opening this view resolves a basis like anywhere else; a
  // patient reading their own record is not a third-party access at all.
  const accessDecision = useAccessDecision(isPatient ? null : id);
  useLogRecordAccess(isPatient ? null : id, "Full clinical record (record view)", accessDecision);
  const providers = useQuery(providersQuery);
  const [openVisit, setOpenVisit] = useState<Consultation | null>(null);
  const b = bundle.data;

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

  const latest = b?.vitals[0];
  const providerName = (pid: string | null) =>
    providers.data?.find((p) => p.id === pid)?.full_name ?? "Care team";

  if (!b) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-5 py-8">
        <Panel>
          <Loading label="Opening your record…" />
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-4 px-5 py-8">
      <Panel>
        <PanelHeader
          title={`${b.patient.full_name} · ${b.patient.age}${b.patient.sex}`}
          subtitle={`${b.patient.parish}, ${b.patient.island_code} · ${b.patient.km_to_facility} km from the clinic · ${LANGUAGE_LABEL[b.patient.language] ?? b.patient.language} · ${b.patient.insurer ?? "Uninsured"}`}
          right={
            b.risk ? <Pill className={bandClasses(b.risk.band)}>risk {b.risk.score}</Pill> : null
          }
        />
        <div className="grid gap-3 p-5 sm:grid-cols-4">
          <Stat
            label="Blood pressure"
            value={latest?.systolic ? `${latest.systolic}/${latest.diastolic ?? "—"}` : "—"}
            hint={latest ? `Last reading ${timeAgo(latest.measured_at)}` : "No readings yet"}
            tone={latest?.systolic && latest.systolic >= 160 ? "critical" : "default"}
          />
          <Stat
            label="Blood sugar"
            value={latest?.glucose_mmol ? `${Number(latest.glucose_mmol).toFixed(1)}` : "—"}
            hint="mmol/L, most recent"
          />
          <Stat
            label="Medications"
            value={b.medications.length}
            hint={`${b.medications.filter((m) => m.days_supply_left <= 7).length} need a refill soon`}
          />
          <Stat
            label="Conditions"
            value={b.conditions.length}
            hint="Long-term conditions on file"
            tone="signal"
          />
        </div>
      </Panel>

      <HomeReadingCard patientId={id} />

      <CareNetwork patientId={id} patientFirstName={b.patient?.full_name?.split(" ")[0]} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Blood pressure over time" subtitle="Every reading you have sent in" />
          <div className="h-[240px] p-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[50, 200]} />
                <Tooltip />
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
          <PanelHeader title="Blood sugar over time" subtitle="mmol/L" />
          <div className="h-[240px] p-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="glucose"
                  stroke="var(--color-primary)"
                  fill="var(--color-primary)"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="My conditions" subtitle="What you are being treated for" />
          <div className="divide-y divide-border">
            {b.conditions.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-muted-foreground">Nothing on file yet.</p>
            ) : (
              b.conditions.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <span className="flex items-center gap-2 text-[13.5px] font-semibold">
                    <HeartPulse className="h-4 w-4 text-primary" /> {c.name}
                    {isSensitive((c as { sensitivity?: string }).sensitivity) ? (
                      <Pill className="border-high/40 bg-high/10 text-high">
                        <Lock className="h-3 w-3" />
                        sealed ·{" "}
                        {SENSITIVE_LABEL[(c as { sensitivity?: string }).sensitivity ?? ""] ??
                          "sensitive"}
                      </Pill>
                    ) : null}
                  </span>
                  <span className="text-[12px] text-muted-foreground">
                    since {new Date(c.diagnosed_on).getFullYear()}
                  </span>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="My medications"
            subtitle="Doses, supply left and how well you are keeping up"
          />
          <div className="divide-y divide-border">
            {b.medications.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-muted-foreground">
                No medications recorded.
              </p>
            ) : (
              b.medications.map((m) => (
                <div key={m.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-[13.5px] font-semibold">
                      <PillIcon className="h-4 w-4 text-primary" /> {m.name} {m.dosage}
                    </span>
                    <Pill
                      className={
                        m.days_supply_left <= 7 ? bandClasses("critical") : bandClasses("low")
                      }
                    >
                      {m.days_supply_left}d left
                    </Pill>
                  </div>
                  <div className="mt-1.5 text-[12px] text-muted-foreground">
                    {m.frequency} · taking {m.adherence_pct}% of doses
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
                    <div
                      className={
                        "h-full rounded-full " +
                        (m.adherence_pct < 70 ? "bg-critical" : "bg-primary")
                      }
                      style={{ width: `${Math.min(100, m.adherence_pct)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="My visits"
          subtitle="Every appointment, when it happened and what your clinician wrote"
          right={<Pill className={bandClasses("low")}>{b.consultations.length} on file</Pill>}
        />
        <div className="divide-y divide-border">
          {b.consultations.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-muted-foreground">No visits booked yet.</p>
          ) : (
            b.consultations.map((c) => {
              const when = new Date(c.scheduled_at);
              const upcoming = when.getTime() > Date.now();
              const resultCount = resultsForVisit(c.scheduled_at, b.vitals).length;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setOpenVisit(c)}
                  className="block w-full cursor-pointer px-5 py-4 text-left transition-colors hover:bg-surface focus:bg-surface focus:outline-none"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-[13.5px] font-semibold">
                      <CalendarDays className="h-4 w-4 text-primary" />
                      {when.toLocaleDateString([], {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      · {clockTime(c.scheduled_at)}
                    </span>
                    <div className="flex items-center gap-2">
                      <Pill className={bandClasses(upcoming ? "moderate" : "low")}>
                        {upcoming ? "upcoming" : c.status}
                      </Pill>
                      <span className="text-[11.5px] text-muted-foreground">
                        {timeAgo(c.scheduled_at)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1.5 text-[12.5px] text-muted-foreground">
                    with {providerName(c.provider_id)}
                  </div>
                  {c.notes ? (
                    <p className="mt-2 line-clamp-2 rounded-lg bg-surface px-3 py-2 text-[12.5px] leading-relaxed">
                      <span className="font-semibold">Visit notes: </span>
                      {c.notes}
                    </p>
                  ) : null}
                  <div className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-primary">
                    Open visit details
                    {resultCount > 0 ? (
                      <span className="font-normal text-muted-foreground">
                        · {resultCount} reading{resultCount === 1 ? "" : "s"} on file
                      </span>
                    ) : null}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="What the Grid found"
            subtitle="Every time your messages were triaged"
          />
          <div className="divide-y divide-border">
            {b.triage.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-muted-foreground">
                Nothing yet — send a message on{" "}
                <Link to="/patient" className="text-primary underline">
                  your care line
                </Link>
                .
              </p>
            ) : (
              b.triage.map((t) => (
                <div key={t.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <Pill className={severityClasses(t.severity)}>
                      {t.severity.replace("_", " ")}
                    </Pill>
                    <span className="text-[11.5px] text-muted-foreground">
                      {timeAgo(t.created_at)}
                    </span>
                  </div>
                  <div className="mt-1.5 text-[13px] font-semibold">{t.category}</div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                    {t.rationale}
                  </p>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="My referrals"
            subtitle="Where you have been sent and how long it took"
          />
          <div className="divide-y divide-border">
            {b.referrals.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-muted-foreground">No referrals on file.</p>
            ) : (
              b.referrals.map((r) => (
                <div key={r.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-[13.5px] font-semibold">
                      <Stethoscope className="h-4 w-4 text-primary" /> {r.specialty}
                    </span>
                    <Pill className={bandClasses(r.status === "completed" ? "low" : "moderate")}>
                      {r.status}
                    </Pill>
                  </div>
                  <div className="mt-1.5 text-[12.5px] text-muted-foreground">
                    {providerName(r.to_provider_id)}
                    {r.cross_island ? " · seen from another island" : " · seen locally"} · waited{" "}
                    {r.wait_days_routed} days instead of {r.wait_days_local}
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Who can see this record"
          subtitle="You control every share, and it is all written down"
          right={
            <Link
              to="/consent"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-semibold hover:bg-surface"
            >
              <FileText className="h-3.5 w-3.5" /> Open consent ledger
            </Link>
          }
        />
        <div className="divide-y divide-border">
          {b.grants.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-muted-foreground">
              Nobody outside your clinic has access.
            </p>
          ) : (
            b.grants.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold">
                    {providerName(g.provider_id)}
                  </div>
                  <div className="truncate text-[12px] text-muted-foreground">
                    {g.purpose} · {g.scope.join(", ")}
                  </div>
                </div>
                <Pill
                  className={bandClasses(
                    isGrantActive(g.status)
                      ? "low"
                      : g.status === "pending"
                        ? "moderate"
                        : "critical",
                  )}
                >
                  {g.status}
                </Pill>
              </div>
            ))
          )}
        </div>
      </Panel>

      <CooperativeCard patientId={id} />

      <VisitDialog
        visit={openVisit}
        onOpenChange={(open) => !open && setOpenVisit(null)}
        provider={providers.data?.find((p) => p.id === openVisit?.provider_id)}
        vitals={b.vitals}
        triage={b.triage}
        referral={b.referrals.find((r) => r.id === openVisit?.referral_id)}
        medications={b.medications}
      />
    </div>
  );
}
