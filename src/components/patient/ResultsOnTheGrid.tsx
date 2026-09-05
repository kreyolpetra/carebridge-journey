/**
 * Results this patient already has, wherever they were taken.
 *
 * A laboratory on a small island is a scarce resource, and the commonest way
 * to waste it is to repeat a test whose result already exists at a different
 * facility. That is not a clinical failure — the clinician ordering it has no
 * way to know. The result is in the system; it has simply never been in front
 * of them.
 *
 * So the panel leads with the ones a repeat would duplicate, says how long ago
 * and where, and names the interval it is judged against. It never says "do
 * not order": a clinician repeating a recent test usually has a reason, and a
 * tool that argues with them gets ignored on the day it is right.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical, Building2, AlertTriangle } from "lucide-react";
import { facilitiesQuery } from "@/lib/api";
import { labResultsQuery, latestPerTest } from "@/lib/labs";
import { useScope } from "@/hooks/useScope";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { careRequestsQuery, raiseRequest, type CareRequest } from "@/lib/care-requests";
import { Panel, PanelHeader, Pill } from "@/components/grid";
import { shortDate } from "@/lib/format";

export function ResultsOnTheGrid({ patientId }: { patientId: string }) {
  const { facilityId } = useScope();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const requests = useQuery(careRequestsQuery);

  /**
   * A test the Grid says is due had no way to be asked for — the panel named
   * the gap and stopped. Asking is not ordering: it puts the request on the
   * chart for whoever collects bloods, which is what actually happens here.
   */
  const openTests = useMemo(
    () =>
      new Set(
        ((requests.data ?? []) as CareRequest[])
          .filter((r) => r.patient_id === patientId && r.status === "open" && r.kind === "test")
          .map((r) => r.item),
      ),
    [requests.data, patientId],
  );

  const askTest = useMutation({
    mutationFn: async (v: { name: string; reason: string }) =>
      raiseRequest({
        patientId,
        kind: "test",
        item: v.name,
        reason: v.reason,
        providerId: profile?.provider_id ?? null,
        providerName: profile?.full_name ?? "Clinician",
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["care_requests"] });
      toast.success("Test requested — on the chart until somebody collects it");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const results = useQuery(labResultsQuery);
  const facilities = useQuery(facilitiesQuery);

  const rows = useMemo(
    () => latestPerTest((results.data ?? []).filter((r) => r.patient_id === patientId)),
    [results.data, patientId],
  );

  const facilityName = (id: string | null) =>
    (facilities.data ?? []).find((f) => f.id === id)?.name ?? "another facility";

  const elsewhere = rows.filter((r) => r.result.facility_id && r.result.facility_id !== facilityId);
  const reusable = rows.filter((r) => r.recent);

  if (!rows.length) {
    return (
      <Panel>
        <PanelHeader title="Results on the Grid" subtitle="Nothing on file from any facility yet" />
        <p className="px-5 py-5 text-[13px] leading-relaxed text-muted-foreground">
          No laboratory results recorded for this patient anywhere on the Grid. Anything ordered now
          will be the first of its kind on their record.
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelHeader
        title="Results on the Grid"
        subtitle={
          elsewhere.length
            ? `${elsewhere.length} of ${rows.length} were taken at another facility — you would not otherwise see them`
            : "Everything on file for this patient, newest per test"
        }
        right={
          reusable.length ? (
            <Pill className="border-low/40 bg-low/10 text-low">
              {reusable.length} still current
            </Pill>
          ) : null
        }
      />
      <div className="divide-y divide-border">
        {rows.map(({ result, days, recent, intervalDays }) => (
          <div
            key={result.id}
            className="flex flex-wrap items-start justify-between gap-3 px-5 py-3"
          >
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold">
                <FlaskConical className="h-3.5 w-3.5 shrink-0 text-primary" />
                {result.test_name}
                <span className="mono-num font-bold">
                  {result.value}
                  <span className="ml-1 text-[11.5px] font-normal text-muted-foreground">
                    {result.unit}
                  </span>
                </span>
                {result.abnormal ? (
                  <Pill className="border-high/40 bg-high/10 text-high">
                    <AlertTriangle className="h-3 w-3" />
                    outside range
                  </Pill>
                ) : null}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <Building2 className="h-3 w-3 shrink-0" />
                {facilityName(result.facility_id)} · {shortDate(result.collected_at)} ·{" "}
                {days === 0 ? "today" : `${days} days ago`}
              </p>
            </div>
            {/* The judgement, stated as information rather than instruction. */}
            {recent && intervalDays ? (
              <Pill className="shrink-0 border-low/40 bg-low/10 text-low">
                recent — usually repeated every {Math.round(intervalDays / 30)} months
              </Pill>
            ) : intervalDays ? (
              <span className="flex shrink-0 items-center gap-2">
                <Pill className="border-border bg-surface text-muted-foreground">
                  due for repeat
                </Pill>
                <button
                  type="button"
                  onClick={() =>
                    askTest.mutate({
                      name: result.test_name,
                      reason: `Last done ${days} days ago at ${facilityName(result.facility_id)}; usually repeated every ${Math.round(intervalDays / 30)} months.`,
                    })
                  }
                  disabled={askTest.isPending || openTests.has(result.test_name)}
                  className="rounded-lg border border-border px-2.5 py-1 text-[11.5px] font-semibold transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-60"
                >
                  {openTests.has(result.test_name) ? "Requested" : "Request"}
                </button>
              </span>
            ) : null}
          </div>
        ))}
      </div>
      {reusable.length ? (
        <p className="border-t border-border px-5 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
          Ordering any of the {reusable.length} marked current would repeat a test the Grid already
          holds. Repeat anyway if there is a clinical reason — this is what exists, not what to do.
        </p>
      ) : null}
    </Panel>
  );
}
