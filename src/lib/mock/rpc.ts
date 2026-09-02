import { getTable } from "./db";

type Row = Record<string, unknown>;

const nowMs = () => Date.now();
const ageMs = (iso: string) => nowMs() - new Date(iso).getTime();
const DAY = 86400000;

function avgNum(rows: Row[], key: string): number | null {
  const vals = rows.map((r) => r[key]).filter((v): v is number => typeof v === "number");
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/** JS port of the `compute_risk(p_patient)` Postgres function in the migrations. */
function computeRisk(patientId: string) {
  const patient = getTable("patients").find((p) => p.id === patientId);
  const age = (patient?.age as number) ?? 50;
  const km = (patient?.km_to_facility as number) ?? 5;
  const conds = getTable("conditions").filter((c) => c.patient_id === patientId);
  const meds = getTable("medications").filter((m) => m.patient_id === patientId);
  const vitals = getTable("vitals").filter((v) => v.patient_id === patientId);

  const recent = vitals.filter((v) => ageMs(v.measured_at as string) <= 14 * DAY);
  const prevWindow = vitals.filter((v) => {
    const a = ageMs(v.measured_at as string);
    return a > 14 * DAY && a <= 28 * DAY;
  });

  const avgSys = avgNum(recent, "systolic") ?? 120;
  const avgGlu = avgNum(recent, "glucose_mmol") ?? 5.5;
  const prevSys = avgNum(prevWindow, "systolic") ?? avgSys;
  const avgAdh = avgNum(meds, "adherence_pct") ?? 100;

  const sBp = Math.min(32, Math.max(0, (avgSys - 120) * 0.95));
  const sGlu = Math.min(20, Math.max(0, (avgGlu - 6.0) * 6));
  const sAdh = Math.min(18, Math.max(0, (100 - avgAdh) * 0.28));
  const sAge = Math.min(12, Math.max(0, (age - 40) * 0.3));
  const sCond = Math.min(12, conds.length * 4);
  const sAcc = Math.min(6, km * 0.12);
  const total = Math.round(sBp + sGlu + sAdh + sAge + sCond + sAcc);

  const band = total >= 68 ? "critical" : total >= 50 ? "high" : total >= 32 ? "moderate" : "low";
  const trend = avgSys - prevSys > 4 ? "rising" : prevSys - avgSys > 4 ? "improving" : "stable";
  const drivers = [
    { label: `Blood pressure (14d avg ${Math.round(avgSys)} mmHg)`, points: Math.round(sBp) },
    { label: `Glucose (14d avg ${avgGlu.toFixed(1)} mmol/L)`, points: Math.round(sGlu) },
    { label: `Medication adherence ${Math.round(avgAdh)}%`, points: Math.round(sAdh) },
    { label: `Age ${age}`, points: Math.round(sAge) },
    { label: `${conds.length} chronic condition(s)`, points: Math.round(sCond) },
    { label: `Distance to care ${km} km`, points: Math.round(sAcc) },
  ];
  return [{ score: total, band, trend, drivers }];
}

/** JS port of the `detect_trend(p_patient)` Postgres function in the migrations. */
function detectTrend(patientId: string) {
  const vitals = getTable("vitals").filter((v) => v.patient_id === patientId);
  const meds = getTable("medications").filter((m) => m.patient_id === patientId);

  const recentSys = avgNum(vitals.filter((v) => ageMs(v.measured_at as string) <= 10 * DAY), "systolic");
  const baseSys = avgNum(
    vitals.filter((v) => {
      const a = ageMs(v.measured_at as string);
      return a > 10 * DAY && a <= 40 * DAY;
    }),
    "systolic",
  );
  const recentGlu = avgNum(vitals.filter((v) => ageMs(v.measured_at as string) <= 10 * DAY), "glucose_mmol");
  const baseGlu = avgNum(
    vitals.filter((v) => {
      const a = ageMs(v.measured_at as string);
      return a > 10 * DAY && a <= 40 * DAY;
    }),
    "glucose_mmol",
  );
  const supplyLeft = meds.length ? Math.min(...meds.map((m) => (m.days_supply_left as number) ?? 30)) : null;
  const adherence = avgNum(meds, "adherence_pct");

  const rows: Row[] = [];
  if (recentSys != null && baseSys != null && recentSys - baseSys > 6) {
    rows.push({
      metric: "systolic_bp",
      current_value: Math.round(recentSys),
      baseline_value: Math.round(baseSys),
      delta_pct: Number((((recentSys - baseSys) / baseSys) * 100).toFixed(1)),
      severity: recentSys >= 160 ? "urgent" : recentSys >= 145 ? "elevated" : "watch",
      narrative: `Blood pressure has climbed from ${Math.round(baseSys)} to ${Math.round(recentSys)} mmHg over the last 10 days.`,
      recommended_action: recentSys >= 160 ? "Call today; consider same-week teleconsult and medication review." : "Send a home-reading request and review adherence.",
    });
  }
  if (recentGlu != null && baseGlu != null && recentGlu - baseGlu > 0.7) {
    rows.push({
      metric: "glucose",
      current_value: Number(recentGlu.toFixed(1)),
      baseline_value: Number(baseGlu.toFixed(1)),
      delta_pct: Number((((recentGlu - baseGlu) / baseGlu) * 100).toFixed(1)),
      severity: recentGlu >= 11 ? "urgent" : recentGlu >= 8.5 ? "elevated" : "watch",
      narrative: `Average glucose has risen from ${baseGlu.toFixed(1)} to ${recentGlu.toFixed(1)} mmol/L.`,
      recommended_action: "Review diet, medication timing and dose; book a nurse check-in.",
    });
  }
  if (supplyLeft != null && supplyLeft <= 7) {
    rows.push({
      metric: "medication_supply",
      current_value: supplyLeft,
      baseline_value: 30,
      delta_pct: null,
      severity: supplyLeft <= 2 ? "urgent" : "elevated",
      narrative: `Only ${supplyLeft} days of medication left on at least one prescription.`,
      recommended_action: "Trigger a refill reminder and confirm stock at the nearest facility.",
    });
  }
  if (adherence != null && adherence < 70) {
    rows.push({
      metric: "adherence",
      current_value: Math.round(adherence),
      baseline_value: 100,
      delta_pct: Number((adherence - 100).toFixed(1)),
      severity: adherence < 55 ? "urgent" : "elevated",
      narrative: `Medication adherence is averaging ${Math.round(adherence)}%.`,
      recommended_action: "Enrol in the daily reminder track and check for cost or access barriers.",
    });
  }
  return rows;
}

export function mockRpc(fn: string, args: Record<string, unknown>): { data: unknown; error: { message: string } | null } {
  try {
    const patientId = (args?.p_patient as string) ?? "";
    if (fn === "compute_risk") return { data: computeRisk(patientId), error: null };
    if (fn === "detect_trend") return { data: detectTrend(patientId), error: null };
    return { data: null, error: { message: `Unknown RPC ${fn}` } };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
  }
}
