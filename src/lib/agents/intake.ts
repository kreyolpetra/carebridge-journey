/**
 * The intake agent — one of three built.
 *
 * The product plan named seven; three exist, and this comment used to imply
 * the rest did too. The built ones are intake triage, the pre-consult brief
 * and Ask. Naming that here rather than in a pitch means a reader who opens
 * the folder and counts is not discovering a gap the code was hiding.
 *
 * A message arrives from a patient on WhatsApp. Something has to read it,
 * decide how urgent it is, gather the record around it, and hand a clinician a
 * recommendation they can accept or throw out.
 *
 * READ THE HONESTY NOTE IN core.ts. This calls no language model. The reading
 * step is the same deterministic rule set the care line has always used; what
 * is new is that the run is now *observable* — the tools it called, the reads
 * consent refused, the values behind each finding, the confidence and why, and
 * a clinician's approval before anything happens.
 *
 * That pipeline is the part worth building. Swapping the rules for a model is a
 * config change behind the same AgentRun contract: the trace, the refusals and
 * the approval gate do not move.
 */
import type { AgentRun, Finding, ToolCall } from "./core";
import { AGENT_DISCLAIMER, denyTool, runTool, sortFindings } from "./core";
import type { PatientContext, TriageResult } from "../triage.server";
import { getAdapter } from "./model";
import type { Condition, Medication, Patient, Vital } from "../api";
import { isSensitive, SENSITIVE_LABEL } from "../sensitivity";

export type IntakeInput = {
  patient: Patient;
  message: string;
  vitals: Vital[];
  medications: Medication[];
  conditions: Condition[];
  /** Sensitive categories the patient has granted. Anything else is refused. */
  grantedCategories: Set<string>;
};

const SEVERITY_TO_FINDING: Record<string, Finding["severity"]> = {
  emergency: "critical",
  urgent: "high",
  routine: "moderate",
  info: "info",
};

export async function runIntakeAgent(
  input: IntakeInput,
): Promise<{ run: AgentRun; triage: TriageResult }> {
  const started = performance.now();
  const trace: ToolCall[] = [];
  const { patient, message, vitals, medications, conditions, grantedCategories } = input;

  // 1. The message itself.
  const words = runTool(
    trace,
    { tool: "read_message", args: { patient_id: patient.id, channel: "whatsapp" } },
    () => ({
      value: message.trim().split(/\s+/).length,
      summary: `Read the inbound message in ${patient.language === "jam" ? "Jamaican Patois" : patient.language === "ht" ? "Haitian Kreyòl" : patient.language === "es" ? "Spanish" : "English"}`,
      count: 1,
    }),
  );

  // 2. Recent readings, which is what turns a complaint into a trend.
  const recent = runTool(
    trace,
    { tool: "read_vitals", args: { patient_id: patient.id, window_days: 14 } },
    () => {
      const cutoff = Date.now() - 14 * 86400000;
      const rows = vitals.filter((v) => new Date(v.measured_at).getTime() >= cutoff);
      return {
        value: rows,
        summary: rows.length
          ? `${rows.length} readings in the last 14 days`
          : "No readings in the last 14 days",
        count: rows.length,
      };
    },
  );

  const meds = runTool(
    trace,
    { tool: "read_medications", args: { patient_id: patient.id } },
    () => ({
      value: medications,
      summary: `${medications.length} active medication(s)`,
      count: medications.length,
    }),
  );

  // 3. Conditions, minus anything the patient has not opened up. The refusal is
  //    recorded rather than quietly skipped — an agent that cannot say what it
  //    was denied cannot be audited.
  const readable = conditions.filter(
    (c) => !isSensitive((c as { sensitivity?: string }).sensitivity),
  );
  const withheld = conditions.filter((c) => {
    const s = (c as { sensitivity?: string }).sensitivity;
    return isSensitive(s) && !grantedCategories.has(s ?? "");
  });

  const openConditions = runTool(
    trace,
    { tool: "read_conditions", args: { patient_id: patient.id, sensitivity: "standard" } },
    () => ({
      value: readable,
      summary: `${readable.length} condition(s) on file`,
      count: readable.length,
    }),
  );

  for (const c of withheld) {
    const category = (c as { sensitivity?: string }).sensitivity ?? "sensitive";
    denyTool(trace, {
      tool: "read_conditions",
      args: { patient_id: patient.id, sensitivity: category },
      reason: `${SENSITIVE_LABEL[category] ?? category} needs the patient's explicit grant, which is not active. The agent reasoned without it.`,
    });
  }

  // 4. The reading step.
  const context: PatientContext = {
    name: patient.full_name,
    age: patient.age,
    sex: patient.sex,
    island: patient.island_code,
    parish: patient.parish,
    language: patient.language,
    rural: patient.rural,
    kmToFacility: patient.km_to_facility,
    conditions: openConditions.map((c) => c.name),
    medications: meds.map((m) => ({
      name: m.name,
      dosage: m.dosage,
      adherence: m.adherence_pct,
      daysLeft: m.days_supply_left,
    })),
    recentVitals: recent.slice(0, 8).map((v) => ({
      measured_at: v.measured_at,
      systolic: v.systolic,
      diastolic: v.diastolic,
      glucose: v.glucose_mmol,
    })),
  };
  // The judgement, taken through the model seam — see ./model.ts. Everything
  // above it is tool calls and consent filtering, and stays deterministic
  // whichever adapter is live.
  const { value: triage } = await getAdapter().triage({ context, message });

  const findings: Finding[] = [
    {
      severity: SEVERITY_TO_FINDING[triage.severity] ?? "info",
      title: triage.category,
      detail: triage.rationale,
      evidence: triage.red_flags.length
        ? triage.red_flags
        : [`${words} words read`, `${recent.length} readings in 14 days`],
      sourceTool: "read_message",
    },
  ];

  const latest = recent[0];
  if (latest?.systolic && latest.systolic >= 140) {
    findings.push({
      severity: latest.systolic >= 180 ? "critical" : "high",
      title: "Blood pressure above target",
      detail: `Most recent home reading ${latest.systolic}/${latest.diastolic ?? "—"} mmHg.`,
      evidence: [`${latest.systolic}/${latest.diastolic ?? "—"} mmHg`, latest.measured_at],
      sourceTool: "read_vitals",
    });
  }

  const short = meds.filter((m) => m.days_supply_left <= 3);
  for (const m of short) {
    findings.push({
      severity: m.days_supply_left <= 0 ? "high" : "moderate",
      title: `${m.name} supply is out or nearly out`,
      detail: `${m.days_supply_left} days left at ${m.adherence_pct}% adherence. A gap here undoes the rest of the plan.`,
      evidence: [`${m.name} ${m.dosage}`, `${m.days_supply_left} days of supply`],
      sourceTool: "read_medications",
    });
  }

  // 5. Confidence is about how much record it had, never about being right.
  const completeness =
    (recent.length ? 0.4 : 0) + (meds.length ? 0.3 : 0) + (openConditions.length ? 0.3 : 0);
  // Clamp to the ceiling *first*, then take the penalty off. Doing it the other
  // way round hid the penalty entirely whenever the record was complete: a full
  // record scores 1.0, one refusal takes it to 0.95, and the ceiling was also
  // 0.95 — so a withheld category and no withheld category reported identical
  // confidence. The evaluation suite caught this on its first run.
  const confidence = Math.max(0.25, Math.min(0.95, completeness) - withheld.length * 0.05);

  const run: AgentRun = {
    agent: "Intake agent",
    // Never a model name unless a model ran.
    model: getAdapter().id,
    patientId: patient.id,
    patientName: patient.full_name,
    startedAt: new Date().toISOString(),
    ms: Math.max(1, Math.round(performance.now() - started)),
    toolCalls: trace,
    findings: sortFindings(findings),
    agenda: [
      `Route to: ${triage.recommended_level.replace(/_/g, " ")}`,
      ...(short.length ? [`Arrange a refill for ${short.map((m) => m.name).join(", ")}`] : []),
      ...(triage.severity === "emergency" || triage.severity === "urgent"
        ? ["Contact the patient today rather than waiting for the next clinic"]
        : ["Reply on the care line and confirm the next check-in"]),
    ],
    openQuestions: [
      ...(withheld.length
        ? [
            `The record holds ${withheld.length} restricted entr${withheld.length === 1 ? "y" : "ies"} the agent could not read. Ask the patient before ruling anything out.`,
          ]
        : []),
      ...(recent.length === 0
        ? ["No home readings in 14 days — the urgency rests on the message alone."]
        : []),
    ],
    confidence,
    confidenceReason: `Based on how much of the record was readable: ${recent.length} readings, ${meds.length} medications, ${openConditions.length} conditions${withheld.length ? `, and ${withheld.length} entr${withheld.length === 1 ? "y" : "ies"} refused by consent` : ""}. It does not express confidence in the clinical judgement.`,
    redactions: withheld.map(
      (c) =>
        `A ${SENSITIVE_LABEL[(c as { sensitivity?: string }).sensitivity ?? ""] ?? "restricted"} entry was withheld from the agent.`,
    ),
    disclaimer: AGENT_DISCLAIMER,
  };

  return { run, triage };
}
