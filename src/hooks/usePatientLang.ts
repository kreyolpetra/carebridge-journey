/**
 * The signed-in patient's own language, and a translator bound to it.
 *
 * Returns English for everyone who is not a patient: a clinician's console has
 * its own vocabulary, and translating "lawful basis" would help nobody while
 * introducing a way to be wrong about something that matters.
 */
import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { patientsQuery } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { translate } from "@/lib/i18n";

export function usePatientLang() {
  const { profile } = useAuth();
  const patients = useQuery({ ...patientsQuery, enabled: Boolean(profile?.patient_id) });

  const lang =
    profile?.primary_role === "patient"
      ? ((patients.data ?? []).find((p) => p.id === profile.patient_id)?.language ?? "en")
      : "en";

  const t = useCallback(
    (key: string, vars?: Record<string, string>) => translate(lang, key, vars),
    [lang],
  );

  return { lang, t };
}
