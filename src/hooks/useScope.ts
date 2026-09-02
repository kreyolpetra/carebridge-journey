import { useAuth } from "@/hooks/useAuth";

/**
 * Data scope for the signed-in user.
 * Patients only ever see their own record; every other role sees the region.
 */
export function useScope() {
  const { role, profile } = useAuth();
  const isPatient = role === "patient";
  return {
    role,
    isPatient,
    /** When set, all queries on the page must be filtered to this patient. */
    patientId: isPatient ? (profile?.patient_id ?? null) : null,
  };
}
