import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Encounter = {
  id: string;
  patient_id: string;
  facility_id: string;
  provider_id: string | null;
  consultation_id: string | null;
  kind: string;
  reason: string;
  summary: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  /** What happens next, kept apart from what happened. */
  plan?: string;
};

export type FacilityStaff = {
  id: string;
  user_id: string | null;
  facility_id: string;
  staff_role: string;
  title: string;
  full_name: string | null;
  /** Written when somebody is invited during setup — see lib/staff-invite.ts. */
  contact?: string;
  invited_at?: string | null;
};

export const STAFF_ROLE_LABEL: Record<string, string> = {
  doctor: "Doctor",
  nurse: "Nurse",
  front_desk: "Front desk",
  org_admin: "Facility admin",
};

export const ENCOUNTER_KIND_LABEL: Record<string, string> = {
  clinic_visit: "Clinic visit",
  emergency: "Emergency / A&E",
  teleconsult: "Teleconsult",
  admission: "Admission",
};

/** Encounters across the network, optionally scoped to one patient. */
export const encountersQuery = (patientId?: string | null) =>
  queryOptions({
    queryKey: ["encounters", patientId ?? "all"],
    staleTime: 15_000,
    queryFn: async (): Promise<Encounter[]> => {
      let q = supabase
        .from("encounters")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(patientId ? 200 : 8000);
      if (patientId) q = q.eq("patient_id", patientId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as Encounter[];
    },
  });

export const facilityStaffQuery = queryOptions({
  queryKey: ["facility_staff"],
  staleTime: 60_000,
  queryFn: async (): Promise<FacilityStaff[]> => {
    const { data, error } = await supabase.from("facility_staff").select("*").limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as FacilityStaff[];
  },
});
