/**
 * The open asks on a patient, and the button that closes one.
 *
 * Raising a request without somewhere to see it would move the dead end rather
 * than remove it. This is the other half: everything asked for on this patient,
 * who asked, how long ago, and a way to say it is done — or to decline it with
 * a reason, because "no, she got them last week" is an answer and silence is
 * not.
 *
 * Age is shown rather than left to be worked out. A refill open for four days
 * in a parish 38 km from the pharmacy is not paperwork; it is somebody who has
 * been without their tablets since Tuesday.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PillBottle, FlaskConical, Eye, Check, X, Clock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  careRequestsQuery,
  closeRequest,
  ageDays,
  isOverdue,
  KIND_LABEL,
  KIND_ACTION,
  type CareRequest,
  type CareRequestKind,
} from "@/lib/care-requests";
import { Panel, PanelHeader, Pill } from "@/components/grid";

const ICON: Record<CareRequestKind, typeof PillBottle> = {
  refill: PillBottle,
  test: FlaskConical,
  review: Eye,
};

export function CareRequests({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const requests = useQuery(careRequestsQuery);
  const [busy, setBusy] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      ((requests.data ?? []) as CareRequest[]).filter(
        (r) => r.patient_id === patientId && r.status === "open",
      ),
    [requests.data, patientId],
  );

  const close = useMutation({
    mutationFn: async (v: { id: string; status: "done" | "declined" }) => {
      setBusy(v.id);
      await closeRequest({
        id: v.id,
        status: v.status,
        by: profile?.full_name ?? "Clinician",
        note: v.status === "declined" ? "Declined at the chart" : "",
      });
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ["care_requests"] });
      setBusy(null);
      toast(v.status === "done" ? "Marked done" : "Declined", {
        description: "Closed on the record, with your name on it.",
      });
    },
    onError: (e: Error) => {
      setBusy(null);
      toast("Could not close it", { description: e.message });
    },
  });

  if (!rows.length) return null;

  return (
    <Panel className="mb-4 border-high/40">
      <PanelHeader
        title="Open requests"
        subtitle="Asked for on this patient and not yet done"
        right={<Pill className="border-high/40 bg-high/10 text-high">{rows.length} open</Pill>}
      />
      <div className="divide-y divide-border">
        {rows.map((r) => {
          const Icon = ICON[r.kind as CareRequestKind] ?? Eye;
          const days = ageDays(r.requested_at);
          const late = isOverdue(r);
          return (
            <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                  {KIND_LABEL[r.kind as CareRequestKind] ?? r.kind} · {r.item}
                  {late ? (
                    <Pill className="border-critical/40 bg-critical/10 text-critical">
                      <Clock className="h-3 w-3" />
                      {days}d open
                    </Pill>
                  ) : (
                    <Pill className="border-border bg-surface text-muted-foreground">
                      {days === 0 ? "today" : `${days}d`}
                    </Pill>
                  )}
                </p>
                <p className="mt-0.5 max-w-[62ch] text-[12.5px] leading-relaxed text-muted-foreground">
                  {r.reason}
                </p>
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  {KIND_ACTION[r.kind as CareRequestKind]} · asked by {r.requested_by_name}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => close.mutate({ id: r.id, status: "declined" })}
                  disabled={busy === r.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[12px] font-semibold text-muted-foreground transition-colors hover:border-critical/40 hover:text-critical disabled:opacity-60"
                >
                  <X className="h-3.5 w-3.5" />
                  Decline
                </button>
                <button
                  type="button"
                  onClick={() => close.mutate({ id: r.id, status: "done" })}
                  disabled={busy === r.id}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-[12px] font-semibold text-primary-foreground disabled:opacity-60"
                >
                  <Check className="h-3.5 w-3.5" />
                  Done
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="border-t border-border px-5 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
        A request is an ask, not a prescription or a lab order — this is a coordination layer, and
        it does not claim an authority it does not have. What it does is make sure the ask was
        written down and can be counted while it stays open.
      </p>
    </Panel>
  );
}
