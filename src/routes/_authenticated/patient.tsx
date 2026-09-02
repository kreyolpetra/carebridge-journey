import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Mic, Send, Activity, Droplets, PillBottle, Loader2, CloudOff, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  HERO_PATIENT_ID,
  patientBundleQuery,
  patientsQuery,
  providersQuery,
  slotsQuery,
  islandsQuery,
  type Patient,
} from "@/lib/api";
import { analyzeMessage } from "@/lib/triage.functions";
import { routePatient, retainedValueUsd, formatHours } from "@/lib/routing";
import { Panel, PanelHeader, Pill, Loading } from "@/components/grid";
import { severityClasses, clockTime, LANGUAGE_LABEL } from "@/lib/format";
import { useNetworkOnline } from "@/lib/offline";
import { useScope } from "@/hooks/useScope";
import type { TriageResult } from "@/lib/triage.server";

export const Route = createFileRoute("/_authenticated/patient")({
  head: () => ({
    meta: [
      { title: "Patient Line — WhatsApp Intake & AI Triage | CariCare Grid" },
      {
        name: "description",
        content:
          "Simulated WhatsApp intake for Caribbean NCD patients: home readings, voice notes and local language varieties, triaged by AI in seconds.",
      },
      { property: "og:title", content: "Patient Line — WhatsApp Intake & AI Triage" },
      {
        property: "og:description",
        content: "No app install, no data plan required. The patient texts; the Grid triages and routes.",
      },
    ],
  }),
  component: PatientLine,
});

const QUICK = [
  { icon: Activity, label: "Log blood pressure", text: "Mi pressure read 168 over 104 dis mawnin, and mi head a hurt mi bad." },
  { icon: Droplets, label: "Log glucose", text: "Sugar test seh 14.2 after breakfast, mi feel weak and thirsty." },
  { icon: PillBottle, label: "Out of medication", text: "Mi run out a di amlodipine two week now, di clinic neva have none." },
  {
    icon: Mic,
    label: "Voice note",
    text: "[voice note, 22s, Patois] Mi chest a squeeze mi since last night and mi hand dem a tingle. Mi cyaan reach di clinic, no transport.",
  },
];

type PendingMessage = { id: string; body: string; kind: string; created_at: string };

function PatientLine() {
  const { isPatient, patientId: ownPatientId } = useScope();
  const [selectedId, setSelectedId] = useState(HERO_PATIENT_ID);
  const patientId = isPatient ? (ownPatientId ?? HERO_PATIENT_ID) : selectedId;
  const [draft, setDraft] = useState("");
  const [queue, setQueue] = useState<PendingMessage[]>([]);
  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [routingNote, setRoutingNote] = useState<string[] | null>(null);
  const [degraded, setDegraded] = useState<string | null>(null);
  const online = useNetworkOnline();
  const qc = useQueryClient();
  const scroller = useRef<HTMLDivElement>(null);

  const patients = useQuery({ ...patientsQuery, enabled: !isPatient });
  const bundle = useQuery(patientBundleQuery(patientId));
  const providers = useQuery(providersQuery);
  const slots = useQuery(slotsQuery);
  const islands = useQuery(islandsQuery);

  const roster = useMemo(() => {
    const list = patients.data ?? [];
    const hero = list.find((p) => p.id === HERO_PATIENT_ID);
    const rest = list.filter((p) => p.id !== HERO_PATIENT_ID).slice(0, 11);
    return [hero, ...rest].filter(Boolean) as Patient[];
  }, [patients.data]);

  const send = useMutation({
    mutationFn: async (body: string) => {
      const b = bundle.data;
      if (!b) throw new Error("Patient record still loading");

      const { data: inbound, error: insErr } = await supabase
        .from("messages")
        .insert({
          patient_id: patientId,
          direction: "inbound",
          body,
          kind: body.startsWith("[voice note") ? "voice" : "text",
          language: b.patient.language,
          channel: "whatsapp",
        })
        .select()
        .single();
      if (insErr) throw new Error(insErr.message);

      const { result, degraded: fellBack, note } = await analyzeMessage({
        data: {
          message: body,
          context: {
            name: b.patient.full_name,
            age: b.patient.age,
            sex: b.patient.sex,
            island: b.patient.island_code,
            parish: b.patient.parish,
            language: b.patient.language,
            rural: b.patient.rural,
            kmToFacility: b.patient.km_to_facility,
            conditions: b.conditions.map((c) => c.name),
            medications: b.medications.map((m) => ({
              name: m.name,
              dosage: m.dosage,
              adherence: m.adherence_pct,
              daysLeft: m.days_supply_left,
            })),
            recentVitals: b.vitals.slice(0, 10).map((v) => ({
              measured_at: v.measured_at,
              systolic: v.systolic,
              diastolic: v.diastolic,
              glucose: v.glucose_mmol,
            })),
          },
        },
      });

      const ex = result.extracted;
      if (ex.systolic || ex.glucose_mmol) {
        await supabase.from("vitals").insert({
          patient_id: patientId,
          systolic: ex.systolic,
          diastolic: ex.diastolic,
          glucose_mmol: ex.glucose_mmol,
          source: "whatsapp",
        });
      }

      const { data: event } = await supabase
        .from("triage_events")
        .insert({
          patient_id: patientId,
          message_id: inbound.id,
          severity: result.severity,
          category: result.category,
          recommended_level: result.recommended_level,
          rationale: result.rationale,
          red_flags: result.red_flags,
          confidence: result.confidence,
        })
        .select()
        .single();

      await supabase.from("messages").insert({
        patient_id: patientId,
        direction: "outbound",
        body: result.patient_reply,
        kind: "text",
        language: b.patient.language,
        channel: "whatsapp",
      });

      await supabase.rpc("compute_risk", { p_patient: patientId });

      let reasons: string[] | null = null;
      if (result.severity === "emergency" || result.severity === "urgent") {
        const decision = routePatient({
          specialty: result.specialty_needed,
          severity: result.severity,
          patientIsland: b.patient.island_code,
          patientLanguage: b.patient.language,
          providers: providers.data ?? [],
          slots: slots.data ?? [],
          patientIslandProfile: (islands.data ?? []).find((i) => i.code === b.patient.island_code),
        });
        const chosen = decision.chosen;
        if (chosen) {
          reasons = [
            `${chosen.provider.full_name} · ${chosen.provider.specialty} · ${chosen.provider.island_code}`,
            decision.noLocalCapacity
              ? `No ${result.specialty_needed} available in ${b.patient.island_code} — routed across the region`
              : `Local wait for ${result.specialty_needed}: ${decision.localWaitDays} days`,
            `Teleconsult in ${formatHours(chosen.hoursToSlot)}`,
            ...(decision.prioritisedOnNeed
              ? [`Prioritised on need (${decision.needScore}/100): ${decision.needReasons[0]}`]
              : []),
            ...chosen.reasons,
          ];
          const retained = retainedValueUsd(result.specialty_needed, chosen.crossIsland);
          const { data: referral } = await supabase
            .from("referrals")
            .insert({
              patient_id: patientId,
              triage_event_id: event?.id ?? null,
              to_provider_id: chosen.provider.id,
              specialty: result.specialty_needed,
              status: "routed",
              cross_island: chosen.crossIsland,
              reason: result.category,
              wait_days_local: decision.localWaitDays,
              wait_days_routed: Math.max(0, Math.round(chosen.hoursToSlot / 24)),
              retained_value_usd: retained,
              need_score: decision.needScore,
              prioritised_on_need: decision.prioritisedOnNeed,
              patient_island: b.patient.island_code,
            })
            .select()
            .single();

          if (chosen.slot) {
            await supabase.from("availability_slots").update({ status: "booked" }).eq("id", chosen.slot.id);
            await supabase.from("consultations").insert({
              referral_id: referral?.id ?? null,
              patient_id: patientId,
              provider_id: chosen.provider.id,
              scheduled_at: chosen.slot.starts_at,
              status: "scheduled",
            });
          }

          if (chosen.crossIsland) {
            await supabase.from("consent_grants").insert({
              patient_id: patientId,
              provider_id: chosen.provider.id,
              scope: ["vitals", "medications", "conditions", "triage"],
              purpose: `Cross-island teleconsult — ${result.category}`,
              status: "pending",
            });
          }

          await supabase.from("alerts").insert({
            kind: "clinical",
            severity: result.severity === "emergency" ? "critical" : "high",
            island_code: b.patient.island_code,
            patient_id: patientId,
            title: `${result.category} — ${b.patient.full_name}`,
            detail: result.rationale,
          });
        }
      }

      return { result, reasons, fellBack, note };
    },
    onSuccess: ({ result, reasons, fellBack, note }) => {
      setTriage(result);
      setRoutingNote(reasons);
      setDegraded(fellBack ? (note ?? "Degraded mode") : null);
      qc.invalidateQueries();
      if (result.severity === "emergency") toast.error(`Emergency flagged: ${result.category}`);
      else if (result.severity === "urgent") toast.warning(`Urgent: ${result.category}`);
      else toast.success(`Triaged: ${result.category}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (online && queue.length && !send.isPending) {
      const next = queue[0]!;
      setQueue((q) => q.slice(1));
      send.mutate(next.body);
      toast.info("Connection restored — syncing queued message");
    }
  }, [online, queue, send]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [bundle.data?.messages.length, queue.length]);

  function submit(text: string) {
    const body = text.trim();
    if (!body) return;
    setDraft("");
    if (!online) {
      setQueue((q) => [...q, { id: crypto.randomUUID(), body, kind: "text", created_at: new Date().toISOString() }]);
      toast.warning("Offline — message queued on the handset");
      return;
    }
    send.mutate(body);
  }

  const b = bundle.data;

  return (
    <div
      className={
        "mx-auto grid w-full gap-4 px-5 py-8 " +
        (isPatient
          ? "max-w-[1200px] lg:grid-cols-[minmax(0,1fr)_360px]"
          : "max-w-[1500px] lg:grid-cols-[260px_minmax(0,1fr)_360px]")
      }
    >
      {isPatient ? null : (
      <Panel className="h-fit">
        <PanelHeader title="Patient line" subtitle="Numbers registered on WhatsApp" />
        <div className="max-h-[560px] overflow-y-auto p-2">
          {roster.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setSelectedId(p.id);
                setTriage(null);
                setRoutingNote(null);
              }}
              className={
                "w-full rounded-lg px-3 py-2.5 text-left transition-colors " +
                (p.id === patientId ? "bg-primary/12 text-foreground" : "hover:bg-surface")
              }
            >
              <div className="truncate text-[13.5px] font-semibold">{p.full_name}</div>
              <div className="truncate text-[11.5px] text-muted-foreground">
                {p.parish}, {p.island_code} · {p.phone}
              </div>
            </button>
          ))}
        </div>
      </Panel>
      )}

      <Panel className="flex h-[720px] flex-col overflow-hidden">
        {!b ? (
          <Loading />
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-border bg-chat px-5 py-3">
              <div className="flex items-center gap-3">
                {isPatient ? (
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-primary">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M3 12h4l2-6 3 13 3-9 2 2h4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                ) : null}
                <div>
                  <div className="font-display text-[15px] font-semibold text-chat-foreground">
                    {isPatient ? "CariCare Grid" : b.patient.full_name}
                  </div>
                  <div className="text-[11.5px] text-muted-foreground">
                    {isPatient
                      ? `Your care team · replies in ${LANGUAGE_LABEL[b.patient.language] ?? b.patient.language} · online`
                      : `${b.patient.phone} · ${LANGUAGE_LABEL[b.patient.language] ?? b.patient.language} · ${b.patient.km_to_facility} km from clinic`}
                  </div>
                </div>
              </div>
              <Pill className="border-low/40 bg-low/10 text-low">WhatsApp</Pill>
            </div>

            <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto bg-chat px-5 py-5">
              {b.messages.map((m) => {
                // From the patient's own handset, their messages sit on the right (green).
                const mine = isPatient ? m.direction === "inbound" : m.direction === "outbound";
                return (
                <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={
                      "max-w-[78%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed " +
                      (mine
                        ? "rounded-tr-sm bg-chat-bubble-out text-chat-foreground"
                        : "rounded-tl-sm bg-chat-bubble-in text-chat-foreground")
                    }
                  >
                    {m.kind === "voice" ? (
                      <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-primary">
                        <Mic className="h-3 w-3" /> voice note transcript
                      </div>
                    ) : null}
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <div className="mt-1 flex items-center justify-end gap-1 text-[10.5px] text-muted-foreground">
                      {clockTime(m.created_at)}
                      {mine ? <CheckCheck className="h-3.5 w-3.5 text-sky-500" /> : null}
                    </div>
                  </div>
                </div>
                );
              })}
              {queue.map((m) => (
                <div key={m.id} className={isPatient ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={
                      "max-w-[78%] rounded-2xl border border-dashed border-critical/40 px-4 py-2.5 text-[13.5px] " +
                      (isPatient
                        ? "rounded-tr-sm bg-chat-bubble-out/70"
                        : "rounded-tl-sm bg-chat-bubble-in/60")
                    }
                  >
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-critical">
                      <CloudOff className="h-3 w-3" /> queued on handset — will sync
                    </div>
                  </div>
                </div>
              ))}

              {send.isPending ? (
                <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Grid is triaging…
                </div>
              ) : null}
            </div>

            <div className="border-t border-border bg-chat px-4 py-3">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {QUICK.map((q) => (
                  <button
                    key={q.label}
                    onClick={() => setDraft(q.text)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <q.icon className="h-3 w-3" /> {q.label}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(draft);
                }}
                className="flex items-center gap-2"
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={isPatient ? "Message your care team…" : "Type as the patient…"}
                  className="h-11 flex-1 rounded-xl border border-border bg-background px-4 text-[13.5px] outline-none focus:border-primary/60"
                />
                <button
                  type="submit"
                  disabled={send.isPending}
                  className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </>
        )}
      </Panel>

      <div className="space-y-4">
        <Panel>
          <PanelHeader
            title={isPatient ? "What the Grid saw" : "AI triage"}
            subtitle={isPatient ? "How your last message was assessed" : "Structured clinical read of the last message"}
          />
          <div className="space-y-3 p-5">
            {!triage ? (
              <p className="text-[13px] text-muted-foreground">
                {isPatient
                  ? "Send a message — or tap a quick action — and the Grid will read your vitals, judge how urgent it is and get you to the right clinician."
                  : "Send a message — or tap a quick action — to watch the Grid extract vitals, assign urgency and route the patient."}
              </p>

            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <Pill className={severityClasses(triage.severity)}>{triage.severity.replace("_", " ")}</Pill>
                  <Pill className="border-border bg-surface text-muted-foreground">{triage.category}</Pill>
                  <Pill className="border-border bg-surface text-muted-foreground">
                    {Math.round(triage.confidence * 100)}% confidence
                  </Pill>
                </div>
                <p className="text-[13px] leading-relaxed text-muted-foreground">{triage.rationale}</p>
                {triage.red_flags.length ? (
                  <ul className="space-y-1 rounded-lg border border-critical/30 bg-critical/8 p-3 text-[12.5px] text-critical">
                    {triage.red_flags.map((f) => (
                      <li key={f}>• {f}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="text-[12px] text-muted-foreground">
                  Recommended level: <span className="text-foreground">{triage.recommended_level.replace("_", " ")}</span>{" "}
                  · Specialty: <span className="text-foreground">{triage.specialty_needed}</span>
                </div>
                {degraded ? (
                  <div className="rounded-lg border border-high/30 bg-high/8 p-3 text-[12px] text-high">
                    Degraded mode — deterministic clinical rules used so the line never goes dark. {degraded}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title={isPatient ? "Your care appointment" : "Routing decision"}
            subtitle={isPatient ? "Who you were matched with, and how fast" : "Specialist minutes as a regional resource"}
          />
          <div className="p-5">
            {!routingNote ? (
              <p className="text-[13px] text-muted-foreground">
                {isPatient
                  ? "If something urgent comes up, you'll be matched with the fastest qualified clinician anywhere in the region — and asked to approve before your record crosses a border."
                  : "Urgent and emergency cases are auto-routed to the fastest qualified clinician anywhere in the region, with a consent request raised when the record has to cross a border."}
              </p>

            ) : (
              <ol className="space-y-2 text-[12.5px] text-muted-foreground">
                {routingNote.map((r, i) => (
                  <li key={r} className={i === 0 ? "text-[13.5px] font-semibold text-foreground" : ""}>
                    {i === 0 ? r : `• ${r}`}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
