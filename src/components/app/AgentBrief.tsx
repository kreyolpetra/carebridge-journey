import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Sparkles,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Check,
  X,
  Wrench,
  Clock,
  ArrowRight,
} from "lucide-react";
import type { AgentRun, FindingSeverity } from "@/lib/agents/core";
import { Panel, PanelHeader, Pill } from "@/components/grid";

const SEVERITY_CLASS: Record<FindingSeverity, string> = {
  critical: "bg-critical/15 text-critical border-critical/40",
  high: "bg-high/15 text-high border-high/40",
  moderate: "bg-moderate/15 text-moderate border-moderate/40",
  info: "bg-low/15 text-low border-low/40",
};

/**
 * Renders an agent run so a clinician can check its work rather than take it on
 * faith: every finding carries the values behind it, the tool trace shows what
 * was read (and what consent refused), and nothing is applied until someone
 * presses Accept.
 */
export function AgentBrief({
  run,
  onAccept,
  onDismiss,
  decision,
}: {
  run: AgentRun;
  onAccept: () => void;
  onDismiss: () => void;
  decision: "accepted" | "dismissed" | null;
}) {
  const [traceOpen, setTraceOpen] = useState(false);

  return (
    <Panel>
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {run.agent}
          </span>
        }
        subtitle={`${run.patientName} · prepared in ${run.ms}ms`}
        right={
          <Pill className="bg-surface text-muted-foreground border-border">
            {Math.round(run.confidence * 100)}% confidence
          </Pill>
        }
      />

      <div className="space-y-4 p-5">
        {run.redactions.map((r) => (
          <div
            key={r}
            className="flex items-start gap-2 rounded-lg border border-high/40 bg-high/10 p-3 text-[13px] text-foreground"
          >
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-high" />
            <span>{r}</span>
          </div>
        ))}

        {run.findings.length === 0 && (
          <p className="text-[13.5px] text-muted-foreground">
            Nothing in the record met a flagging threshold.
          </p>
        )}

        {run.findings.map((f, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Pill className={SEVERITY_CLASS[f.severity]}>{f.severity}</Pill>
              <span className="text-[13.5px] font-semibold text-foreground">{f.title}</span>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{f.detail}</p>
            <ul className="mt-2 space-y-1">
              {f.evidence.filter(Boolean).map((e, j) => (
                <li key={j} className="flex gap-2 text-[12.5px] text-muted-foreground">
                  <span className="text-primary">·</span>
                  <span className="mono-num">{e}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <h4 className="text-[12px] font-semibold uppercase tracking-wide text-primary">
            Proposed consult agenda
          </h4>
          <ol className="mt-2 space-y-1.5">
            {run.agenda.map((a, i) => (
              <li key={i} className="flex gap-2 text-[13px] text-foreground">
                <span className="mono-num text-muted-foreground">{i + 1}.</span>
                <span>{a}</span>
              </li>
            ))}
          </ol>
        </div>

        {run.openQuestions.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-4">
            <h4 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Handed back to you
            </h4>
            <ul className="mt-2 space-y-1.5">
              {run.openQuestions.map((q, i) => (
                <li key={i} className="text-[13px] text-foreground">
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="button"
          onClick={() => setTraceOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {traceOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Show the agent's working — {run.toolCalls.length} tool calls
        </button>

        {traceOpen && (
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5" />
                Engine: <span className="mono-num text-foreground">{run.model}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {run.ms}ms total
              </span>
            </div>
            <ol className="space-y-2">
              {run.toolCalls.map((c, i) => (
                <li
                  key={i}
                  className={
                    "rounded-lg border p-2.5 text-[12px] " +
                    (c.allowed ? "border-border bg-surface" : "border-critical/40 bg-critical/10")
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mono-num font-semibold text-foreground">{c.tool}</span>
                    {!c.allowed && (
                      <Pill className="bg-critical/15 text-critical border-critical/40">
                        denied
                      </Pill>
                    )}
                    <span className="ml-auto mono-num text-[11px] text-muted-foreground">
                      {c.ms}ms
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{c.summary}</p>
                  {c.denyReason && <p className="mt-1 text-critical">{c.denyReason}</p>}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
              {run.confidenceReason}
            </p>
            {/* The door to the aggregate goes where the curiosity starts.
                Somebody who has just opened one agent's working is the only
                person who wants to know how the agents have been behaving
                generally — which is a better place for that link than a
                permanent entry in a clinician's navigation. */}
            <Link
              to="/agents"
              className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-primary hover:underline"
            >
              How the agents have been behaving <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}

        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-[12px] leading-relaxed text-muted-foreground">{run.disclaimer}</p>
        </div>

        {decision === null ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onAccept}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Check className="h-4 w-4" />
              Accept into the consult note
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-3.5 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
            >
              <X className="h-4 w-4" />
              Dismiss
            </button>
          </div>
        ) : (
          <p className="text-[13px] font-medium text-foreground">
            {decision === "accepted"
              ? "Accepted — recorded against this episode with your name on it."
              : "Dismissed — logged, and nothing was written to the record."}
          </p>
        )}
      </div>
    </Panel>
  );
}
