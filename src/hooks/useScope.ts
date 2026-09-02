import { useAuth } from "@/hooks/useAuth";
import { STAFF_ROLE_TIER, type CareTier } from "@/lib/access";

/**
 * Data scope for the signed-in user.
 *
 * Patients see only their own record. Ministry and insurer see the region in
 * aggregate and never as named patients. Clinical staff see the region's
 * *counts*, but a named chart only where a lawful basis resolves — that part is
 * decided per patient by useAccessDecision(), not here, because the answer
 * depends on care teams, episodes, agreements and grants rather than on role.
 */
export function useScope() {
  const { role, profile } = useAuth();
  const isPatient = role === "patient";
  const isAggregateOnly = role === "ministry" || role === "insurer";
  const staffRole = profile?.staff_role ?? null;

  return {
    role,
    isPatient,
    /** True when this role may never resolve to an identified record. */
    isAggregateOnly,
    /** When set, all queries on the page must be filtered to this patient. */
    patientId: isPatient ? (profile?.patient_id ?? null) : null,
    facilityId: profile?.facility_id ?? null,
    providerId: profile?.provider_id ?? null,
    staffRole,
    tier: (staffRole ? STAFF_ROLE_TIER[staffRole] : null) as CareTier | null,
  };
}
