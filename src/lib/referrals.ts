/**
 * Accepting a referral.
 *
 * A referral is not answered when it is sent. It is answered when a named
 * clinician takes it on and the patient knows — which is why this records who
 * accepted it, when, and sends the patient a message in their own language.
 *
 * It lives here because two surfaces accept referrals — the chart and the
 * no-basis panel — and both previously showed a toast reading "patient
 * notified on WhatsApp" while sending nothing at all. One copy of the truth is
 * harder to lie with than two copies of the same optimistic string.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Patient } from "@/lib/api";

/**
 * Written per language rather than translated at send time. A hand-off
 * confirmation a patient cannot read has not confirmed anything.
 */
export const REFERRAL_ACCEPTED_COPY: Record<string, string> = {
  en: "Good news — a specialist has accepted your referral and will see you. We will message you here with the appointment time.",
  jam: "Good news — a specialist tek up yuh referral an wi wi see yuh. Wi wi message yuh right yah so wid di appointment time.",
  ht: "Bon nouvèl — yon espesyalis aksepte referans ou an epi l ap wè ou. N ap voye lè randevou a ban ou isit la.",
  es: "Buenas noticias: un especialista ha aceptado su derivación y le atenderá. Le enviaremos la hora de la cita por aquí.",
};

export async function acceptReferral({
  referralId,
  patientId,
  patient,
  providerId,
}: {
  referralId: string;
  patientId: string;
  /** Used only for the language the confirmation is written in. */
  patient: Patient | null | undefined;
  providerId: string | null;
}) {
  const { error } = await supabase
    .from("referrals")
    .update({
      status: "accepted",
      // Who took it on, and when. Without these the sending clinician cannot
      // learn their referral was answered, and a hand-off goes quiet while the
      // patient waits on it.
      accepted_at: new Date().toISOString(),
      accepted_by_provider_id: providerId,
    })
    .eq("id", referralId);
  if (error) throw new Error(error.message);

  await supabase.from("consultations").insert({
    referral_id: referralId,
    patient_id: patientId,
    status: "in_progress",
    notes: "Teleconsult opened from the clinician console.",
  });

  const language = patient?.language ?? "en";
  await supabase.from("messages").insert({
    patient_id: patientId,
    direction: "out",
    body: REFERRAL_ACCEPTED_COPY[language] ?? REFERRAL_ACCEPTED_COPY["en"]!,
    kind: "text",
    language,
    channel: "whatsapp",
  });
}
