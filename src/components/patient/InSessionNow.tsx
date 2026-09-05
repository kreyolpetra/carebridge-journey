/**
 * Who is in the building right now.
 *
 * The app already knew this — the coordination dashboard counts "5 in session
 * now" and the reports repeat the figure — but no screen ever named the five.
 * You could see the number and not the people, which is the least useful half.
 *
 * Deliberately kept out of the worklist. Everything in that list is "not done
 * yet"; someone you are actually sitting with is "happening now". Folding them
 * together would make the to-do count include people you are already treating,
 * and a count that includes work in progress stops being a count of work.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Radio, Video, Hospital, ChevronDown, NotebookPen } from "lucide-react";
import { consultationsQuery, patientsQuery, facilitiesQuery } from "@/lib/api";
import { encountersQuery, type Encounter } from "@/lib/org";
import { ConsultNote } from "@/components/patient/ConsultNote";
import { useAccessIndex } from "@/lib/access-basis";
import { useScope } from "@/hooks/useScope";
import { Panel, Pill } from "@/components/grid";
import { clockTime } from "@/lib/format";

type Live = {
  patientId: string;
  since: number;
  name: string;
  mrn: string;
  kind: "teleconsult" | "episode";
  detail: string;
  /** Set on an open episode, so the visit can be closed from this list. */
  encounter?: Encounter;
};

/** Minutes since a timestamp, as a phrase rather than a number. */
function since(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just started";
  if (mins < 60) return `started ${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `started ${hrs}h ${mins % 60}m ago`;
}

export function InSessionNow() {
  const [closing, setClosing] = useState<{ encounter: Encounter; name: string } | null>(null);
  const { facilityId, providerId } = useScope();
  const consultations = useQuery(consultationsQuery);
  const encounters = useQuery(encountersQuery(null));
  const patients = useQuery(patientsQuery);
  const facilities = useQuery(facilitiesQuery);
  const { index: access, ready } = useAccessIndex();
  const [open, setOpen] = useState(false);

  const live = useMemo<Live[]>(() => {
    if (!ready) return [];
    const pmap = new Map((patients.data ?? []).map((p) => [p.id, p] as const));
    const fmap = new Map((facilities.data ?? []).map((f) => [f.id, f] as const));
    const out = new Map<string, Live>();

    // A call actually in progress — yours first, then the rest of the facility.
    for (const c of consultations.data ?? []) {
      if (c.status !== "in_progress") continue;
      const mine = c.provider_id === providerId;
      const here = c.facility_id === facilityId;
      if (!mine && !here) continue;
      const p = pmap.get(c.patient_id);
      if (!p || !access.decide(p.id).allowed) continue;
      out.set(p.id, {
        patientId: p.id,
        name: p.full_name,
        mrn: p.mrn,
        kind: "teleconsult",
        since: new Date(c.scheduled_at).getTime(),
        detail: `${mine ? "Your teleconsult" : "Teleconsult"} · ${since(c.scheduled_at)}`,
      });
    }

    /**
     * Someone in the building today.
     *
     * "Open" alone is not enough: a care episode can stay open for weeks, and
     * counting those put 36 people in a room that holds about 20. The window
     * is what separates "in clinic now" from "under our care".
     */
    const HOURS_HERE = 12;
    const arrivedAfter = Date.now() - HOURS_HERE * 3600000;
    for (const e of encounters.data ?? []) {
      if (e.status !== "open") continue;
      if (e.facility_id !== facilityId) continue;
      if (new Date(e.started_at).getTime() < arrivedAfter) continue;
      const p = pmap.get(e.patient_id);
      if (!p || !access.decide(p.id).allowed) continue;
      if (out.has(p.id)) continue;
      out.set(p.id, {
        patientId: p.id,
        name: p.full_name,
        mrn: p.mrn,
        kind: "episode",
        encounter: e,
        since: new Date(e.started_at).getTime(),
        detail: `${e.reason} · open since ${clockTime(e.started_at)} at ${fmap.get(e.facility_id)?.name ?? "this facility"}`,
      });
    }

    // Longest here first — the person who has been waiting longest is the
    // one a census exists to surface.
    return [...out.values()].sort((a, b) => a.since - b.since);
  }, [
    consultations.data,
    encounters.data,
    patients.data,
    facilities.data,
    access,
    ready,
    providerId,
    facilityId,
  ]);

  if (!live.length) return null;

  const longest = live[0];
  const waited = longest ? Math.round((Date.now() - longest.since) / 60000) : 0;
  const waitedLabel =
    waited >= 60 ? `${Math.floor(waited / 60)}h ${waited % 60}m` : `${waited} min`;

  return (
    <>
      <Panel className="mb-4 border-signal/35">
        {/* Collapsed by default. These people are already being dealt with; the
          list below them is the one with people who are not. Sixteen expanded
          rows pushed the actual work off the screen, which is the opposite of
          what a census is for — it is a reassurance, not a workspace. */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-5 py-2.5 text-left"
        >
          <Radio className="h-3.5 w-3.5 shrink-0 text-signal" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-signal">
            In clinic now
          </h2>
          <Pill className="border-signal/40 bg-signal/10 text-signal">{live.length}</Pill>
          <span className="truncate text-[12px] text-muted-foreground">
            longest waiting {waitedLabel} · {longest?.name}
          </span>
          <ChevronDown
            className={
              "ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform " +
              (open ? "rotate-180" : "")
            }
          />
        </button>
        <div
          className={
            open
              ? "max-h-[300px] divide-y divide-border overflow-y-auto border-t border-border"
              : "hidden"
          }
        >
          {live.map((l) => (
            <div
              key={l.patientId}
              className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface"
            >
              <Link
                to="/patients"
                search={{ patient: l.patientId }}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-signal/12 text-signal">
                  {l.kind === "teleconsult" ? (
                    <Video className="h-3.5 w-3.5" />
                  ) : (
                    <Hospital className="h-3.5 w-3.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold">{l.name}</span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    <span className="font-medium text-foreground/70">{l.mrn}</span> · {l.detail}
                  </span>
                </span>
              </Link>
              {/* The visit has to be closable from the list it appears on, or an
                episode nobody closes keeps counting as somebody in the room. */}
              {l.encounter ? (
                <button
                  type="button"
                  onClick={() => setClosing({ encounter: l.encounter!, name: l.name })}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[12px] font-semibold transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <NotebookPen className="h-3.5 w-3.5" />
                  Close visit
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </Panel>
      <ConsultNote
        encounter={closing?.encounter ?? null}
        patientName={closing?.name ?? ""}
        open={Boolean(closing)}
        onOpenChange={(v) => !v && setClosing(null)}
      />
    </>
  );
}
