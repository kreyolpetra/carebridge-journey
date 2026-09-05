/**
 * The access log, for the agents.
 *
 * The product already tells a patient every human who opened their record and
 * on what basis. An automated reader that summarises the same record and puts
 * a recommendation in front of a clinician deserves exactly the same treatment,
 * and had none: a run appeared inline, was accepted or thrown out, and vanished.
 * Nobody could answer "what has this thing been doing", which is the first
 * question any clinical governance committee asks about software that reads
 * notes.
 *
 * So every run is written down: which agent, which engine produced it, how long
 * it took, which tools it called, which reads consent refused, how confident it
 * said it was, and — the column that matters most — whether a human accepted it.
 *
 * That last one is the honest measure of whether any of this is useful. An
 * agent nobody accepts is an agent nobody needs, and the number is visible
 * rather than inferred from enthusiasm.
 *
 * It also carries the compute argument in the only form worth trusting:
 * measured throughput and latency from runs that actually happened, next to
 * what serving the same load on a model would require.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { unwrap } from "@/lib/api";
import type { AgentRun } from "./core";
import { getAdapter } from "./model";

export type AgentActivity = {
  id: string;
  /** "Intake triage" | "Pre-consult brief" | "Ask" */
  agent: string;
  /** The adapter that produced it — rules/v1 today. */
  model_id: string;
  patient_id: string | null;
  patient_name: string;
  provider_id: string | null;
  started_at: string;
  ms: number;
  tool_calls: number;
  /** Reads the consent model refused. Never zero-by-omission — see below. */
  denied_calls: number;
  findings: number;
  confidence: number;
  /** "accepted" | "dismissed" | null while a clinician has not decided. */
  decision: string | null;
  created_at: string;
};

export const agentActivityQuery = queryOptions({
  queryKey: ["agent_runs"],
  staleTime: 5_000,
  queryFn: async () =>
    unwrap<AgentActivity[]>(
      await supabase
        .from("agent_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(500),
    ),
});

/**
 * Write a run down.
 *
 * Deliberately fire-and-forget from the caller's point of view: recording that
 * an agent ran must never be able to break the thing the agent was helping
 * with. A failed write loses a log line, not a consultation.
 */
export async function recordRun(
  run: AgentRun,
  opts: { agent?: string; providerId?: string | null } = {},
): Promise<string | null> {
  try {
    const denied = run.toolCalls.filter((c) => !c.allowed).length;
    const { data, error } = await supabase
      .from("agent_runs")
      .insert({
        agent: opts.agent ?? run.agent,
        model_id: run.model,
        patient_id: run.patientId || null,
        patient_name: run.patientName || "—",
        provider_id: opts.providerId ?? null,
        started_at: run.startedAt,
        ms: run.ms,
        tool_calls: run.toolCalls.length,
        denied_calls: denied,
        findings: run.findings.length,
        confidence: run.confidence,
        decision: null,
      })
      .select()
      .single();
    if (error) return null;
    return (data as { id: string }).id;
  } catch {
    return null;
  }
}

/** What the human did with it. */
export async function recordDecision(id: string | null, decision: "accepted" | "dismissed") {
  if (!id) return;
  try {
    await supabase.from("agent_runs").update({ decision }).eq("id", id);
  } catch {
    /* a lost decision is a lost log line, not a lost consultation */
  }
}

export type ActivityStats = {
  runs: number;
  toolCalls: number;
  denied: number;
  decided: number;
  accepted: number;
  /** Null when nothing has been decided yet — rather than a misleading 0%. */
  acceptRate: number | null;
  medianMs: number;
  p95Ms: number;
  perAgent: { agent: string; runs: number; accepted: number; denied: number }[];
};

export function summarise(rows: AgentActivity[]): ActivityStats {
  const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
  const at = (q: number) =>
    ms.length ? (ms[Math.min(ms.length - 1, Math.floor(ms.length * q))] ?? 0) : 0;
  const decided = rows.filter((r) => r.decision).length;
  const accepted = rows.filter((r) => r.decision === "accepted").length;

  const byAgent = new Map<
    string,
    { agent: string; runs: number; accepted: number; denied: number }
  >();
  for (const r of rows) {
    const e = byAgent.get(r.agent) ?? { agent: r.agent, runs: 0, accepted: 0, denied: 0 };
    e.runs += 1;
    if (r.decision === "accepted") e.accepted += 1;
    e.denied += r.denied_calls;
    byAgent.set(r.agent, e);
  }

  return {
    runs: rows.length,
    toolCalls: rows.reduce((n, r) => n + r.tool_calls, 0),
    denied: rows.reduce((n, r) => n + r.denied_calls, 0),
    decided,
    accepted,
    acceptRate: decided ? accepted / decided : null,
    medianMs: at(0.5),
    p95Ms: at(0.95),
    perAgent: [...byAgent.values()].sort((a, b) => b.runs - a.runs),
  };
}

/**
 * What serving the same load on a model would take.
 *
 * Derived from runs that actually happened rather than asserted: the shape of
 * the argument is throughput → concurrency → memory, and the first number is
 * measured. Rules answer in under a millisecond, so the honest comparison is
 * not "we are fast" — it is that the same pipeline, with a model doing the
 * judgement step, needs a card that can hold the weights and a KV cache for
 * everyone in the queue at once.
 */
export function computeCase(rows: AgentActivity[]) {
  const adapter = getAdapter();
  const perDay = rows.length;
  // A regional triage line is bursty: assume the day's runs arrive across a
  // six-hour clinic window, and size for the peak minute rather than the mean.
  const peakPerMinute = Math.max(1, Math.ceil((perDay / (6 * 60)) * 4));
  return {
    liveAdapter: adapter.id,
    liveLabel: adapter.label,
    requiresGpu: adapter.requiresGpu,
    memoryNote: adapter.memoryNote,
    perDay,
    peakPerMinute,
  };
}
