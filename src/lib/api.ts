import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const HERO_PATIENT_ID = "11111111-1111-4111-8111-111111111111";

export function unwrap<T>(res: { data: unknown; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as T;
}

export type Island = {
  code: string;
  name: string;
  country: string;
  population: number;
  lat: number;
  lng: number;
  /** Resource profile — see src/lib/mock/seed.ts for meaning and provenance. */
  tier: string;
  physPer1k: number;
  bedsPer1k: number;
  connectivity: string;
  payment: string;
};
export type Facility = {
  id: string;
  name: string;
  island_code: string;
  kind: string;
  beds_total: number;
  beds_occupied: number;
  /**
   * Whether the building is currently able to work.
   *
   * "operational", "degraded" or "offline". A hurricane does not take the
   * region's record with it — it takes one facility's ability to open it — and
   * a system that cannot express the difference cannot tell a clinician why a
   * patient has arrived somewhere unfamiliar.
   */
  continuity_status: string;
  continuity_note: string;
  continuity_since: string | null;
  /**
   * What the building actually has in it.
   *
   * Deliberately capabilities rather than a category. "Hospital" and "clinic"
   * are a useful opening question and a poor switch: there are clinics here
   * with a working laboratory and hospitals whose one has been down for a
   * year. Features are gated on these, and the type merely pre-fills them.
   */
  has_lab: boolean;
  has_imaging: boolean;
  has_pharmacy: boolean;
  /**
   * Contacts a clinician here can realistically make in one session. Feeds the
   * worklist's cut line, which used to be a constant of 12 in the code — an
   * assumption about somebody else's day, held somewhere they could not change
   * it. A solo rural nurse's day is not a hospital consultant's.
   */
  session_capacity: number;
};
export type Provider = {
  id: string;
  full_name: string;
  specialty: string;
  island_code: string;
  facility_id: string | null;
  languages: string[];
  teleconsult_rate_usd: number;
  next_local_wait_days: number;
};
export type Slot = {
  id: string;
  provider_id: string;
  starts_at: string;
  minutes: number;
  status: string;
};
export type Patient = {
  id: string;
  /**
   * Medical record number and date of birth — the second and third identifiers.
   *
   * A name is not an identifier: 82 names in this dataset are shared by more
   * than one patient. Safe practice is to confirm two, which is why these are
   * on the record rather than only in the CSV importer that always asked for
   * them.
   */
  mrn: string;
  date_of_birth: string;
  full_name: string;
  phone: string;
  age: number;
  sex: string;
  island_code: string;
  parish: string;
  language: string;
  rural: boolean;
  km_to_facility: number;
  insurer: string | null;
  /**
   * Structured, not free text in a note. A safety rule cannot read prose, and
   * an allergy the system cannot read is one it cannot stop you prescribing
   * against.
   */
  allergies: string[];
};
export type Vital = {
  id: string;
  patient_id: string;
  measured_at: string;
  systolic: number | null;
  diastolic: number | null;
  glucose_mmol: number | null;
  pulse: number | null;
  weight_kg: number | null;
  source: string;
};
/**
 * A reply button attached to an outbound message — the WhatsApp interactive
 * buttons a patient taps instead of typing. "call" places a voice call to the
 * care line; "reply" sends its own label back as a message.
 */
export type MessageAction = {
  label: string;
  action: "call" | "reply";
};

export type Message = {
  id: string;
  patient_id: string;
  direction: string;
  body: string;
  kind: string;
  language: string;
  channel: string;
  queued_offline: boolean;
  created_at: string;
  /** Present on outbound messages that offer the patient buttons. */
  actions?: MessageAction[] | null;
  /** Seconds, on kind === "call" rows. */
  call_seconds?: number | null;
};
export type RiskScore = {
  id: string;
  patient_id: string;
  score: number;
  band: string;
  trend: string;
  drivers: { label: string; points: number }[];
  computed_at: string;
};
export type Alert = {
  id: string;
  kind: string;
  severity: string;
  island_code: string | null;
  patient_id: string | null;
  title: string;
  detail: string;
  resolved: boolean;
  created_at: string;
};
export type Referral = {
  id: string;
  patient_id: string;
  to_provider_id: string | null;
  /**
   * Who raised it. A referral used to record only its destination, so the
   * clinician who sent one had no way to ask what became of it — the system
   * did not know it was theirs. That is the whole of "referrals vanish".
   */
  from_provider_id: string | null;
  from_facility_id: string | null;
  /** When the receiving clinician actually took it on, not when it was sent. */
  accepted_at: string | null;
  accepted_by_provider_id: string | null;
  specialty: string;
  status: string;
  cross_island: boolean;
  reason: string;
  wait_days_local: number;
  wait_days_routed: number;
  retained_value_usd: number;
  /** 0–100 counterfactual-harm score; see computeNeed() in src/lib/routing.ts. */
  need_score: number;
  prioritised_on_need: boolean;
  patient_island: string;
  created_at: string;
};
export type ConsentGrant = {
  id: string;
  patient_id: string;
  provider_id: string | null;
  scope: string[];
  purpose: string;
  status: string;
  granted_at: string | null;
  expires_at: string | null;
  created_at: string;
};
export type AccessLogRow = {
  id: string;
  patient_id: string;
  provider_id: string | null;
  grant_id: string | null;
  resource: string;
  allowed: boolean;
  accessed_at: string;
  basis: string;
  tier: string | null;
  facility_id: string | null;
  sensitive_category: string | null;
  actor_name: string | null;
  break_glass_id: string | null;
};
export type StockItem = {
  id: string;
  facility_id: string;
  medication_name: string;
  on_hand: number;
  days_cover: number;
  status: string;
};
export type TriageEvent = {
  id: string;
  patient_id: string;
  severity: string;
  category: string;
  recommended_level: string;
  rationale: string;
  red_flags: string[];
  confidence: number;
  created_at: string;
};
export type Condition = { id: string; patient_id: string; name: string; diagnosed_on: string };
export type Consultation = {
  id: string;
  referral_id: string | null;
  patient_id: string;
  provider_id: string | null;
  facility_id: string | null;
  scheduled_at: string;
  /** "teleconsult" | "in_person" — how the appointment is delivered. */
  kind: string;
  status: string;
  notes: string;
  plan: string;
  /**
   * Whether somebody has to bring this patient home — see lib/escort.ts. The
   * escort's name and relationship are the only two things kept about them:
   * they are not our patient and have consented to nothing.
   */
  escort_required?: boolean;
  escort_reason?: string;
  escort_name?: string;
  escort_relationship?: string;
  escort_confirmed_at?: string | null;
  /** When the patient was asked on the care line, so we do not ask twice. */
  escort_asked_at?: string | null;
  created_at: string;
};

/** Appointments across every patient, for the schedule. */
export const consultationsQuery = queryOptions({
  queryKey: ["consultations"],
  staleTime: 5_000,
  queryFn: async () =>
    unwrap<Consultation[]>(
      await supabase
        .from("consultations")
        .select("*")
        .order("scheduled_at", { ascending: false })
        .limit(3000),
    ),
});
export type Medication = {
  id: string;
  patient_id: string;
  name: string;
  dosage: string;
  frequency: string;
  adherence_pct: number;
  last_refill_on: string | null;
  days_supply_left: number;
};

export const islandsQuery = queryOptions({
  queryKey: ["islands"],
  queryFn: async () => unwrap<Island[]>(await supabase.from("islands").select("*").order("name")),
  staleTime: 60_000,
});

export const facilitiesQuery = queryOptions({
  queryKey: ["facilities"],
  queryFn: async () => unwrap<Facility[]>(await supabase.from("facilities").select("*")),
  staleTime: 60_000,
});

export const providersQuery = queryOptions({
  queryKey: ["providers"],
  queryFn: async () => unwrap<Provider[]>(await supabase.from("providers").select("*")),
  staleTime: 60_000,
});

export const slotsQuery = queryOptions({
  queryKey: ["slots"],
  queryFn: async () =>
    unwrap<Slot[]>(
      await supabase.from("availability_slots").select("*").order("starts_at").limit(2000),
    ),
  staleTime: 30_000,
});

export const patientsQuery = queryOptions({
  queryKey: ["patients"],
  queryFn: async () => unwrap<Patient[]>(await supabase.from("patients").select("*").limit(3000)),
  staleTime: 60_000,
});

export const riskScoresQuery = queryOptions({
  queryKey: ["risk_scores"],
  queryFn: async () =>
    unwrap<RiskScore[]>(
      await supabase
        .from("risk_scores")
        .select("*")
        .order("score", { ascending: false })
        .limit(3000),
    ),
  staleTime: 30_000,
});

export const alertsQuery = queryOptions({
  queryKey: ["alerts"],
  queryFn: async () =>
    unwrap<Alert[]>(
      await supabase
        .from("alerts")
        .select("*")
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(300),
    ),
  staleTime: 15_000,
});

export const referralsQuery = queryOptions({
  queryKey: ["referrals"],
  queryFn: async () =>
    unwrap<Referral[]>(
      await supabase
        .from("referrals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(3000),
    ),
  staleTime: 15_000,
});

export const stockQuery = queryOptions({
  queryKey: ["stock"],
  queryFn: async () => unwrap<StockItem[]>(await supabase.from("stock_items").select("*")),
  staleTime: 60_000,
});

export const accessLogQuery = queryOptions({
  queryKey: ["access_log"],
  queryFn: async () =>
    unwrap<AccessLogRow[]>(
      await supabase
        .from("consent_access_log")
        .select("*")
        .order("accessed_at", { ascending: false })
        .limit(200),
    ),
  staleTime: 5_000,
});

export const consentGrantsQuery = queryOptions({
  queryKey: ["consent_grants"],
  queryFn: async () =>
    unwrap<ConsentGrant[]>(
      await supabase
        .from("consent_grants")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
    ),
  staleTime: 5_000,
});

/** The whole longitudinal record for one patient, assembled from every table. */
export type PatientBundle = {
  patient: Patient;
  conditions: Condition[];
  medications: Medication[];
  vitals: Vital[];
  messages: Message[];
  risk: RiskScore | null;
  triage: TriageEvent[];
  referrals: Referral[];
  grants: ConsentGrant[];
  consultations: Consultation[];
};

/**
 * Recent care-line traffic across every patient, for the clinician inbox.
 * Ordered newest first so grouping by patient yields each thread's latest
 * message without a second pass.
 */
/**
 * Actions a clinician has taken on a patient that are not clinical facts —
 * marking someone contacted for the day, accepting an agent brief. Kept apart
 * from the record itself: this is who did what on the worklist, not what is
 * true about the patient.
 */
export type WorkflowEvent = {
  id: string;
  patient_id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  label: string | null;
  detail: string | null;
  created_at: string;
};

/**
 * Membership of the health data cooperative. A member is a patient who has
 * opted their de-identified record into the research pool, and who can leave.
 * Nothing enters an extract without a row here in `active` status.
 */
export type CooperativeMember = {
  id: string;
  patient_id: string;
  status: string;
  scope: string[];
  joined_at: string;
  withdrawn_at: string | null;
  created_at: string;
};

export const cooperativeMembersQuery = queryOptions({
  queryKey: ["cooperative_members"],
  staleTime: 5_000,
  queryFn: async () =>
    unwrap<CooperativeMember[]>(await supabase.from("cooperative_members").select("*").limit(3000)),
});

/** An institution asking for access to a cohort, and the decision on it. */
export type DataRequest = {
  id: string;
  institution: string;
  requester_unit: string;
  purpose: string;
  cohort: string;
  islands: string[];
  status: string;
  fee_usd: number;
  decided_at: string | null;
  decided_by: string | null;
  decision_note: string;
  created_at: string;
};

export const dataRequestsQuery = queryOptions({
  queryKey: ["data_requests"],
  staleTime: 2_000,
  queryFn: async () =>
    unwrap<DataRequest[]>(
      await supabase
        .from("data_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
    ),
});

/**
 * A safety finding someone sent for independent review, and its outcome.
 *
 * Findings themselves are computed live from the chart, so there is no stored
 * copy to drift out of date. What is stored is the human part CareBridge's
 * §6.10 insists on keeping: who raised it, what the rule read at the time, who
 * reviewed it, and what they decided.
 */
export type SafetyReview = {
  id: string;
  patient_id: string;
  finding_key: string;
  kind: string;
  tier: string;
  title: string;
  detail: string;
  evidence: string[];
  status: string;
  raised_by_id: string | null;
  raised_by_name: string;
  raised_at: string;
  reviewer_id: string | null;
  reviewer_name: string | null;
  decision: string | null;
  note: string;
  resolved_at: string | null;
  created_at: string;
};

export const safetyReviewsQuery = queryOptions({
  queryKey: ["safety_reviews"],
  staleTime: 2_000,
  queryFn: async () =>
    unwrap<SafetyReview[]>(
      await supabase
        .from("safety_reviews")
        .select("*")
        .order("raised_at", { ascending: false })
        .limit(500),
    ),
});

export const workflowEventsQuery = queryOptions({
  queryKey: ["workflow_events"],
  staleTime: 2_000,
  queryFn: async () =>
    unwrap<WorkflowEvent[]>(
      await supabase
        .from("workflow_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2000),
    ),
});

export const recentMessagesQuery = queryOptions({
  queryKey: ["messages", "recent"],
  staleTime: 5_000,
  queryFn: async () =>
    unwrap<Message[]>(
      await supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(3000),
    ),
});

export function patientBundleQuery(patientId: string) {
  return queryOptions({
    queryKey: ["patient-bundle", patientId],
    queryFn: async () => {
      const [
        patient,
        conditions,
        medications,
        vitals,
        messages,
        risk,
        triage,
        referrals,
        grants,
        consultations,
      ] = await Promise.all([
        supabase.from("patients").select("*").eq("id", patientId).single(),
        supabase.from("conditions").select("*").eq("patient_id", patientId),
        supabase.from("medications").select("*").eq("patient_id", patientId),
        supabase
          .from("vitals")
          .select("*")
          .eq("patient_id", patientId)
          .order("measured_at", { ascending: false })
          .limit(90),
        supabase.from("messages").select("*").eq("patient_id", patientId).order("created_at"),
        supabase
          .from("risk_scores")
          .select("*")
          .eq("patient_id", patientId)
          .order("computed_at", { ascending: false })
          .limit(1),
        supabase
          .from("triage_events")
          .select("*")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("referrals")
          .select("*")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false }),
        supabase
          .from("consent_grants")
          .select("*")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false }),
        supabase
          .from("consultations")
          .select("*")
          .eq("patient_id", patientId)
          .order("scheduled_at", { ascending: false }),
      ]);
      if (patient.error) throw new Error(patient.error.message);
      return {
        patient: patient.data as Patient,
        conditions: (conditions.data ?? []) as Condition[],
        medications: (medications.data ?? []) as Medication[],
        vitals: (vitals.data ?? []) as Vital[],
        messages: (messages.data ?? []) as Message[],
        risk: ((risk.data ?? [])[0] ?? null) as unknown as RiskScore | null,
        triage: (triage.data ?? []) as TriageEvent[],
        referrals: (referrals.data ?? []) as unknown as Referral[],
        grants: (grants.data ?? []) as ConsentGrant[],
        consultations: (consultations.data ?? []) as Consultation[],
      };
    },
    staleTime: 5_000,
  });
}
