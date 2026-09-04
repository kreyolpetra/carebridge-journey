/**
 * The facility the signed-in clinician actually works in.
 *
 * A hook rather than a lookup written out in each screen, because both the
 * home screen and the Patients screen need it to size the day, and the two
 * disagreeing about which building you are in would put the worklist's cut
 * line in two different places.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { facilitiesQuery, type Facility } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

export function useMyFacility(): Facility | null {
  const { profile } = useAuth();
  const facilities = useQuery(facilitiesQuery);
  return useMemo(
    () => (facilities.data ?? []).find((f) => f.id === profile?.facility_id) ?? null,
    [facilities.data, profile],
  );
}
