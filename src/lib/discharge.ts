/**
 * Handing a patient back to the people who look after them the rest of the year.
 *
 * This is the failure the whole product exists for, in its purest form. Someone
 * is admitted in Port of Spain, treated for nine days, and sent home. The rural
 * clinic that has managed their blood pressure for a decade never learns it
 * happened. Two weeks later they walk in, the nurse asks how they have been,
 * and nobody in the room knows about the hospital stay, the two drugs that were
 * changed, or the follow-up that was supposed to happen inside a week.
 *
 * A discharge summary that stays inside the discharging hospital is not a
 * hand-off. It is a document.
 *
 * So this is a referral pointed the other way, on purpose and reusing the same
 * shape: a named clinician at the receiving end has to pick it up, the patient
 * is told in their own language, and until somebody accepts it, it sits on a
 * worklist rather than in a folder. The unacknowledged ones are the whole
 * point — they are the patients currently falling through the gap, and before
 * this they were invisible by construction.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { unwrap } from "@/lib/api";

export type Discharge = {
  id: string;
  encounter_id: string | null;
  patient_id: string;
  /** The hospital letting them go. */
  from_facility_id: string;
  /** Who picks them up afterwards — usually their own clinic. */
  to_facility_id: string | null;
  discharged_by_provider_id: string | null;
  summary: string;
  /** What changed about their drugs, which is where harm concentrates. */
  medication_changes: string;
  /** Follow-up window in days. Zero means none was asked for. */
  follow_up_days: number;
  discharged_at: string;
  acknowledged_at: string | null;
  acknowledged_by_provider_id: string | null;
  created_at: string;
};

export const dischargesQuery = queryOptions({
  queryKey: ["discharges"],
  staleTime: 10_000,
  queryFn: async () =>
    unwrap<Discharge[]>(
      await supabase
        .from("discharges")
        .select("*")
        .order("discharged_at", { ascending: false })
        .limit(2000),
    ),
});

/** Days since the patient walked out, which is the number that matters. */
export function daysSince(iso: string, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));
}

/**
 * Overdue once the follow-up window has passed with nobody having picked it up.
 * A hand-off nobody accepted inside the window the hospital asked for is the
 * definition of a patient lost between two services.
 */
export function isOverdue(d: Discharge, now = Date.now()) {
  if (d.acknowledged_at) return false;
  if (!d.follow_up_days) return daysSince(d.discharged_at, now) >= 7;
  return daysSince(d.discharged_at, now) >= d.follow_up_days;
}

/**
 * Told to the patient, not only to the clinic. The person most able to make
 * the follow-up happen is the one who has to travel to it.
 */
export const DISCHARGE_COPY: Record<string, string> = {
  en: "You have been discharged from {hospital}. Your own clinic has your discharge summary and should see you within {days} days. If nobody contacts you, please message here.",
  jam: "Yuh get discharge from {hospital}. Yuh own clinic have yuh discharge summary an fi see yuh inna {days} days. If nobody nuh contact yuh, message wi right yah so.",
  ht: "Yo bay ou egzeyat nan {hospital}. Klinik pa ou a gen rezime egzeyat ou epi li ta dwe wè ou nan {days} jou. Si pèsonn pa kontakte ou, tanpri voye mesaj isit la.",
  es: "Le han dado de alta en {hospital}. Su clínica tiene su informe de alta y debería verle en {days} días. Si nadie le contacta, escríbanos por aquí.",
};

export function dischargeMessage(language: string, hospital: string, days: number) {
  const t = DISCHARGE_COPY[language] ?? DISCHARGE_COPY["en"]!;
  return t.replace("{hospital}", hospital).replace("{days}", String(days || 7));
}

/** What the receiving clinic sends once a named person has taken it on. */
export const DISCHARGE_ACCEPTED_COPY: Record<string, string> = {
  en: "Your clinic has your hospital discharge summary and will be in touch about your follow-up appointment.",
  jam: "Yuh clinic have yuh hospital discharge summary an wi contact yuh bout yuh follow-up appointment.",
  ht: "Klinik ou a gen rezime egzeyat lopital ou epi l ap kontakte ou pou randevou swivi ou.",
  es: "Su clínica tiene su informe de alta del hospital y le contactará para su cita de seguimiento.",
};
