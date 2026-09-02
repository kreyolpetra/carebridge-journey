import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { STAFF_ROLE_TIER, type AccessBasis, type CareTier } from "@/lib/access";

/**
 * Every read of a patient record is written to the patient-facing access log,
 * together with the lawful basis it was taken under. The log is a transparency
 * control, not a permission control — it records consented and non-consented
 * reads alike.
 */
export async function logRecordAccess(input: {
  patientId: string;
  providerId?: string | null;
  facilityId?: string | null;
  resource: string;
  basis?: AccessBasis;
  tier?: CareTier | string | null;
  actorName?: string | null;
  sensitiveCategory?: string | null;
  breakGlassId?: string | null;
  allowed?: boolean;
}) {
  await supabase.from("consent_access_log").insert({
    patient_id: input.patientId,
    provider_id: input.providerId ?? null,
    facility_id: input.facilityId ?? null,
    grant_id: null,
    resource: input.resource,
    allowed: input.allowed ?? true,
    basis: input.basis ?? "treating",
    tier: (input.tier as string) ?? null,
    actor_name: input.actorName ?? null,
    sensitive_category: input.sensitiveCategory ?? null,
    break_glass_id: input.breakGlassId ?? null,
  });
}

/**
 * Logs a record open once per patient/resource per browser session, so a demo
 * doesn't flood the ledger while a clinician clicks around a single chart.
 */
export function useLogRecordAccess(
  patientId: string | null | undefined,
  resource: string,
  options?: { basis?: AccessBasis },
) {
  const { role, profile } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!patientId || !profile) return;
    // Patients reading their own record is not a third-party access.
    if (role === "patient") return;
    const key = `caricare:access:${profile.id}:${patientId}:${resource}`;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(key)) return;
    sessionStorage?.setItem(key, "1");
    void logRecordAccess({
      patientId,
      providerId: profile.provider_id ?? null,
      facilityId: profile.facility_id ?? null,
      resource,
      basis: options?.basis ?? "treating",
      tier: (profile.staff_role ? STAFF_ROLE_TIER[profile.staff_role] : null) ?? null,
      actorName: profile.full_name,
    }).then(() => {
      void qc.invalidateQueries({ queryKey: ["access_log"] });
    });
  }, [patientId, resource, role, profile, qc, options?.basis]);
}
