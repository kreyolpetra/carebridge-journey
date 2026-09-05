/**
 * The appointment book.
 *
 * Module 01 of the brief asks for capacity-aware scheduling and teleconsultation
 * infrastructure, and the PRD's reference journey turns on a booked cross-island
 * teleconsult. Both were half-built: routing already booked a slot and wrote a
 * consultation, but nothing in the app ever read them back, so a clinician's
 * "open teleconsult slots" was a number with no diary behind it.
 *
 * This is the diary. It is patient appointments, not resource scheduling — beds,
 * theatres and rotas are module 09, which the PRD deliberately excludes.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, Video, MapPin, Phone, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  consultationsQuery,
  facilitiesQuery,
  patientsQuery,
  providersQuery,
  slotsQuery,
  type Consultation,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useScope } from "@/hooks/useScope";
import { useAccessIndex } from "@/lib/access-basis";
import { CallOverlay, formatCallTime, type CallMode } from "@/components/patient/CallOverlay";
import { BookAppointment } from "@/components/patient/BookAppointment";
import { Panel, PanelHeader, Pill, Stat, Loading } from "@/components/grid";
import { EscortPill, EscortActions, EscortNoteForPatient } from "@/components/EscortState";
import { shortDate, clockTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/appointments")({
  head: () => ({
    meta: [
      { title: "Appointments — Clinics & Teleconsults | CareBridge Journey" },
      {
        name: "description",
        content:
          "Upcoming and past appointments across CareBridge, including cross-island teleconsults, with the call started from the appointment itself.",
      },
    ],
  }),
  component: Appointments,
});

function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
}

function Appointments() {
  const { profile } = useAuth();
  const { isPatient, patientId } = useScope();
  const { index: access, ready: accessReady } = useAccessIndex();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [call, setCall] = useState<{ mode: CallMode; consult: Consultation } | null>(null);

  const consultations = useQuery(consultationsQuery);
  const patients = useQuery(patientsQuery);
  const providers = useQuery(providersQuery);
  const facilities = useQuery(facilitiesQuery);
  const slots = useQuery(slotsQuery);
  const qc = useQueryClient();

  const patientById = useMemo(
    () => new Map((patients.data ?? []).map((p) => [p.id, p] as const)),
    [patients.data],
  );
  const providerById = useMemo(
    () => new Map((providers.data ?? []).map((p) => [p.id, p] as const)),
    [providers.data],
  );
  const facilityById = useMemo(
    () => new Map((facilities.data ?? []).map((f) => [f.id, f] as const)),
    [facilities.data],
  );

  /**
   * A patient sees their own appointments. A clinician sees the ones they are
   * running — and only for patients a lawful basis reaches, like every other
   * list of named people in the app.
   */
  const mine = useMemo(() => {
    const rows = consultations.data ?? [];
    if (isPatient) return rows.filter((c) => c.patient_id === patientId);
    if (!accessReady) return [];
    return rows.filter(
      (c) =>
        (!profile?.provider_id || c.provider_id === profile.provider_id) &&
        access.decide(c.patient_id).allowed,
    );
  }, [consultations.data, isPatient, patientId, profile?.provider_id, access, accessReady]);

  const now = Date.now();
  const upcoming = mine
    .filter((c) => new Date(c.scheduled_at).getTime() >= now && c.status !== "completed")
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const past = mine
    .filter((c) => new Date(c.scheduled_at).getTime() < now || c.status === "completed")
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));

  const rows = tab === "upcoming" ? upcoming : past;
  const openSlots = (slots.data ?? []).filter(
    (s) => s.status === "open" && (!profile?.provider_id || s.provider_id === profile.provider_id),
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Consultation[]>();
    for (const c of rows) {
      const key = dayKey(c.scheduled_at);
      (map.get(key) ?? map.set(key, []).get(key)!).push(c);
    }
    return [...map.entries()];
  }, [rows]);

  /** Ending a call closes the appointment and leaves a record on both sides. */
  const endCall = useMutation({
    mutationFn: async ({
      consult,
      seconds,
      mode,
    }: {
      consult: Consultation;
      seconds: number;
      // Carried in rather than read off state: the overlay is dismissed before
      // this runs, so `call` is already null by the time it would be read and
      // every video consult was being recorded as a voice one.
      mode: CallMode;
    }) => {
      const patient = patientById.get(consult.patient_id);
      await supabase.from("messages").insert({
        patient_id: consult.patient_id,
        direction: "out",
        body: seconds
          ? `${mode === "video" ? "Video" : "Voice"} consult · ${formatCallTime(seconds)}`
          : `${mode === "video" ? "Video" : "Voice"} consult · not answered`,
        kind: "call",
        call_seconds: seconds,
        language: patient?.language ?? "en",
        channel: "whatsapp",
      });
      // A consult is an episode, so it belongs in the care history rather than
      // only in the chat thread.
      if (seconds) {
        await supabase.from("encounters").insert({
          patient_id: consult.patient_id,
          facility_id: consult.facility_id ?? profile?.facility_id ?? "",
          provider_id: consult.provider_id,
          consultation_id: consult.id,
          kind: "teleconsult",
          reason: consult.notes || "Teleconsult",
          summary: `${mode === "video" ? "Video" : "Voice"} consult, ${formatCallTime(seconds)}.`,
          status: "closed",
          started_at: new Date(Date.now() - seconds * 1000).toISOString(),
          ended_at: new Date().toISOString(),
          sensitivity: "standard",
        });
        await supabase.from("consultations").update({ status: "completed" }).eq("id", consult.id);
      }
    },
    onSuccess: () => {
      toast.success("Consult recorded on the patient's chart and care line");
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Appointments</h1>
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
            {isPatient
              ? "Your clinic visits and teleconsults. A teleconsult happens on your care line — no app to install."
              : "Clinics and cross-island teleconsults you are running. Start the consult from the appointment; it is recorded on the chart and the patient's care line."}
          </p>
        </div>
        {isPatient ? null : <BookAppointment trigger="primary" />}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Upcoming" value={upcoming.length} hint="Scheduled ahead" tone="signal" />
        <Stat
          label="Teleconsults"
          value={upcoming.filter((c) => c.kind === "teleconsult").length}
          hint="Delivered over the care line"
        />
        {isPatient ? (
          <Stat label="Past appointments" value={past.length} hint="Already seen" tone="low" />
        ) : (
          <Stat
            label="Open slots"
            value={openSlots.length}
            hint="Bookable by other islands"
            tone="low"
          />
        )}
      </div>

      <Panel className="relative overflow-hidden">
        {call ? (
          <CallOverlay
            mode={call.mode}
            title={patientById.get(call.consult.patient_id)?.full_name ?? "Patient"}
            subtitle={call.consult.notes}
            ringingLabel="Calling the patient's care line…"
            onEnd={(seconds) => {
              const { consult, mode } = call;
              setCall(null);
              endCall.mutate({ consult, seconds, mode });
            }}
          />
        ) : null}

        <PanelHeader
          title={tab === "upcoming" ? "Upcoming" : "Past appointments"}
          subtitle={`${rows.length} ${rows.length === 1 ? "appointment" : "appointments"}`}
          right={
            <div className="flex items-center gap-1">
              {(["upcoming", "past"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={
                    "rounded-lg px-2.5 py-1 text-[12.5px] font-medium capitalize transition-colors " +
                    (tab === t
                      ? "bg-primary/12 text-primary"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {t}
                </button>
              ))}
            </div>
          }
        />

        {consultations.isLoading ? <Loading label="Loading the diary…" /> : null}
        {!consultations.isLoading && !rows.length ? (
          <p className="px-5 py-10 text-[13px] text-muted-foreground">
            {tab === "upcoming"
              ? "Nothing booked. Triage books a slot automatically when it routes someone, and you can book one from a patient's chart."
              : "No past appointments yet."}
          </p>
        ) : null}

        <div className="divide-y divide-border">
          {grouped.map(([day, items]) => (
            <div key={day}>
              <p className="bg-surface px-5 py-2 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {day}
              </p>
              {items.map((c) => {
                const patient = patientById.get(c.patient_id);
                const provider = providerById.get(c.provider_id ?? "");
                const facility = facilityById.get(c.facility_id ?? "");
                const tele = c.kind === "teleconsult";
                return (
                  <div
                    key={c.id}
                    className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface"
                  >
                    <span className="flex w-[70px] shrink-0 items-center gap-1.5 text-[13px] font-semibold">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      {clockTime(c.scheduled_at)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold">
                        {isPatient
                          ? (provider?.full_name ?? "Your care team")
                          : (patient?.full_name ?? "Patient")}
                      </span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {c.notes || (tele ? "Teleconsult" : "Clinic appointment")}
                        {facility ? ` · ${facility.name}` : ""}
                      </span>
                      {isPatient ? <EscortNoteForPatient consultation={c} /> : null}
                    </span>
                    <Pill
                      className={
                        tele
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-border bg-surface text-muted-foreground"
                      }
                    >
                      {tele ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                      {tele ? "teleconsult" : "in person"}
                    </Pill>
                    <Pill className="border-border bg-background text-muted-foreground">
                      {c.status}
                    </Pill>
                    {/* Whether anybody is bringing them home. Nothing renders
                        at all for the appointments that do not need one. */}
                    <EscortPill consultation={c} />
                    {!isPatient && tab === "upcoming" ? (
                      <EscortActions consultation={c} patient={patient} />
                    ) : null}
                    {/* Only the clinician running it can start the call, and only
                        for a teleconsult that has not already happened. */}
                    {!isPatient && tele && tab === "upcoming" ? (
                      <span className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setCall({ mode: "voice", consult: c })}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[12px] font-semibold transition-colors hover:border-primary/40 hover:text-primary"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          Voice
                        </button>
                        <button
                          type="button"
                          onClick={() => setCall({ mode: "video", consult: c })}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-[12px] font-semibold text-primary-foreground"
                        >
                          <Video className="h-3.5 w-3.5" />
                          Start consult
                        </button>
                      </span>
                    ) : null}
                    {isPatient && tele && tab === "upcoming" ? (
                      <span className="text-[12px] text-muted-foreground">
                        <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
                        {shortDate(c.scheduled_at)} — your clinician will call your care line
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
