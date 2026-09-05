// The pre-consult brief agent.
//
// What a good registrar does in the five minutes before a clinic list: read the
// chart, work out what actually changed, notice what the numbers alone don't say,
// and arrive with an agenda and a short list of things only the patient can
// answer. That is the job this agent does, and nothing more.
//
// Deterministic by design — see ./core.ts for why.

import type {
  Condition,
  ConsentGrant,
  Medication,
  Message,
  Patient,
  Referral,
  RiskScore,
  Vital,
} from "@/lib/api";
import { isGrantActive } from "@/lib/access";
import { getAdapter } from "./model";
import {
  AGENT_DISCLAIMER,
  denyTool,
  runTool,
  sortFindings,
  type AgentRun,
  type Finding,
  type ToolCall,
} from "./core";

export interface ClinicianAgentInput {
  patient: Patient;
  vitals: Vital[];
  medications: Medication[];
  conditions: Condition[];
  messages: Message[];
  risk: RiskScore | null;
  referrals: Referral[];
  grants: ConsentGrant[];
  /** The clinician the brief is being prepared for. */
  actor: { name: string; island: string | null };
  /** Specialties available in the patient's own country. */
  localSpecialties: string[];
  islandTier?: string | undefined;
}

const DAY = 86400000;

/** "an Endocrinology-level picture", not "a Endocrinology-level picture". */
function article(word: string) {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

function mean(values: number[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

function windowed(vitals: Vital[], fromDaysAgo: number, toDaysAgo: number) {
  const now = Date.now();
  return vitals.filter((v) => {
    const age = now - new Date(v.measured_at).getTime();
    return age >= toDaysAgo * DAY && age < fromDaysAgo * DAY;
  });
}

export async function runClinicianBrief(input: ClinicianAgentInput): Promise<AgentRun> {
  const started = performance.now();
  const trace: ToolCall[] = [];
  const findings: Finding[] = [];
  const agenda: string[] = [];
  const openQuestions: string[] = [];
  const redactions: string[] = [];

  const { patient, vitals, medications, conditions, messages, risk, referrals, grants } = input;

  // ---- consent gate -------------------------------------------------------
  // The agent inherits the clinician's permissions; it is not a way around
  // them. A category the clinician cannot open is a category the agent never
  // receives, and the brief says so rather than quietly looking complete.
  const sensitiveConditions = conditions.filter(
    (c) =>
      (c as { sensitivity?: string }).sensitivity &&
      (c as { sensitivity?: string }).sensitivity !== "standard",
  );
  const grantedCategories = new Set(
    grants.filter((g) => isGrantActive(g.status)).flatMap((g) => g.scope),
  );

  for (const c of sensitiveConditions) {
    const category = (c as { sensitivity?: string }).sensitivity ?? "restricted";
    if (!grantedCategories.has(category)) {
      denyTool(trace, {
        tool: "read_condition",
        args: { patient: patient.id, category },
        reason: `No active grant for the ${category.replace("_", " ")} category`,
      });
      redactions.push(
        `A ${category.replace("_", " ")} entry exists on this record and was withheld. Request access or use break-glass if clinically necessary.`,
      );
    }
  }

  const visibleConditions = conditions.filter((c) => {
    const s = (c as { sensitivity?: string }).sensitivity;
    return !s || s === "standard" || grantedCategories.has(s);
  });

  runTool(trace, { tool: "read_conditions", args: { patient: patient.id } }, () => ({
    value: visibleConditions,
    summary: visibleConditions.length
      ? `Read ${visibleConditions.length} condition(s): ${visibleConditions.map((c) => c.name).join(", ")}`
      : "No conditions visible on this record",
    count: visibleConditions.length,
  }));

  // ---- vitals trend -------------------------------------------------------
  const recent = runTool(
    trace,
    { tool: "read_vitals", args: { patient: patient.id, window: "10d" } },
    () => {
      const rows = windowed(vitals, 10, 0);
      return {
        value: rows,
        summary: `Read ${rows.length} reading(s) from the last 10 days`,
        count: rows.length,
      };
    },
  );
  const baseline = runTool(
    trace,
    { tool: "read_vitals", args: { patient: patient.id, window: "10-40d" } },
    () => {
      const rows = windowed(vitals, 40, 10);
      return {
        value: rows,
        summary: `Read ${rows.length} reading(s) from the prior 30 days as a baseline`,
        count: rows.length,
      };
    },
  );

  const recentSys = mean(recent.map((v) => v.systolic as number));
  const baseSys = mean(baseline.map((v) => v.systolic as number));
  const recentGlu = mean(recent.map((v) => v.glucose_mmol as number));
  const baseGlu = mean(baseline.map((v) => v.glucose_mmol as number));

  const homeReadings = recent.filter((v) => v.source === "home");

  if (recentSys !== null && baseSys !== null && recentSys - baseSys > 6) {
    findings.push({
      severity: recentSys >= 180 ? "critical" : recentSys >= 160 ? "high" : "moderate",
      title: `Blood pressure rising — ${Math.round(baseSys)} → ${Math.round(recentSys)} mmHg`,
      detail:
        recentSys >= 180
          ? "In hypertensive-crisis range on the current average, not a single outlier reading."
          : "A sustained upward shift against this patient's own baseline, not a population threshold.",
      evidence: [
        `Last 10 days: mean systolic ${Math.round(recentSys)} mmHg across ${recent.length} readings`,
        `Prior 30 days: mean systolic ${Math.round(baseSys)} mmHg across ${baseline.length} readings`,
        homeReadings.length
          ? `${homeReadings.length} of the recent readings were self-reported from home`
          : "All readings clinic-captured",
      ],
      sourceTool: "read_vitals",
    });
  }

  if (recentGlu !== null && baseGlu !== null && recentGlu - baseGlu > 0.7) {
    findings.push({
      severity: recentGlu >= 11 ? "high" : "moderate",
      title: `Glycaemic control loosening — ${baseGlu.toFixed(1)} → ${recentGlu.toFixed(1)} mmol/L`,
      detail: "Average glucose has moved up against this patient's own recent baseline.",
      evidence: [
        `Last 10 days: mean ${recentGlu.toFixed(1)} mmol/L`,
        `Prior 30 days: mean ${baseGlu.toFixed(1)} mmol/L`,
      ],
      sourceTool: "read_vitals",
    });
  }

  // ---- medications --------------------------------------------------------
  const meds = runTool(trace, { tool: "read_medications", args: { patient: patient.id } }, () => ({
    value: medications,
    summary: medications.length
      ? `Read ${medications.length} active medication(s)`
      : "No active medications on the record",
    count: medications.length,
  }));

  const poorAdherence = meds.filter((m) => m.adherence_pct < 70);
  const runningOut = meds.filter((m) => m.days_supply_left <= 7);

  if (runningOut.length) {
    findings.push({
      severity: runningOut.some((m) => m.days_supply_left <= 0) ? "high" : "moderate",
      title: `Out of, or about to run out of, ${runningOut.length} medication(s)`,
      detail:
        "Supply, not dose, is the immediate problem. Escalating a dose the patient cannot fill will not help.",
      evidence: runningOut.map(
        (m) =>
          `${m.name} ${m.dosage} — ${m.days_supply_left} day(s) left, last filled ${m.last_refill_on ?? "unknown"}`,
      ),
      sourceTool: "read_medications",
    });
  }

  if (poorAdherence.length) {
    findings.push({
      severity: "moderate",
      title: `Adherence below 70% on ${poorAdherence.length} medication(s)`,
      detail: "Worth separating from treatment failure before any change to the regimen.",
      evidence: poorAdherence.map((m) => `${m.name} — ${m.adherence_pct}% adherence`),
      sourceTool: "read_medications",
    });
  }

  // The clinically important synthesis: a rising trend on top of missed doses
  // is usually an access or tolerance problem, not an under-treated one. Doses
  // get escalated on this picture all the time, and it is the wrong move.
  if (
    recentSys !== null &&
    baseSys !== null &&
    recentSys - baseSys > 6 &&
    (poorAdherence.length || runningOut.length)
  ) {
    findings.push({
      severity: "high",
      title: "Rising pressure coincides with missed doses — treat as adherence first",
      detail:
        "The trend and the supply gap overlap in time. Establish whether the medicine was actually taken before reading this as treatment failure and increasing the dose.",
      evidence: [
        `Systolic up ${Math.round(recentSys - baseSys)} mmHg over the same period`,
        ...poorAdherence.map((m) => `${m.name} at ${m.adherence_pct}% adherence`),
        ...runningOut.map(
          (m) =>
            `${m.name} supply exhausted ${m.days_supply_left <= 0 ? "already" : `in ${m.days_supply_left} days`}`,
        ),
      ],
      sourceTool: "read_medications + read_vitals",
    });
    openQuestions.push(
      "Has the patient actually been taking the medication — and if not, is it cost, access, side effects, or understanding?",
    );
  }

  // ---- patient's own words ------------------------------------------------
  const inbound = runTool(
    trace,
    { tool: "read_messages", args: { patient: patient.id, direction: "in" } },
    () => {
      const rows = messages.filter((m) => m.direction === "in").slice(-3);
      return {
        value: rows,
        summary: `Read the patient's last ${rows.length} inbound message(s)`,
        count: rows.length,
      };
    },
  );

  if (inbound.length) {
    findings.push({
      severity: "info",
      title: "What the patient reported themselves",
      detail: "Verbatim from the care line, in their own language variety.",
      evidence: inbound.map((m) => `"${m.body}" — ${new Date(m.created_at).toLocaleDateString()}`),
      sourceTool: "read_messages",
    });
  }

  // ---- risk ---------------------------------------------------------------
  if (risk) {
    runTool(trace, { tool: "compute_risk", args: { patient: patient.id } }, () => ({
      value: risk,
      summary: `Risk ${risk.score}/100 (${risk.band}, ${risk.trend})`,
      count: 1,
    }));
    if (risk.band === "critical" || risk.band === "high") {
      findings.push({
        severity: risk.band === "critical" ? "critical" : "high",
        title: `Composite risk ${risk.score}/100 — ${risk.band}, ${risk.trend}`,
        detail: "Driver breakdown, heaviest first.",
        evidence: (risk.drivers ?? [])
          .slice()
          .sort((a, b) => b.points - a.points)
          .slice(0, 4)
          .map((d) => `${d.label} — ${d.points} points`),
        sourceTool: "compute_risk",
      });
    }
  }

  // ---- care gap and access ------------------------------------------------
  const open = runTool(trace, { tool: "read_referrals", args: { patient: patient.id } }, () => ({
    value: referrals.filter((r) => r.status !== "completed"),
    summary: `Read ${referrals.length} referral(s), ${referrals.filter((r) => r.status !== "completed").length} still open`,
    count: referrals.length,
  }));

  const needsSpecialist = findings.some((f) => f.severity === "critical" || f.severity === "high");
  const impliedSpecialty = visibleConditions.some((c) => /hypertens|heart|cardio/i.test(c.name))
    ? "Cardiology"
    : visibleConditions.some((c) => /diabet/i.test(c.name))
      ? "Endocrinology"
      : "Internal Medicine";

  if (needsSpecialist && !open.length) {
    const hasLocal = input.localSpecialties.includes(impliedSpecialty);
    findings.push({
      severity: "high",
      title: `No open referral despite ${article(impliedSpecialty)} ${impliedSpecialty}-level picture`,
      detail: hasLocal
        ? `${impliedSpecialty} exists in ${patient.island_code}; this looks like a care gap rather than a capacity problem.`
        : `There is no ${impliedSpecialty} anywhere in ${patient.island_code}. Any referral is cross-border and needs a consent grant before the record can travel.`,
      evidence: [
        `Country: ${patient.island_code}${input.islandTier === "under_resourced" ? " (under-resourced)" : ""}`,
        hasLocal
          ? `${impliedSpecialty} available locally`
          : `No local ${impliedSpecialty} — cross-border routing required`,
      ],
      sourceTool: "read_referrals",
    });
    if (!hasLocal) {
      agenda.push(
        `Raise a cross-border ${impliedSpecialty} referral and obtain the patient's consent grant first`,
      );
      openQuestions.push(
        `Is the patient able to attend a teleconsult, given ${patient.island_code} connectivity and cost?`,
      );
    } else {
      agenda.push(`Raise a local ${impliedSpecialty} referral`);
    }
  }

  // ---- agenda -------------------------------------------------------------
  // Taken through the model seam. The findings above are grounded arithmetic
  // and stay that way; only the ordering of what to raise is a narration task.
  const referralLine = agenda.length ? agenda[agenda.length - 1]! : null;
  const { value: narrated, degraded: agendaDegraded } = await getAdapter().narrateAgenda({
    signals: {
      runningOutNames: runningOut.map((m) => m.name),
      recentSystolic: recentSys,
      recentGlucose: recentGlu,
      poorAdherenceCount: poorAdherence.length,
      redactionCount: redactions.length,
      referralLine,
    },
  });
  agenda.length = 0;
  agenda.push(...narrated);
  void agendaDegraded;

  // ---- confidence ---------------------------------------------------------
  // Reflects how much record there was to read, not how right the reasoning is.
  const dataPoints = recent.length + baseline.length + meds.length + inbound.length;
  /**
   * A withheld section lowers this, because a brief assembled from a partial
   * record deserves less trust than one assembled from a whole one. The
   * confidence reason already said a section was withheld while the number
   * itself never moved — which is the same class of quiet dishonesty the
   * intake agent had, where the penalty was applied before the upper clamp and
   * so never showed. Clamp first, subtract second, floor last.
   */
  const completeness = Math.min(0.95, dataPoints / 40);
  const confidence = Math.max(
    0.2,
    Math.round((completeness - redactions.length * 0.05) * 100) / 100,
  );
  const gaps: string[] = [];
  if (recent.length < 3) gaps.push("few recent readings");
  if (!baseline.length) gaps.push("no baseline period");
  if (!meds.length) gaps.push("no medication record");
  if (redactions.length) gaps.push("a restricted section was withheld");

  if (!recent.length) {
    openQuestions.push(
      "No readings in the last 10 days — is the patient still sending them, and is the channel working?",
    );
  }

  return {
    agent: "Pre-consult brief",
    model: getAdapter().id,
    patientId: patient.id,
    patientName: patient.full_name,
    startedAt: new Date().toISOString(),
    ms: Math.round((performance.now() - started) * 10) / 10,
    toolCalls: trace,
    findings: sortFindings(findings),
    agenda,
    openQuestions,
    confidence,
    confidenceReason: gaps.length
      ? `Based on ${dataPoints} data points; limited by ${gaps.join(", ")}.`
      : `Based on ${dataPoints} data points across vitals, medications and the care line.`,
    redactions,
    disclaimer: AGENT_DISCLAIMER,
  };
}
