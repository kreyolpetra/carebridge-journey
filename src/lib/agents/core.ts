// Agent framework.
//
// HONEST STATEMENT OF WHAT THIS IS. These agents are deterministic. They call
// no language model. Every conclusion below is produced by explicit rules over
// the patient's own record, and the same input always yields the same output.
//
// That is a deliberate choice, not a limitation we are hiding:
//
//   1. There is no AI gateway key in this build, and the shareable artifact is a
//      static file. Putting a model key in it would expose the key to everyone
//      it is shared with.
//   2. In a clinical setting, a reviewer can ask "why did it say that?" and get
//      a rule and a data point back, which is a stronger position for a pilot
//      than a fluent answer nobody can reproduce.
//
// The `model` field on every run records exactly which engine produced it, so a
// trace can never be mistaken for a model call. When a real model is wired in,
// it goes behind the same AgentRun contract, the same tool-call trace, and the
// same human-approval gate — the UI does not change.

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  /** What the call actually read, in a clinician's words. */
  summary: string;
  recordCount: number;
  ms: number;
  /** False when the consent model refused the read. */
  allowed: boolean;
  denyReason?: string;
}

export type FindingSeverity = "critical" | "high" | "moderate" | "info";

export interface Finding {
  severity: FindingSeverity;
  title: string;
  detail: string;
  /** The specific values behind the claim, so it can be checked. */
  evidence: string[];
  sourceTool: string;
}

export interface AgentRun {
  agent: string;
  /** Which engine produced this. Never a model name unless a model ran. */
  model: string;
  patientId: string;
  patientName: string;
  startedAt: string;
  ms: number;
  toolCalls: ToolCall[];
  findings: Finding[];
  /** Proposed consult agenda — a suggestion for the clinician, not an order. */
  agenda: string[];
  /** Things the agent could not resolve and is handing back to a human. */
  openQuestions: string[];
  /** 0–1. Reflects data completeness, not correctness of clinical judgement. */
  confidence: number;
  confidenceReason: string;
  redactions: string[];
  disclaimer: string;
}

export const AGENT_DISCLAIMER =
  "Decision support only. This is a deterministic summary of the record, not a diagnosis, and no action is taken until a clinician approves it.";

/** Times a tool call and records it on the trace. */
export function runTool<T>(
  trace: ToolCall[],
  spec: { tool: string; args: Record<string, unknown> },
  fn: () => { value: T; summary: string; count: number },
): T {
  const t0 = performance.now();
  const { value, summary, count } = fn();
  trace.push({
    tool: spec.tool,
    args: spec.args,
    summary,
    recordCount: count,
    ms: Math.max(0.1, Math.round((performance.now() - t0) * 10) / 10),
    allowed: true,
  });
  return value;
}

/** Records a read the consent model refused. The agent must not see the data. */
export function denyTool(
  trace: ToolCall[],
  spec: { tool: string; args: Record<string, unknown>; reason: string },
) {
  trace.push({
    tool: spec.tool,
    args: spec.args,
    summary: "Read refused — the agent did not receive this data",
    recordCount: 0,
    ms: 0.1,
    allowed: false,
    denyReason: spec.reason,
  });
}

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  critical: 0,
  high: 1,
  moderate: 2,
  info: 3,
};

export function sortFindings(findings: Finding[]): Finding[] {
  return findings.slice().sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
