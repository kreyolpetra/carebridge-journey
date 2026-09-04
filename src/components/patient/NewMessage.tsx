/**
 * Starting a conversation with a patient who has not written first.
 *
 * The inbox derives its threads from messages that exist, so until now a
 * clinician could only ever reply. That quietly made the care line a support
 * queue rather than a care channel: no reminder before a clinic, no "your
 * tablets are in", no check-in on someone whose readings have drifted — every
 * one of which is outbound, and none of which were possible.
 *
 * Templates are written in the patient's own language rather than translated
 * at send time, because a message a patient cannot read is not outreach. The
 * language is theirs, from their record; the clinician does not choose it.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PenLine, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { patientsQuery, type Patient } from "@/lib/api";
import { useAccessIndex } from "@/lib/access-basis";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pill } from "@/components/grid";
import { LANGUAGE_LABEL } from "@/lib/format";

type Template = { key: string; label: string; body: Record<string, string> };

/**
 * Four openers that cover most outbound traffic on a chronic-disease line.
 * Each is written, not machine-translated — Patois and Kreyòl are separate
 * languages here, and a Kreyòl speaker is not served by Patois.
 */
const TEMPLATES: Template[] = [
  {
    key: "checkin",
    label: "Check in on readings",
    body: {
      en: "Good day. How have your blood pressure readings been this week? Send me the numbers when you can.",
      jam: "Good day. How yuh pressure a read dis week? Send mi di numbers when yuh can.",
      ht: "Bonjou. Kijan tansyon ou ye semèn sa a? Voye chif yo ban mwen lè ou kapab.",
      es: "Buen día. ¿Cómo han estado sus lecturas de presión esta semana? Envíeme los números cuando pueda.",
    },
  },
  {
    key: "refill",
    label: "Medication ready",
    body: {
      en: "Your medication is ready for collection at the clinic. Come any day this week.",
      jam: "Yuh medication ready fi collect at di clinic. Come any day dis week.",
      ht: "Medikaman ou pare pou w vin pran nan klinik la. Ou ka vini nenpòt jou semèn sa a.",
      es: "Su medicamento está listo para recoger en la clínica. Puede venir cualquier día de esta semana.",
    },
  },
  {
    key: "appointment",
    label: "Ask them to come in",
    body: {
      en: "We would like to see you at the clinic. Reply and we will find a time that works.",
      jam: "Wi want fi see yuh at di clinic. Reply an wi wi find a time weh work fi yuh.",
      ht: "Nou ta renmen wè ou nan klinik la. Reponn epi n ap jwenn yon lè ki bon pou ou.",
      es: "Nos gustaría verle en la clínica. Responda y buscaremos una hora que le convenga.",
    },
  },
  {
    key: "followup",
    label: "After a visit",
    body: {
      en: "Following up after your visit — how are you feeling since we saw you?",
      jam: "Just a check pon yuh after di visit — how yuh a feel since wi see yuh?",
      ht: "N ap swiv apre vizit ou a — kijan ou santi w depi nou te wè w?",
      es: "Seguimiento tras su visita: ¿cómo se ha sentido desde que le vimos?",
    },
  },
];

export function NewMessage({ onSent }: { onSent?: ((patientId: string) => void) | undefined }) {
  const qc = useQueryClient();
  const patients = useQuery(patientsQuery);
  const { index: access, ready } = useAccessIndex();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Patient | null>(null);
  const [body, setBody] = useState("");

  /**
   * Only patients a lawful basis reaches. Messaging someone is contacting
   * them, so it is not a way around the access model — the directory shows who
   * exists, this shows who you may write to.
   */
  const reachable = useMemo(() => {
    if (!ready) return [];
    const needle = search.trim().toLowerCase();
    return (patients.data ?? [])
      .filter((p) => access.decide(p.id).allowed)
      .filter(
        (p) =>
          !needle ||
          p.full_name.toLowerCase().includes(needle) ||
          p.mrn.toLowerCase().includes(needle) ||
          p.parish.toLowerCase().includes(needle),
      )
      .slice(0, 40);
  }, [patients.data, access, ready, search]);

  const lang = picked?.language ?? "en";

  const send = useMutation({
    mutationFn: async () => {
      if (!picked) throw new Error("Choose who this is going to");
      if (!body.trim()) throw new Error("Write something first");
      const { error } = await supabase.from("messages").insert({
        patient_id: picked.id,
        direction: "out",
        body: body.trim(),
        kind: "text",
        language: picked.language,
        channel: "whatsapp",
      });
      if (error) throw new Error(error.message);
      return picked.id;
    },
    onSuccess: (patientId) => {
      toast.success("Sent to the patient's care line");
      void qc.invalidateQueries();
      setOpen(false);
      setPicked(null);
      setBody("");
      setSearch("");
      if (patientId) onSent?.(patientId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground"
      >
        <PenLine className="h-3.5 w-3.5" />
        New message
      </button>

      {open ? (
        <Dialog
          open
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) {
              setPicked(null);
              setBody("");
              setSearch("");
            }
          }}
        >
          <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display text-[18px]">
                {picked ? `Message ${picked.full_name}` : "New message"}
              </DialogTitle>
              <DialogDescription className="text-[13px]">
                {picked
                  ? `Goes to their WhatsApp line in ${LANGUAGE_LABEL[lang] ?? lang}.`
                  : "Choose a patient you hold a lawful basis for."}
              </DialogDescription>
            </DialogHeader>

            {!picked ? (
              <>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, record number or parish…"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
                />
                <div className="max-h-[320px] divide-y divide-border overflow-y-auto rounded-lg border border-border">
                  {reachable.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPicked(p)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium">
                          {p.full_name}
                        </span>
                        <span className="block truncate text-[11.5px] text-muted-foreground">
                          {p.mrn} · {p.age}
                          {p.sex} · {p.parish}, {p.island_code}
                        </span>
                      </span>
                      <Pill className="shrink-0 border-border bg-surface text-muted-foreground">
                        {LANGUAGE_LABEL[p.language] ?? p.language}
                      </Pill>
                    </button>
                  ))}
                  {!reachable.length ? (
                    <p className="px-3 py-6 text-[13px] leading-relaxed text-muted-foreground">
                      Nobody you can write to matches that. You can only message a patient you hold
                      a lawful basis for.
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Start from a template
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPLATES.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setBody(t.body[lang] ?? t.body["en"] ?? "")}
                        className="rounded-lg border border-border px-2.5 py-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={5}
                  placeholder={`Write in ${LANGUAGE_LABEL[lang] ?? lang}…`}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13.5px] outline-none focus:border-primary"
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setPicked(null)}
                    className="text-[12.5px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    ← Someone else
                  </button>
                  <button
                    type="button"
                    disabled={!body.trim() || send.isPending}
                    onClick={() => send.mutate()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-40"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {send.isPending ? "Sending…" : "Send"}
                  </button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
