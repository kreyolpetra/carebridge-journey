import { z } from "zod";

export const TriageSchema = z.object({
  severity: z
    .enum(["emergency", "urgent", "routine", "self_care"])
    .describe("Clinical urgency of this message"),
  category: z
    .string()
    .describe(
      "Short clinical category, e.g. Hypertensive crisis, Glycaemic control, Medication refill",
    ),
  specialty_needed: z
    .string()
    .describe(
      "One of: Cardiology, Endocrinology, Nephrology, Internal Medicine, General Practice, Ophthalmology, Psychiatry",
    ),
  recommended_level: z
    .enum(["self_care", "community_nurse", "gp", "specialist", "emergency_transfer"])
    .describe("Level of care the patient should be routed to"),
  rationale: z.string().describe("Two sentences max, clinician-facing, cites the specific data"),
  red_flags: z.array(z.string()).describe("Concrete red flags detected, empty if none"),
  confidence: z.number().min(0).max(1),
  extracted: z.object({
    systolic: z.number().nullable(),
    diastolic: z.number().nullable(),
    glucose_mmol: z.number().nullable(),
    medication_out: z.boolean(),
  }),
  patient_reply: z
    .string()
    .describe(
      "Warm, plain-language reply of 2-4 short sentences written in the patient's own language variety. No medical jargon, no markdown.",
    ),
});

export type TriageResult = z.infer<typeof TriageSchema>;

export interface PatientContext {
  name: string;
  age: number;
  sex: string;
  island: string;
  parish: string;
  language: string;
  rural: boolean;
  kmToFacility: number;
  conditions: string[];
  medications: { name: string; dosage: string; adherence: number; daysLeft: number }[];
  recentVitals: {
    measured_at: string;
    systolic: number | null;
    diastolic: number | null;
    glucose: number | null;
  }[];
}

const LANGUAGE_GUIDE: Record<string, string> = {
  en: "Caribbean English. Warm and direct.",
  jam: "Jamaican Patois, as a Jamaican community health worker would text. Natural, respectful, not a caricature.",
  // Lesser Antillean Kwéyòl and Kreyòl ayisyen are separate languages with
  // separate orthographies. Collapsing them produces text that reads as broken
  // to both sets of speakers — and, worse, lets the router count a Kwéyòl
  // speaker as a language match for a Haitian patient.
  "fr-cr":
    "Lesser Antillean Kwéyòl as spoken in St. Lucia and Dominica, as a local health worker would text.",
  ht: "Haitian Kreyòl in standard Haitian orthography, as a Haitian community health worker would text. Plain and respectful, never a caricature of French.",
  fr: "Haitian French — formal but warm, for the minority who read French rather than Kreyòl.",
  es: "Caribbean Spanish, warm and clear.",
};

export function buildTriagePrompt(ctx: PatientContext, message: string) {
  const vitals = ctx.recentVitals
    .slice(0, 10)
    .map(
      (v) =>
        `${new Date(v.measured_at).toISOString().slice(0, 10)}: BP ${v.systolic ?? "-"}/${v.diastolic ?? "-"}, glucose ${v.glucose ?? "-"} mmol/L`,
    )
    .join("\n");

  const meds = ctx.medications
    .map((m) => `${m.name} ${m.dosage} — adherence ${m.adherence}%, ${m.daysLeft} days supply left`)
    .join("\n");

  return `PATIENT
${ctx.name}, ${ctx.age}${ctx.sex}, ${ctx.parish}, ${ctx.island}${ctx.rural ? " (rural)" : ""}, ${ctx.kmToFacility} km from the nearest facility.
Conditions: ${ctx.conditions.join(", ") || "none recorded"}
Medications:
${meds || "none recorded"}

RECENT HOME READINGS (most recent first)
${vitals || "none recorded"}

INBOUND MESSAGE (channel: WhatsApp, language: ${ctx.language})
"""${message}"""

Reply to the patient in: ${LANGUAGE_GUIDE[ctx.language] ?? LANGUAGE_GUIDE["en"]}`;
}

export const TRIAGE_SYSTEM = `You are the triage brain of CariCare Grid, a Caribbean chronic-disease coordination system serving Jamaica, Trinidad and Tobago, Barbados, Grenada, Saint Lucia, Saint Vincent, Dominica and Antigua.

Your job is to classify an inbound patient message against their longitudinal record and produce a routing decision plus a reply to the patient.

Rules:
- Weigh the message against the patient's own trend, not population averages. A reading that is normal for one patient may be a crisis trajectory for another.
- Systolic >= 180 or diastolic >= 120 with symptoms (headache, dizziness, visual change, chest pain, breathlessness) is a hypertensive emergency.
- Running out of antihypertensive or antidiabetic medication in a patient with a rising trend escalates urgency by one level.
- Glucose > 15 mmol/L with symptoms, or < 3.5 mmol/L, is urgent.
- Chest pain, one-sided weakness, slurred speech, or severe breathlessness are always emergency.
- Be conservative: island patients may be hours from care, so under-triage is more dangerous than over-triage.
- Never diagnose in the patient reply. Tell them plainly what is happening next and what to do right now.
- Never mention that you are an AI model.`;

export function ruleBasedTriage(ctx: PatientContext, message: string): TriageResult {
  const text = message.toLowerCase();
  const bpMatch = text.match(/(\d{2,3})\s*[/over]{1,4}\s*(\d{2,3})/);
  const latest = ctx.recentVitals[0];
  const systolic = bpMatch ? Number(bpMatch[1]) : (latest?.systolic ?? null);
  const diastolic = bpMatch ? Number(bpMatch[2]) : (latest?.diastolic ?? null);
  const symptomatic = /headache|dizz|blur|vision|chest|breath|weak|faint|swell/.test(text);
  const outOfMeds = /out of|finish|done|no more|last pill|cyaan get|run out|nuh have/.test(text);

  let severity: TriageResult["severity"] = "routine";
  let level: TriageResult["recommended_level"] = "gp";
  const flags: string[] = [];

  if (systolic && systolic >= 180) {
    flags.push(`Systolic ${systolic} mmHg`);
    severity = symptomatic ? "emergency" : "urgent";
    level = symptomatic ? "emergency_transfer" : "specialist";
  } else if (systolic && systolic >= 160) {
    severity = "urgent";
    level = "specialist";
    flags.push(`Systolic ${systolic} mmHg`);
  }
  if (symptomatic) flags.push("Symptomatic presentation");
  if (outOfMeds) flags.push("Out of medication");

  return {
    severity,
    category: systolic && systolic >= 160 ? "Hypertensive crisis risk" : "Chronic disease check-in",
    specialty_needed: ctx.conditions.includes("Hypertension") ? "Cardiology" : "General Practice",
    recommended_level: level,
    rationale: `Rule-based fallback: latest systolic ${systolic ?? "unknown"} mmHg with ${flags.length} red flag(s) against a ${ctx.conditions.join(" + ") || "chronic"} history.`,
    red_flags: flags,
    confidence: 0.55,
    extracted: {
      systolic,
      diastolic,
      glucose_mmol: null,
      medication_out: outOfMeds,
    },
    patient_reply:
      "Thank you for the message. We have your readings and a care team member is reviewing them now. Please rest, drink water, and do not take any extra tablets until we come back to you.",
  };
}
