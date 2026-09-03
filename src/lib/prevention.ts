import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Patient, RiskScore } from "@/lib/api";

function unwrap<T>(res: { data: unknown; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as T;
}

/* ---------------------------------------------------------------- types */

export type CohortRule = {
  condition?: string | undefined;
  island?: string | undefined;
  riskMin?: number | undefined;
  daysSupplyMax?: number | undefined;
  adherenceMax?: number | undefined;
  ruralOnly?: boolean | undefined;
  ageMin?: number | undefined;
  /** legacy/seed keys tolerated */
  [key: string]: unknown;
};

export type Campaign = {
  id: string;
  name: string;
  description: string;
  condition_focus: string;
  island_code: string | null;
  facility_id: string | null;
  cohort_rule: CohortRule;
  message_template: string;
  channel: string;
  status: string;
  starts_on: string;
  created_at: string;
};

export type CampaignTarget = {
  id: string;
  campaign_id: string;
  patient_id: string;
  status: string;
  reason: string;
  sent_at: string | null;
  responded_at: string | null;
  reading_captured: boolean;
  outcome: string;
  created_at: string;
};

export type DetectionSignal = {
  id: string;
  patient_id: string;
  facility_id: string | null;
  kind: string;
  metric: string;
  current_value: number | null;
  baseline_value: number | null;
  delta_pct: number | null;
  severity: string;
  narrative: string;
  recommended_action: string;
  status: string;
  detected_at: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  campaign_id: string | null;
};

export type ClinicalDocument = {
  id: string;
  patient_id: string | null;
  facility_id: string | null;
  title: string;
  doc_type: string;
  source: string;
  storage_path: string | null;
  original_text: string;
  extraction_status: string;
  extracted: ExtractedRecord;
  extraction_note: string;
  committed: boolean;
  uploaded_by: string;
  /**
   * The date written on the document, which is not the day it was captured.
   * A card photographed today can describe a visit from 2019, so the record's
   * own date is what a timeline should order on. Null when nobody supplied it.
   */
  record_date: string | null;
  /** Optional — paper rarely carries a time, but lab draws and admissions do. */
  record_time: string | null;
  created_at: string;
};

export type ExtractedRecord = {
  conditions?: { name: string; diagnosed?: string }[];
  medications?: { name: string; dosage?: string; frequency?: string }[];
  vitals?: {
    systolic?: number;
    diastolic?: number;
    glucose_mmol?: number;
    pulse?: number;
    weight_kg?: number;
    measured_at?: string;
  }[];
  labs?: { name: string; value: string; unit?: string }[];
  allergies?: string;
  notes?: string;
};

export type ApiClient = {
  id: string;
  name: string;
  organisation: string;
  island_code: string | null;
  scopes: string[];
  status: string;
  token_prefix: string;
  system_kind: string;
  last_used_at: string | null;
  calls_30d: number;
  created_at: string;
};

export type ConditionRow = { id: string; patient_id: string; name: string; diagnosed_on: string };
export type MedRow = {
  id: string;
  patient_id: string;
  name: string;
  days_supply_left: number;
  adherence_pct: number;
};

/* -------------------------------------------------------------- queries */

export const campaignsQuery = queryOptions({
  queryKey: ["campaigns"],
  queryFn: async () =>
    unwrap<Campaign[]>(
      await supabase
        .from("screening_campaigns")
        .select("*")
        .order("created_at", { ascending: false }),
    ),
  staleTime: 10_000,
});

export const campaignTargetsQuery = queryOptions({
  queryKey: ["campaign_targets"],
  queryFn: async () =>
    unwrap<CampaignTarget[]>(await supabase.from("campaign_targets").select("*").limit(4000)),
  staleTime: 10_000,
});

export const detectionSignalsQuery = queryOptions({
  queryKey: ["detection_signals"],
  queryFn: async () =>
    unwrap<DetectionSignal[]>(
      await supabase
        .from("detection_signals")
        .select("*")
        .order("detected_at", { ascending: false })
        .limit(500),
    ),
  staleTime: 5_000,
});

/**
 * When a document belongs in a timeline, and whether that is a real date.
 *
 * A record dated by the person who captured it sorts on the care it describes;
 * one without a date can only sort on its capture, and every surface has to say
 * which of the two it is showing — "captured" and "dated" are different claims.
 */
export function documentDate(d: ClinicalDocument): { at: string; dated: boolean } {
  if (!d.record_date) return { at: d.created_at, dated: false };
  const iso = d.record_time ? `${d.record_date}T${d.record_time}` : `${d.record_date}T12:00`;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return { at: d.created_at, dated: false };
  return { at: t.toISOString(), dated: true };
}

export const documentsQuery = queryOptions({
  queryKey: ["clinical_documents"],
  queryFn: async () =>
    unwrap<ClinicalDocument[]>(
      await supabase
        .from("clinical_documents")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
    ),
  staleTime: 5_000,
});

export const apiClientsQuery = queryOptions({
  queryKey: ["api_clients"],
  queryFn: async () =>
    unwrap<ApiClient[]>(await supabase.from("api_clients").select("*").order("created_at")),
  staleTime: 30_000,
});

export const allConditionsQuery = queryOptions({
  queryKey: ["all_conditions"],
  queryFn: async () =>
    unwrap<ConditionRow[]>(
      await supabase.from("conditions").select("id, patient_id, name, diagnosed_on").limit(5000),
    ),
  staleTime: 60_000,
});

export const allMedicationsQuery = queryOptions({
  queryKey: ["all_medications"],
  queryFn: async () =>
    unwrap<MedRow[]>(
      await supabase
        .from("medications")
        .select("id, patient_id, name, days_supply_left, adherence_pct")
        .limit(5000),
    ),
  staleTime: 60_000,
});

/* --------------------------------------------------------- cohort logic */

export type CohortInputs = {
  patients: Patient[];
  risks: RiskScore[];
  conditions: ConditionRow[];
  medications: MedRow[];
};

export type CohortMatch = { patient: Patient; reason: string; risk: number };

/** Deterministic, explainable cohort evaluation — every match carries its reason. */
export function buildCohort(rule: CohortRule, input: CohortInputs): CohortMatch[] {
  const latestRisk = new Map<string, number>();
  for (const r of input.risks) {
    const prev = latestRisk.get(r.patient_id);
    if (prev === undefined || r.score > prev) latestRisk.set(r.patient_id, r.score);
  }
  const condByPatient = new Map<string, string[]>();
  for (const c of input.conditions) {
    condByPatient.set(c.patient_id, [...(condByPatient.get(c.patient_id) ?? []), c.name]);
  }
  const medByPatient = new Map<string, MedRow[]>();
  for (const m of input.medications) {
    medByPatient.set(m.patient_id, [...(medByPatient.get(m.patient_id) ?? []), m]);
  }

  const out: CohortMatch[] = [];
  for (const p of input.patients) {
    const reasons: string[] = [];
    const conds = condByPatient.get(p.id) ?? [];
    const meds = medByPatient.get(p.id) ?? [];
    const risk = latestRisk.get(p.id) ?? 0;

    if (rule.island && p.island_code !== rule.island) continue;
    if (rule.ruralOnly && !p.rural) continue;
    if (rule.ageMin !== undefined && p.age < rule.ageMin) continue;
    if (rule.condition) {
      const hit = conds.find((c) => c.toLowerCase().includes(rule.condition!.toLowerCase()));
      if (!hit) continue;
      reasons.push(hit);
    }
    if (rule.riskMin !== undefined) {
      if (risk < rule.riskMin) continue;
      reasons.push(`risk ${risk}`);
    }
    if (rule.daysSupplyMax !== undefined) {
      const low = meds.filter((m) => m.days_supply_left <= rule.daysSupplyMax!);
      if (low.length === 0) continue;
      const first = low[0]!;
      reasons.push(`${first.days_supply_left}d of ${first.name} left`);
    }
    if (rule.adherenceMax !== undefined) {
      const poor = meds.filter((m) => m.adherence_pct <= rule.adherenceMax!);
      if (poor.length === 0) continue;
      reasons.push(`${poor[0]!.adherence_pct}% adherence`);
    }
    if (rule.ruralOnly) reasons.push(`${p.km_to_facility} km from care`);

    out.push({ patient: p, reason: reasons.join(" · ") || "Matches cohort", risk });
  }
  return out.sort((a, b) => b.risk - a.risk);
}

export function renderTemplate(template: string, patient: Patient) {
  return template
    .replaceAll("{name}", patient.full_name.split(" ")[0] ?? patient.full_name)
    .replaceAll("{full_name}", patient.full_name)
    .replaceAll("{island}", patient.island_code);
}

export function ruleSummary(rule: CohortRule): string {
  const bits: string[] = [];
  if (rule.condition) bits.push(rule.condition);
  if (rule.island) bits.push(`on ${rule.island}`);
  if (rule.riskMin !== undefined) bits.push(`risk ≥ ${rule.riskMin}`);
  if (rule.daysSupplyMax !== undefined) bits.push(`≤ ${rule.daysSupplyMax}d supply`);
  if (rule.adherenceMax !== undefined) bits.push(`adherence ≤ ${rule.adherenceMax}%`);
  if (rule.ruralOnly) bits.push("rural only");
  if (rule.ageMin !== undefined) bits.push(`age ≥ ${rule.ageMin}`);
  if (typeof rule["no_reading_days"] === "number")
    bits.push(`no reading in ${rule["no_reading_days"]}d`);
  if (typeof rule["days_supply_max"] === "number")
    bits.push(`≤ ${rule["days_supply_max"]}d supply`);
  if (typeof rule["adherence_max"] === "number") bits.push(`adherence ≤ ${rule["adherence_max"]}%`);
  if (rule["rural"] === true) bits.push("rural only");
  if (typeof rule["age_min"] === "number") bits.push(`age ≥ ${rule["age_min"]}`);
  if (typeof rule["risk_min"] === "number") bits.push(`risk ≥ ${rule["risk_min"]}`);
  return bits.join(" · ") || "All patients";
}

export const SEVERITY_TONE: Record<string, string> = {
  urgent: "border-critical/40 bg-critical/10 text-critical",
  elevated: "border-high/40 bg-high/10 text-high",
  watch: "border-border bg-muted text-muted-foreground",
};

export const METRIC_LABEL: Record<string, string> = {
  systolic_bp: "Blood pressure",
  glucose: "Glucose",
  medication_supply: "Medication supply",
  adherence: "Adherence",
};
