/**
 * Safety findings on the open chart, and the independent review that clears
 * them.
 *
 * The tiering is the whole design. A `stop` sits above the chart in critical
 * colour and cannot be cleared by whoever raised it; a `review` asks; a
 * `notice` is folded away under a count and never interrupts. If every finding
 * shouted, the one that mattered would be clicked through like the rest —
 * which is the failure mode alert fatigue actually describes.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldAlert, ShieldCheck, Info, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { safetyReviewsQuery, type PatientBundle } from "@/lib/api";
import { evaluateSafety, TIER_COPY, type SafetyFinding } from "@/lib/safety";
import { useAuth } from "@/hooks/useAuth";
import { Panel, PanelHeader, Pill } from "@/components/grid";
import { timeAgo } from "@/lib/format";

export function SafetyPanel({ bundle: b }: { bundle: PatientBundle }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const reviews = useQuery(safetyReviewsQuery);
  const [note, setNote] = useState<Record<string, string>>({});
  const [showNotices, setShowNotices] = useState(false);

  const findings = useMemo(
    () => evaluateSafety(b.patient, b.medications, b.conditions),
    [b.patient, b.medications, b.conditions],
  );

  const mine = (reviews.data ?? []).filter((r) => r.patient_id === b.patient.id);
  const reviewFor = (key: string) => mine.find((r) => r.finding_key === key) ?? null;

  const raise = useMutation({
    mutationFn: async (f: SafetyFinding) => {
      const { error } = await supabase.from("safety_reviews").insert({
        patient_id: b.patient.id,
        finding_key: f.key,
        kind: f.kind,
        tier: f.tier,
        title: f.title,
        detail: f.detail,
        evidence: f.evidence,
        status: "pending",
        raised_by_id: profile?.provider_id ?? profile?.id ?? null,
        raised_by_name: profile?.full_name ?? "Clinician",
        raised_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Sent for independent review — a second clinician must clear it");
      void qc.invalidateQueries({ queryKey: ["safety_reviews"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolve = useMutation({
    mutationFn: async ({ id, decision, text }: { id: string; decision: string; text: string }) => {
      const { error } = await supabase
        .from("safety_reviews")
        .update({
          status: "resolved",
          decision,
          note: text,
          reviewer_id: profile?.provider_id ?? profile?.id ?? null,
          reviewer_name: profile?.full_name ?? "Clinician",
          resolved_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Review recorded");
      void qc.invalidateQueries({ queryKey: ["safety_reviews"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stops = findings.filter((f) => f.tier === "stop");
  const asks = findings.filter((f) => f.tier === "review");
  const notices = findings.filter((f) => f.tier === "notice");
  const actionable = [...stops, ...asks];

  if (!findings.length) {
    return (
      <Panel>
        <div className="flex items-start gap-2.5 px-5 py-3.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-low" />
          <p className="text-[13px] text-muted-foreground">
            No safety findings on this chart. Allergies, duplicate therapy, supply and monitoring
            were all checked against the current medication list.
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel className={stops.length ? "border-critical/40" : undefined}>
      <PanelHeader
        title="Safety"
        subtitle={
          stops.length
            ? "A stop is open on this chart. It cannot be cleared by the clinician who raised it."
            : "Checked against allergies, duplicate therapy, supply and monitoring."
        }
        right={
          <Pill
            className={
              stops.length
                ? "border-critical/40 bg-critical/10 text-critical"
                : "border-border bg-surface text-muted-foreground"
            }
          >
            {actionable.length} to act on
          </Pill>
        }
      />

      <div className="divide-y divide-border">
        {actionable.map((f) => {
          const r = reviewFor(f.key);
          const isStop = f.tier === "stop";
          // FR-SAFE-03: the initiator cannot be the reviewer.
          const me = profile?.provider_id ?? profile?.id ?? null;
          const iRaisedIt = !!r && r.raised_by_id === me;

          return (
            <div key={f.key} className="p-5">
              <div className="flex flex-wrap items-start gap-2">
                {isStop ? (
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-critical" />
                ) : (
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-high" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[14px] font-semibold">{f.title}</h3>
                    <Pill
                      className={
                        isStop
                          ? "border-critical/40 bg-critical/10 text-critical"
                          : "border-high/40 bg-high/10 text-high"
                      }
                    >
                      {TIER_COPY[f.tier].label}
                    </Pill>
                    <span className="text-[11.5px] text-muted-foreground">
                      {TIER_COPY[f.tier].blurb}
                    </span>
                  </div>
                  <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                    {f.detail}
                  </p>

                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {f.evidence.map((e) => (
                      <li key={e}>
                        <Pill className="border-border bg-surface font-mono text-[11px] text-muted-foreground">
                          {e}
                        </Pill>
                      </li>
                    ))}
                  </ul>

                  {/* Three states: unraised, awaiting a second pair of eyes, resolved. */}
                  {!r ? (
                    <button
                      type="button"
                      onClick={() => raise.mutate(f)}
                      disabled={raise.isPending}
                      className="mt-3 rounded-lg bg-primary px-3 py-2 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      {isStop ? "Send for independent review" : "Flag for review"}
                    </button>
                  ) : r.status === "pending" ? (
                    <div className="mt-3 rounded-lg border border-border bg-surface p-3">
                      <p className="text-[12.5px] text-muted-foreground">
                        Raised by <strong className="text-foreground">{r.raised_by_name}</strong>{" "}
                        {timeAgo(r.raised_at)}.
                      </p>
                      {iRaisedIt ? (
                        <p className="mt-2 text-[12.5px] leading-relaxed text-high">
                          You raised this, so you cannot clear it. A second clinician has to look —
                          that separation is the control.
                        </p>
                      ) : (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <input
                            value={note[r.id] ?? ""}
                            onChange={(e) => setNote((s) => ({ ...s, [r.id]: e.target.value }))}
                            placeholder="What did you check, and what did you decide?"
                            className="min-w-[220px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
                          />
                          {(["cleared", "changed", "escalated"] as const).map((d) => (
                            <button
                              key={d}
                              type="button"
                              disabled={resolve.isPending || !(note[r.id] ?? "").trim()}
                              onClick={() =>
                                resolve.mutate({
                                  id: r.id,
                                  decision: d,
                                  text: note[r.id] ?? "",
                                })
                              }
                              className="rounded-lg border border-border px-2.5 py-2 text-[12.5px] font-semibold capitalize hover:bg-background disabled:opacity-40"
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 rounded-lg border border-low/30 bg-low/8 px-3 py-2.5 text-[12.5px] leading-relaxed">
                      <strong className="font-semibold capitalize">{r.decision}</strong> by{" "}
                      {r.reviewer_name} {r.resolved_at ? timeAgo(r.resolved_at) : ""} — {r.note}
                      <span className="mt-1 block text-muted-foreground">
                        Raised by {r.raised_by_name}. The finding, its evidence and both names are
                        kept.
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {notices.length ? (
        <div className="border-t border-border">
          <button
            type="button"
            onClick={() => setShowNotices((v) => !v)}
            className="flex w-full items-center gap-2 px-5 py-3 text-left text-[12.5px] font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={"h-3.5 w-3.5 transition-transform " + (showNotices ? "rotate-180" : "")}
            />
            {notices.length} notice{notices.length === 1 ? "" : "s"} — informational, never
            interrupts
          </button>
          {showNotices ? (
            <div className="divide-y divide-border border-t border-border">
              {notices.map((f) => (
                <div key={f.key} className="px-5 py-3">
                  <p className="text-[13px] font-medium">{f.title}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                    {f.detail}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
