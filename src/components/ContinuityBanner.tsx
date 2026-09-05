/**
 * What happens to a patient when their facility goes down.
 *
 * The regional record has always survived a local building — that is what
 * putting the record on CareBridge rather than in a server room means — but the
 * product never said so, and a claim nobody can see is not a feature.
 *
 * Two audiences, one fact:
 *
 *   - In a chart, a clinician seeing an unfamiliar patient learns why they are
 *     here and that the record in front of them is complete despite it.
 *   - On the coordination dashboard, a ministry sees which facilities are down
 *     and how many people that displaces.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CloudOff, Zap } from "lucide-react";
import { encountersQuery } from "@/lib/org";
import { facilitiesQuery, type Facility } from "@/lib/api";
import { Panel, PanelHeader, Pill } from "@/components/grid";
import { timeAgo } from "@/lib/format";

function tone(status: string) {
  return status === "offline"
    ? "border-critical/40 bg-critical/10 text-critical"
    : "border-high/40 bg-high/10 text-high";
}

/** The strip that appears in a chart when this patient's facility is down. */
export function PatientContinuityNote({ patientId }: { patientId: string }) {
  const encounters = useQuery(encountersQuery(patientId));
  const facilities = useQuery(facilitiesQuery);

  const affected = useMemo(() => {
    const byId = new Map((facilities.data ?? []).map((f) => [f.id, f] as const));
    for (const e of encounters.data ?? []) {
      const f = byId.get(e.facility_id);
      if (f && f.continuity_status && f.continuity_status !== "operational") return f;
    }
    return null;
  }, [encounters.data, facilities.data]);

  if (!affected) return null;

  return (
    <div
      className={
        "mb-4 flex flex-wrap items-start gap-2.5 rounded-xl border px-4 py-3 " +
        tone(affected.continuity_status)
      }
    >
      {affected.continuity_status === "offline" ? (
        <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <Zap className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold">
          {affected.name} is {affected.continuity_status}
          {affected.continuity_since ? ` · ${timeAgo(affected.continuity_since)}` : ""}
        </p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed">{affected.continuity_note}</p>
        <p className="mt-1 text-[12.5px] leading-relaxed opacity-90">
          The record below is complete — it lives on CareBridge, not in that building.
        </p>
      </div>
    </div>
  );
}

/** The regional view: which facilities are down, and how many people that moves. */
export function ContinuityPanel() {
  const facilities = useQuery(facilitiesQuery);
  const encounters = useQuery(encountersQuery(null));

  const rows = useMemo(() => {
    const down = (facilities.data ?? []).filter(
      (f) => f.continuity_status && f.continuity_status !== "operational",
    );
    const rowsFor = down.map((f: Facility) => {
      // Everyone with a recorded episode at that building.
      const ids = new Set(
        (encounters.data ?? []).filter((e) => e.facility_id === f.id).map((e) => e.patient_id),
      );
      return { facility: f, affected: ids.size };
    });
    // Closed first. A building nobody can walk into is the more urgent fact
    // than one running without a laboratory, regardless of which is larger.
    rowsFor.sort(
      (a, b) =>
        Number(b.facility.continuity_status === "offline") -
        Number(a.facility.continuity_status === "offline"),
    );
    return rowsFor;
  }, [facilities.data, encounters.data]);

  if (!rows.length) return null;

  // Only a closed building displaces anyone. A clinic on generator power is
  // still seeing its patients — it has lost its laboratory, not its list — and
  // counting those people as displaced would overstate the emergency, which is
  // the fastest way for a panel like this to stop being believed.
  const displaced = rows
    .filter((r) => r.facility.continuity_status === "offline")
    .reduce((n, r) => n + r.affected, 0);

  return (
    <Panel className="mb-4 border-critical/35">
      <PanelHeader
        title="Facilities out of service"
        subtitle="A building can close. The record it was holding does not."
        right={
          <Pill className="border-critical/40 bg-critical/10 text-critical">
            {displaced} patients displaced
          </Pill>
        }
      />
      <div className="divide-y divide-border">
        {rows.map(({ facility, affected }) => (
          <div
            key={facility.id}
            className="flex flex-wrap items-start justify-between gap-3 px-5 py-3"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[13.5px] font-semibold">
                {facility.continuity_status === "offline" ? (
                  <CloudOff className="h-3.5 w-3.5 shrink-0 text-critical" />
                ) : (
                  <Zap className="h-3.5 w-3.5 shrink-0 text-high" />
                )}
                {facility.name}
                <Pill className={tone(facility.continuity_status)}>
                  {facility.continuity_status}
                </Pill>
              </p>
              <p className="mt-0.5 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
                {facility.continuity_note}
              </p>
            </div>
            <p className="shrink-0 text-right text-[12.5px] text-muted-foreground">
              <span className="mono-num block text-[15px] font-bold text-foreground">
                {affected}
              </span>
              {facility.continuity_status === "offline" ? "records intact" : "seen here"}
            </p>
          </div>
        ))}
      </div>
      <p className="border-t border-border px-5 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
        Every one of these {displaced} people can be treated at any other facility on CareBridge
        today, with their full history, because the record was never stored in the building that
        closed.
      </p>
    </Panel>
  );
}
