import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Encounter } from "@/lib/org";
import type { Facility } from "@/lib/api";

/* ------------------------------------------------------------------ */
/* Lawful bases                                                        */
/* ------------------------------------------------------------------ */

export type AccessBasis = "treating" | "institutional" | "consent" | "break_glass" | "self";

export const BASIS_LABEL: Record<AccessBasis, string> = {
  treating: "Treating facility",
  institutional: "Institutional agreement",
  consent: "You approved this",
  break_glass: "Emergency override",
  self: "You",
};

export const BASIS_BLURB: Record<AccessBasis, string> = {
  treating:
    "A facility currently caring for you may read the chart it needs, for a limited time after the visit closes. No tap required — care would stall otherwise.",
  institutional:
    "Two facilities with a signed, time-limited data-sharing agreement (a standing referral pipeline) may exchange the agreed scope without a fresh approval each visit.",
  consent: "A one-off request you explicitly approved, scoped to named data and an expiry date.",
  break_glass:
    "An emergency override taken without your approval to protect life. You are notified within the hour and a governance panel must review it.",
  self: "You opened your own record.",
};

export const BASIS_TONE: Record<AccessBasis, string> = {
  treating: "border-border bg-surface text-muted-foreground",
  institutional: "border-signal/30 bg-signal/10 text-signal",
  consent: "border-primary/30 bg-primary/10 text-primary",
  break_glass: "border-critical/40 bg-critical/10 text-critical",
  self: "border-low/40 bg-low/10 text-low",
};

/* ------------------------------------------------------------------ */
/* Role tiers                                                          */
/* ------------------------------------------------------------------ */

export type CareTier = "attending" | "consulting" | "nursing" | "allied" | "front_desk" | "org_admin";

export const TIER_LABEL: Record<CareTier, string> = {
  attending: "Attending clinician",
  consulting: "Consulting specialist",
  nursing: "Nursing staff",
  allied: "Allied health (pharmacy, lab, imaging)",
  front_desk: "Front desk / registration",
  org_admin: "Facility admin",
};

export const TIER_SCOPE: Record<CareTier, string> = {
  attending: "Full chart for the episode plus longitudinal history",
  consulting: "Referral question and clinically relevant sections, current episode only",
  nursing: "Vitals, medications, care plan, allergies and orders for the current episode",
  allied: "Their own order, result or dispensing stream, plus allergies and active medications",
  front_desk: "Demographics, insurance and appointment times — no clinical content",
  org_admin: "Staff, capacity and billing metadata — no clinical content",
};

/** Which staff role maps onto which care tier by default. */
export const STAFF_ROLE_TIER: Record<string, CareTier> = {
  doctor: "attending",
  nurse: "nursing",
  front_desk: "front_desk",
  org_admin: "org_admin",
};

export function tierCanSeeClinical(tier: CareTier) {
  return tier === "attending" || tier === "consulting" || tier === "nursing" || tier === "allied";
}

/* ------------------------------------------------------------------ */
/* Sensitive categories                                                */
/* ------------------------------------------------------------------ */

export type SensitiveCategory =
  | "mental_health"
  | "hiv"
  | "srh"
  | "substance_use"
  | "gbv"
  | "genetic"
  | "adolescent";

export const SENSITIVE_CATEGORIES: {
  code: SensitiveCategory;
  label: string;
  gate: string;
}[] = [
  { code: "mental_health", label: "Mental health & psychiatric notes", gate: "Explicit consent, or the treating psychiatrist" },
  { code: "hiv", label: "HIV status, testing and ART", gate: "Explicit consent; emergency override allowed with mandatory review" },
  { code: "srh", label: "Sexual & reproductive health", gate: "Explicit consent" },
  { code: "substance_use", label: "Substance use & addiction treatment", gate: "Explicit consent, or attending clinician only" },
  { code: "gbv", label: "Sexual assault / intimate-partner violence notes", gate: "Explicit consent; never visible to admin tiers" },
  { code: "genetic", label: "Genetic and familial risk data", gate: "Explicit consent" },
  { code: "adolescent", label: "Adolescent confidential services (12–17)", gate: "The young person's own consent" },
];

export const SENSITIVE_LABEL: Record<string, string> = Object.fromEntries(
  SENSITIVE_CATEGORIES.map((c) => [c.code, c.label]),
);

export function isSensitive(sensitivity?: string | null) {
  return !!sensitivity && sensitivity !== "standard";
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

export type TreatingWindowPolicy = {
  facility_kind: string;
  label: string;
  days: number;
  rationale: string;
};

export type DataSharingAgreement = {
  id: string;
  reference: string;
  from_facility_id: string;
  to_facility_id: string;
  purpose: string;
  scope: string[];
  status: string;
  executed_on: string;
  expires_at: string;
  review_due_on: string;
  patient_opt_out_allowed: boolean;
};

export type SensitiveGrant = {
  id: string;
  patient_id: string;
  category: string;
  provider_id: string | null;
  facility_id: string | null;
  status: string;
  purpose: string;
  granted_at: string | null;
  expires_at: string | null;
  created_at: string;
};

export type CareTeamMember = {
  id: string;
  patient_id: string;
  facility_id: string;
  provider_id: string | null;
  tier: string;
  encounter_id: string | null;
  active_from: string;
  active_until: string | null;
};

export type BreakGlassEvent = {
  id: string;
  patient_id: string;
  facility_id: string | null;
  provider_id: string | null;
  actor_name: string;
  actor_tier: string;
  reason: string;
  started_at: string;
  expires_at: string;
  patient_notified_at: string | null;
  review_status: string;
  reviewed_at: string | null;
  reviewer_note: string;
};

function unwrap<T>(res: { data: unknown; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as T;
}

export const treatingWindowsQuery = queryOptions({
  queryKey: ["treating_window_policies"],
  staleTime: 300_000,
  queryFn: async () =>
    unwrap<TreatingWindowPolicy[]>(
      await supabase.from("treating_window_policies").select("*").order("days"),
    ),
});

export const agreementsQuery = queryOptions({
  queryKey: ["data_sharing_agreements"],
  staleTime: 60_000,
  queryFn: async () =>
    unwrap<DataSharingAgreement[]>(
      await supabase.from("data_sharing_agreements").select("*").order("executed_on", { ascending: false }),
    ),
});

export const sensitiveGrantsQuery = (patientId?: string | null) =>
  queryOptions({
    queryKey: ["sensitive_grants", patientId ?? "all"],
    staleTime: 10_000,
    queryFn: async () => {
      let q = supabase.from("sensitive_grants").select("*").order("created_at", { ascending: false });
      if (patientId) q = q.eq("patient_id", patientId);
      return unwrap<SensitiveGrant[]>(await q);
    },
  });

export const careTeamQuery = (patientId?: string | null) =>
  queryOptions({
    queryKey: ["care_team_members", patientId ?? "all"],
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase.from("care_team_members").select("*").limit(500);
      if (patientId) q = q.eq("patient_id", patientId);
      return unwrap<CareTeamMember[]>(await q);
    },
  });

export const breakGlassQuery = (patientId?: string | null) =>
  queryOptions({
    queryKey: ["break_glass_events", patientId ?? "all"],
    staleTime: 10_000,
    queryFn: async () => {
      let q = supabase.from("break_glass_events").select("*").order("started_at", { ascending: false }).limit(200);
      if (patientId) q = q.eq("patient_id", patientId);
      return unwrap<BreakGlassEvent[]>(await q);
    },
  });

/* ------------------------------------------------------------------ */
/* Treating window resolution                                          */
/* ------------------------------------------------------------------ */

export type TreatingWindow = {
  facilityId: string;
  facilityName: string;
  islandCode: string;
  kind: string;
  policyLabel: string;
  days: number;
  lastEventAt: string;
  closesAt: string;
  open: boolean;
};

/**
 * "Treating facility" is never an indefinite grant. Each qualifying encounter
 * opens a window sized by the facility type; when it lapses without a new
 * qualifying event, no-consent access closes automatically.
 */
export function resolveTreatingWindows(
  encounters: Encounter[],
  facilities: Facility[],
  policies: TreatingWindowPolicy[],
): TreatingWindow[] {
  const byFacility = new Map<string, Encounter>();
  for (const e of encounters) {
    const prev = byFacility.get(e.facility_id);
    const at = e.ended_at ?? e.started_at;
    if (!prev || at > (prev.ended_at ?? prev.started_at)) byFacility.set(e.facility_id, e);
  }
  const now = Date.now();
  return [...byFacility.entries()]
    .map(([facilityId, e]) => {
      const facility = facilities.find((f) => f.id === facilityId);
      const kind = facility?.kind ?? "clinic";
      const policy = policies.find((p) => p.facility_kind === kind) ?? {
        facility_kind: kind,
        label: kind,
        days: 90,
        rationale: "",
      };
      const last = new Date(e.ended_at ?? e.started_at);
      const closes = new Date(last.getTime() + policy.days * 86_400_000);
      return {
        facilityId,
        facilityName: facility?.name ?? "Facility",
        islandCode: facility?.island_code ?? "—",
        kind,
        policyLabel: policy.label,
        days: policy.days,
        lastEventAt: last.toISOString(),
        closesAt: closes.toISOString(),
        open: closes.getTime() > now,
      };
    })
    .sort((a, b) => (a.closesAt < b.closesAt ? 1 : -1));
}
