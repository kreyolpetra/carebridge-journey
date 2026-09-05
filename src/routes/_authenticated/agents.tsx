/**
 * Agent activity — the access log, for the agents.
 *
 * A patient can already see every human who opened their record. An automated
 * reader that summarises that same record and puts a recommendation in front of
 * a clinician gets the same treatment here: every run, what it called, what
 * consent refused it, and what the human did about it.
 *
 * The acceptance rate is the column that matters. An agent nobody accepts is an
 * agent nobody needs, and this makes that visible rather than leaving it to be
 * inferred from how enthusiastic the demo was.
 */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, ShieldOff, Check, X, Cpu, Clock } from "lucide-react";
import {
  agentActivityQuery,
  summarise,
  computeCase,
  type AgentActivity,
} from "@/lib/agents/activity";
import { ADAPTERS } from "@/lib/agents/model";
import { Panel, PanelHeader, Pill, Stat, Loading, SectionTitle } from "@/components/grid";
import { clockTime, shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/agents")({ component: AgentActivityPage });

function pct(n: number | null) {
  return n === null ? "—" : `${Math.round(n * 100)}%`;
}

function AgentActivityPage() {
  const activity = useQuery(agentActivityQuery);
  const [agentFilter, setAgentFilter] = useState<string>("all");

  const rows = useMemo(() => {
    const all = (activity.data ?? []) as AgentActivity[];
    return agentFilter === "all" ? all : all.filter((r) => r.agent === agentFilter);
  }, [activity.data, agentFilter]);

  const stats = useMemo(() => summarise(rows), [rows]);
  const compute = useMemo(() => computeCase(rows), [rows]);
  const agents = useMemo(
    () => [...new Set((activity.data ?? []).map((r) => r.agent))],
    [activity.data],
  );

  return (
    <div className="mx-auto w-full max-w-[1300px] px-5 py-8">
      <SectionTitle
        eyebrow="Governance"
        title="Agent activity"
        blurb="Every run an agent has made: what it called, what consent refused it, how sure it said it was, and whether a clinician accepted it."
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Runs recorded" value={stats.runs} hint="Last 500, newest first" />
        <Stat
          label="Accepted by a clinician"
          value={pct(stats.acceptRate)}
          tone="low"
          hint={`${stats.accepted} of ${stats.decided} decided`}
        />
        <Stat
          label="Reads consent refused"
          value={stats.denied}
          tone={stats.denied ? "critical" : "default"}
          hint="Withheld, and said so in the trace"
        />
        <Stat
          label="Median run"
          value={`${stats.medianMs.toFixed(1)}ms`}
          hint={`p95 ${stats.p95Ms.toFixed(1)}ms · ${stats.toolCalls} tool calls`}
        />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        <Panel>
          <PanelHeader
            title="Runs"
            subtitle="Newest first. A run with no decision is one a clinician has not answered yet."
            right={
              <div className="flex flex-wrap gap-1.5">
                {["all", ...agents].map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAgentFilter(a)}
                    className={
                      "rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors " +
                      (agentFilter === a
                        ? "bg-primary/12 text-primary"
                        : "text-muted-foreground hover:text-foreground")
                    }
                  >
                    {a === "all" ? "All agents" : a}
                  </button>
                ))}
              </div>
            }
          />
          {activity.isLoading ? <Loading label="Reading the agent log…" /> : null}
          {!activity.isLoading && !rows.length ? (
            <p className="px-5 py-6 text-[13px] leading-relaxed text-muted-foreground">
              No agent has run yet. Send a message on a patient's care line, or prepare a consult
              brief, and it will appear here.
            </p>
          ) : null}
          <div className="max-h-[560px] overflow-y-auto">
            <table className="w-full border-collapse text-[13px]">
              <tbody>
                {rows.slice(0, 120).map((r) => (
                  <tr key={r.id} className="border-b border-border/70 last:border-0">
                    <td className="px-5 py-2.5">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                        {r.agent}
                        <span className="mono-num text-[11.5px] font-normal text-muted-foreground">
                          {r.model_id}
                        </span>
                      </p>
                      <p className="mono-num mt-0.5 text-[11.5px] text-muted-foreground">
                        {shortDate(r.started_at)} {clockTime(r.started_at)} · {r.patient_name} ·{" "}
                        {r.tool_calls} tools · {r.findings} findings · {r.ms.toFixed(1)}ms ·
                        confidence {r.confidence.toFixed(2)}
                      </p>
                    </td>
                    <td className="w-[210px] px-5 py-2.5 text-right">
                      <span className="inline-flex flex-wrap justify-end gap-1.5">
                        {r.denied_calls ? (
                          <Pill className="border-critical/40 bg-critical/10 text-critical">
                            <ShieldOff className="h-3 w-3" />
                            {r.denied_calls} refused
                          </Pill>
                        ) : null}
                        {r.decision === "accepted" ? (
                          <Pill className="border-low/40 bg-low/10 text-low">
                            <Check className="h-3 w-3" />
                            accepted
                          </Pill>
                        ) : r.decision === "dismissed" ? (
                          <Pill className="border-border bg-surface text-muted-foreground">
                            <X className="h-3 w-3" />
                            dismissed
                          </Pill>
                        ) : (
                          <Pill className="border-high/40 bg-high/10 text-high">undecided</Pill>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="By agent" subtitle="Runs, and how often a human took the advice" />
            <div className="divide-y divide-border">
              {stats.perAgent.map((a) => (
                <div key={a.agent} className="px-5 py-3">
                  <p className="flex items-center justify-between gap-3 text-[13.5px] font-semibold">
                    {a.agent}
                    <span className="mono-num text-[13px]">{a.runs}</span>
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {a.accepted} accepted · {a.denied} reads refused
                  </p>
                  {/* The bar is the acceptance share, which is the number worth
                      looking at twice. */}
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full rounded-full bg-low"
                      style={{ width: `${a.runs ? (a.accepted / a.runs) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="What is producing these"
              subtitle="And what the alternative would need"
            />
            <div className="space-y-3 px-5 py-4">
              {ADAPTERS.map((a) => (
                <div
                  key={a.id}
                  className={
                    "rounded-xl border px-3.5 py-3 " +
                    (a.live ? "border-primary/40 bg-primary/6" : "border-border bg-surface")
                  }
                >
                  <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
                    <Cpu className="h-3.5 w-3.5 shrink-0" />
                    {a.label}
                    {a.live ? (
                      <Pill className="border-primary/40 bg-primary/12 text-primary">live</Pill>
                    ) : (
                      <Pill className="border-border bg-background text-muted-foreground">
                        not configured
                      </Pill>
                    )}
                  </p>
                  <p className="mono-num mt-1 text-[11px] text-muted-foreground">{a.id}</p>
                  {a.requiresGpu ? (
                    <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                      {compute.memoryNote ||
                        "70B at FP8 with a KV cache for concurrent triage — 141GB (H200), not 80GB (H100)."}
                    </p>
                  ) : null}
                </div>
              ))}

              <div className="rounded-xl border border-border bg-surface px-3.5 py-3">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold">
                  <Clock className="h-3.5 w-3.5" />
                  Measured load
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  {compute.perDay} runs in this log, about{" "}
                  <span className="font-semibold text-foreground">
                    {compute.peakPerMinute} a minute
                  </span>{" "}
                  at the peak of a clinic window. That concurrency, not the model's size alone, is
                  what sets the memory the card has to hold.
                </p>
              </div>

              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Swapping engines is one assignment in{" "}
                <span className="mono-num">lib/agents/model.ts</span>. The tools, the consent gate,
                the trace and the clinician's approval do not move.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
