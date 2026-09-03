/**
 * Booking a teleconsult or clinic appointment from a patient's chart.
 *
 * Until now a slot was only ever booked automatically, by triage routing. A
 * clinician looking at a chart and deciding "I should see her Thursday" had no
 * way to say so. Module 01 of the brief asks for capacity-aware scheduling; the
 * capacity was modelled and never offered to the person making the decision.
 *
 * The confirmation goes back down the care line as an interactive message,
 * because the brief's whole premise is that the patient's interface is WhatsApp
 * and nothing else.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarPlus, Video, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { slotsQuery, patientsQuery, type Patient } from "@/lib/api";
import { useAccessIndex } from "@/lib/access-basis";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { shortDate, clockTime } from "@/lib/format";

const CONFIRM_COPY: Record<
  string,
  { body: (when: string, tele: boolean) => string; yes: string; move: string; no: string }
> = {
  en: {
    body: (when, tele) =>
      `You have an appointment on ${when}. ${tele ? "It is a video consult — we will call you here on WhatsApp, so there is nothing to install." : "Please come to the clinic."}`,
    yes: "Confirm",
    move: "Ask for another time",
    no: "I cannot make it",
  },
  jam: {
    body: (when, tele) =>
      `Yuh have a appointment pon ${when}. ${tele ? "It a video consult — wi wi call yuh right yah so pon WhatsApp, nutten fi install." : "Please come to di clinic."}`,
    yes: "Confirm it",
    move: "Ask fi anodda time",
    no: "Mi cyaan mek it",
  },
  ht: {
    body: (when, tele) =>
      `Ou gen yon randevou ${when}. ${tele ? "Se yon konsiltasyon videyo — n ap rele w isit la sou WhatsApp, ou pa bezwen enstale anyen." : "Tanpri vini nan klinik la."}`,
    yes: "Konfime",
    move: "Mande yon lòt lè",
    no: "Mwen pa ka vini",
  },
  es: {
    body: (when, tele) =>
      `Tiene una cita el ${when}. ${tele ? "Es una consulta por video — le llamaremos aquí por WhatsApp, no hay nada que instalar." : "Por favor venga a la clínica."}`,
    yes: "Confirmar",
    move: "Pedir otra hora",
    no: "No puedo asistir",
  },
};

export function BookAppointment({
  patient,
  trigger = "inline",
}: {
  /** Known when booking from a chart; chosen in the dialog when booking from the diary. */
  patient?: Patient;
  trigger?: "inline" | "primary";
}) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Patient | null>(null);
  const [patientQuery, setPatientQuery] = useState("");
  const [kind, setKind] = useState<"teleconsult" | "in_person">("teleconsult");
  const slots = useQuery(slotsQuery);
  const patients = useQuery(patientsQuery);
  const { index: access, ready: accessReady } = useAccessIndex();
  const qc = useQueryClient();

  const subject = patient ?? picked;

  /**
   * You can only book for someone you already hold a lawful basis for. Booking
   * is a clinical act on a named person, so it is not a route around the access
   * model — find them in the directory and establish a basis first.
   */
  const bookable = useMemo(() => {
    if (patient || !accessReady) return [];
    const needle = patientQuery.trim().toLowerCase();
    return (patients.data ?? [])
      .filter((p) => access.decide(p.id).allowed)
      .filter(
        (p) =>
          !needle ||
          p.full_name.toLowerCase().includes(needle) ||
          p.parish.toLowerCase().includes(needle),
      )
      .slice(0, 40);
  }, [patients.data, patient, patientQuery, access, accessReady]);

  const mySlots = (slots.data ?? [])
    .filter((s) => s.status === "open" && s.provider_id === profile?.provider_id)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 12);

  const book = useMutation({
    mutationFn: async (slotId: string) => {
      const slot = mySlots.find((s) => s.id === slotId);
      if (!slot) throw new Error("That slot has just been taken");
      if (!subject) throw new Error("Choose a patient first");

      await supabase.from("availability_slots").update({ status: "booked" }).eq("id", slot.id);
      await supabase.from("consultations").insert({
        referral_id: null,
        patient_id: subject.id,
        provider_id: profile?.provider_id ?? null,
        facility_id: profile?.facility_id ?? null,
        scheduled_at: slot.starts_at,
        kind,
        status: "scheduled",
        notes:
          kind === "teleconsult"
            ? "Teleconsult booked from the chart"
            : "Clinic appointment booked from the chart",
        plan: "",
      });

      // The patient hears about it on the only channel they use.
      const copy = CONFIRM_COPY[subject.language] ?? CONFIRM_COPY["en"]!;
      const when = `${shortDate(slot.starts_at)}, ${clockTime(slot.starts_at)}`;
      await supabase.from("messages").insert({
        patient_id: subject.id,
        direction: "out",
        body: copy.body(when, kind === "teleconsult"),
        kind: "text",
        language: subject.language,
        channel: "whatsapp",
        actions: [
          { label: copy.yes, action: "reply" },
          { label: copy.move, action: "reply" },
          { label: copy.no, action: "reply" },
        ],
      });
    },
    onSuccess: () => {
      toast.success("Booked — confirmation sent to the patient's care line");
      setOpen(false);
      setPicked(null);
      setPatientQuery("");
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          trigger === "primary"
            ? "inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground"
            : "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-medium transition-colors hover:border-primary/40 hover:text-primary"
        }
      >
        <CalendarPlus className="h-3.5 w-3.5" />
        {trigger === "primary" ? "New appointment" : "Book"}
      </button>

      {open ? (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-display text-[18px]">
                {subject ? `Book an appointment · ${subject.full_name}` : "New appointment"}
              </DialogTitle>
              <DialogDescription className="text-[13px]">
                {subject
                  ? `Your open slots. The confirmation goes to their care line in ${
                      subject.language === "jam"
                        ? "Jamaican Patois"
                        : subject.language === "ht"
                          ? "Haitian Kreyòl"
                          : subject.language === "es"
                            ? "Spanish"
                            : "English"
                    }.`
                  : "Choose a patient from your list, then a slot."}
              </DialogDescription>
            </DialogHeader>

            {!subject ? (
              <>
                <input
                  value={patientQuery}
                  onChange={(e) => setPatientQuery(e.target.value)}
                  placeholder="Search your patients…"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
                />
                <div className="max-h-[320px] divide-y divide-border overflow-y-auto rounded-lg border border-border">
                  {bookable.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPicked(p)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface"
                    >
                      <span className="text-[13px] font-medium">{p.full_name}</span>
                      <span className="text-[12px] text-muted-foreground">
                        {p.age}
                        {p.sex} · {p.parish}, {p.island_code}
                      </span>
                    </button>
                  ))}
                  {!bookable.length ? (
                    <p className="px-3 py-6 text-[13px] leading-relaxed text-muted-foreground">
                      Nobody on your list matches that. You can only book for a patient you already
                      hold a lawful basis for — find them under All patients and establish one
                      first.
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}

            {subject ? (
              <>
                <div className="flex items-center gap-1.5">
                  {(
                    [
                      { k: "teleconsult" as const, label: "Teleconsult", icon: Video },
                      { k: "in_person" as const, label: "In person", icon: MapPin },
                    ] satisfies {
                      k: "teleconsult" | "in_person";
                      label: string;
                      icon: typeof Video;
                    }[]
                  ).map((o) => (
                    <button
                      key={o.k}
                      type="button"
                      onClick={() => setKind(o.k)}
                      className={
                        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors " +
                        (kind === o.k
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:text-foreground")
                      }
                    >
                      <o.icon className="h-3.5 w-3.5" />
                      {o.label}
                    </button>
                  ))}
                </div>

                <div className="max-h-[320px] divide-y divide-border overflow-y-auto rounded-lg border border-border">
                  {mySlots.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={book.isPending}
                      onClick={() => book.mutate(s.id)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-surface disabled:opacity-60"
                    >
                      <span className="font-medium">
                        {shortDate(s.starts_at)} · {clockTime(s.starts_at)}
                      </span>
                      <span className="text-[12px] text-muted-foreground">{s.minutes} min</span>
                    </button>
                  ))}
                  {!mySlots.length ? (
                    <p className="px-3 py-6 text-[13px] text-muted-foreground">
                      You have no open slots. Slots come from your availability, which the routing
                      engine also books against.
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}
            {!patient && picked ? (
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="self-start text-[12.5px] font-medium text-muted-foreground hover:text-foreground"
              >
                ← Choose a different patient
              </button>
            ) : null}
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
