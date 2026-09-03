/**
 * The day-to-day half of a patient's own view: trends, conditions, medications.
 *
 * These lived on "My record", which had grown to hold both the things a
 * patient checks daily and the formal history of their care. Those are
 * different questions — "how am I doing" and "what is on file about me" — and
 * a patient wanting today's blood pressure had to scroll past their care
 * network and visit archive to reach it.
 *
 * The split puts these on My health and leaves the record as the archive. They
 * live here rather than being copied so the two pages cannot drift.
 */
import { useMemo } from "react";
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
import { HeartPulse, Pill as PillIcon, Lock } from "lucide-react";
import type { PatientBundle } from "@/lib/api";
import { Panel, PanelHeader, Pill } from "@/components/grid";
import { bandClasses, shortDate } from "@/lib/format";
import { SENSITIVE_LABEL, isSensitive } from "@/lib/access";

export function HealthTrends({ bundle: b }: { bundle: PatientBundle }) {
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
    </>
  );
}
