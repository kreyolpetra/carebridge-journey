/**
 * Safety interception.
 *
 * CareBridge's Safety Sentinel is the one thing that product has which this
 * one had no version of at all. Everything here is adapted from its §6.10 to
 * an outpatient regional service: the rules that matter when a clinician is
 * reviewing a chronic-disease chart from another island, not the ones that
 * matter at a hospital bedside with a barcode scanner.
 *
 * Three principles carried over intact, because they are what make it a
 * safety system rather than a warning banner:
 *
 *   1. Tiering (FR-SAFE-02). A product that shouts at every opportunity trains
 *      people to click through the one alert that mattered. Only `stop` blocks;
 *      `review` asks; `notice` informs and never interrupts.
 *   2. Independent verification (FR-SAFE-03). A stop cannot be cleared by the
 *      person who triggered it. Someone else has to look.
 *   3. Preservation (FR-SAFE-04). The alert, its evidence, who raised it, who
 *      reviewed it and why it was overridden all survive the resolution.
 */
import type { Patient, Medication, Condition } from "@/lib/api";

export type AlertTier = "stop" | "review" | "notice";

export type SafetyFinding = {
  /** Stable within a patient, so the same conflict is one alert, not many. */
  key: string;
  kind: "allergy_conflict" | "duplicate_therapy" | "supply_gap" | "monitoring_gap";
  tier: AlertTier;
  title: string;
  detail: string;
  /** What the rule actually read, shown to the reviewer rather than summarised. */
  evidence: string[];
};

/**
 * Drug families, kept deliberately small and explicit.
 *
 * A real deployment licenses a maintained interaction database; inventing a
 * larger table here would look more capable and be less honest, because none
 * of it would be clinically governed. These are the classes the seeded cohort
 * is actually on.
 */
const ALLERGY_MAP: { allergen: string; matches: RegExp; why: string }[] = [
  {
    allergen: "Penicillin",
    matches: /amoxicillin|ampicillin|penicillin|co-amoxiclav|flucloxacillin/i,
    why: "beta-lactam antibiotic",
  },
  {
    allergen: "Sulfa drugs",
    matches: /co-trimoxazole|sulfamethoxazole|sulfasalazine|glibenclamide|gliclazide/i,
    why: "sulfonamide-derived",
  },
  { allergen: "Aspirin", matches: /aspirin|acetylsalicylic/i, why: "salicylate" },
  {
    allergen: "NSAIDs",
    matches: /ibuprofen|diclofenac|naproxen|indometacin|aspirin/i,
    why: "non-steroidal anti-inflammatory",
  },
  { allergen: "Codeine", matches: /codeine|dihydrocodeine|tramadol/i, why: "opioid" },
];

/** Same-class pairs where two live prescriptions are a duplicate, not a regimen. */
const THERAPY_CLASSES: { label: string; matches: RegExp }[] = [
  { label: "ACE inhibitor", matches: /lisinopril|enalapril|ramipril|captopril|perindopril/i },
  { label: "ARB", matches: /losartan|valsartan|irbesartan|candesartan|telmisartan/i },
  { label: "calcium channel blocker", matches: /amlodipine|nifedipine|felodipine|diltiazem/i },
  { label: "biguanide", matches: /metformin/i },
  { label: "sulfonylurea", matches: /gliclazide|glibenclamide|glimepiride/i },
  { label: "statin", matches: /atorvastatin|simvastatin|rosuvastatin|pravastatin/i },
  { label: "thiazide diuretic", matches: /hydrochlorothiazide|bendroflumethiazide|indapamide/i },
];

export function evaluateSafety(
  patient: Patient,
  medications: Medication[],
  conditions: Condition[],
): SafetyFinding[] {
  const findings: SafetyFinding[] = [];
  const allergies = patient.allergies ?? [];

  // 1. Allergy conflict — the highest-harm thing this data can express.
  for (const med of medications) {
    for (const rule of ALLERGY_MAP) {
      if (!allergies.includes(rule.allergen)) continue;
      if (!rule.matches.test(med.name)) continue;
      findings.push({
        key: `allergy:${med.id}:${rule.allergen}`,
        kind: "allergy_conflict",
        tier: "stop",
        title: `${med.name} conflicts with a recorded allergy`,
        detail: `${patient.full_name} is recorded as allergic to ${rule.allergen}. ${med.name} is a ${rule.why}. This must be reviewed by someone other than the clinician who raised it before the medication is continued.`,
        evidence: [
          `Recorded allergy: ${rule.allergen}`,
          `Active medication: ${med.name} ${med.dosage} ${med.frequency}`,
          `Class: ${rule.why}`,
        ],
      });
    }
  }

  // 2. Duplicate therapy — two of the same class running at once.
  const byClass = new Map<string, Medication[]>();
  for (const med of medications) {
    for (const c of THERAPY_CLASSES) {
      if (!c.matches.test(med.name)) continue;
      byClass.set(c.label, [...(byClass.get(c.label) ?? []), med]);
    }
  }
  for (const [label, meds] of byClass) {
    if (meds.length < 2) continue;
    findings.push({
      key: `duplicate:${label}`,
      kind: "duplicate_therapy",
      tier: "review",
      title: `Two ${label}s prescribed together`,
      detail: `${meds.map((m) => m.name).join(" and ")} are both ${label}s. This is occasionally intended; more often it is two prescribers who could not see each other's record — the problem CareBridge exists to solve.`,
      evidence: meds.map((m) => `${m.name} ${m.dosage} ${m.frequency}`),
    });
  }

  // 3. Supply gap — a medication about to run out is a silent adherence failure.
  for (const med of medications) {
    if (med.days_supply_left > 3) continue;
    findings.push({
      key: `supply:${med.id}`,
      kind: "supply_gap",
      tier: med.days_supply_left <= 0 ? "review" : "notice",
      title:
        med.days_supply_left <= 0
          ? `${med.name} has run out`
          : `${med.name} runs out in ${med.days_supply_left} days`,
      detail: `Adherence is ${med.adherence_pct}%. A refill routed now avoids the gap; ${patient.parish} is ${patient.km_to_facility} km from the nearest facility.`,
      evidence: [`${med.name} ${med.dosage}`, `${med.days_supply_left} days of supply`],
    });
  }

  // 4. Monitoring gap — a diabetic with no glucose reading is not "stable".
  const diabetic = conditions.some((c) => /diabet/i.test(c.name));
  if (diabetic && medications.some((m) => /metformin|insulin|gliclazide/i.test(m.name))) {
    findings.push({
      key: "monitoring:glucose",
      kind: "monitoring_gap",
      tier: "notice",
      title: "Diabetes on treatment — confirm glucose monitoring",
      detail:
        "Treated diabetes needs a current glucose trend before a dose decision. Check the readings on the Trends tab are recent enough to act on.",
      evidence: conditions.filter((c) => /diabet/i.test(c.name)).map((c) => c.name),
    });
  }

  const order: Record<AlertTier, number> = { stop: 0, review: 1, notice: 2 };
  return findings.sort((a, b) => order[a.tier] - order[b.tier]);
}

export const TIER_COPY: Record<AlertTier, { label: string; blurb: string }> = {
  stop: {
    label: "Stop",
    blurb: "Blocks the action. Cleared only by a second clinician.",
  },
  review: { label: "Review", blurb: "Asks for a decision before continuing." },
  notice: { label: "Notice", blurb: "Informational — never interrupts." },
};
