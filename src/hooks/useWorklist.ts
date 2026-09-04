/**
 * The worklist: who needs something done about them today, and why.
 *
 * This is the distinction the product was missing. A clinician's *panel* is
 * everyone a lawful basis reaches — three hundred-odd people. Nobody sees
 * three hundred patients today. The worklist is the subset with a reason to
 * act now, and every row carries its reason, because "high risk" is a property
 * of a patient while "waiting on you since Tuesday" is a task.
 *
 * It lives in a hook because two surfaces show it — the home screen shows the
 * top of it, the Patients screen shows all of it — and a worklist that
 * disagreed with itself between two screens would be worse than none.
 *
 * Reasons are ordered by who is blocked. A referral nobody has accepted has a
 * person waiting at the other end; that beats a risk score which has been high
 * for a month.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  consultationsQuery,
  patientsQuery,
  referralsQuery,
  riskScoresQuery,
  workflowEventsQuery,
  type Patient,
  type RiskScore,
} from "@/lib/api";
import { detectionSignalsQuery } from "@/lib/prevention";
import { useAccessIndex, type AccessDecision } from "@/lib/access-basis";
import { useAuth } from "@/hooks/useAuth";
import { clockTime } from "@/lib/format";

export type WorklistItem = {
  patient: Patient;
  risk: RiskScore | null;
  decision: AccessDecision;
  reason: string;
  detail: string;
  /** 0 blocks someone else, 5 is routine. Also drives the pill colour. */
  rank: number;
};

/** Contact marks are per clinician, per day, and the latest mark wins. */
export function useContactedToday(): Set<string> {
  const { profile } = useAuth();
  const workflow = useQuery(workflowEventsQuery);
  return useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const decided = new Set<string>();
    const done = new Set<string>();
    for (const e of workflow.data ?? []) {
      if (e.action !== "patient_contacted" && e.action !== "patient_contact_cleared") continue;
      if (e.actor_id && profile?.id && e.actor_id !== profile.id) continue;
      if (new Date(e.created_at) < startOfDay) continue;
      if (decided.has(e.patient_id)) continue;
      decided.add(e.patient_id);
      if (e.action === "patient_contacted") done.add(e.patient_id);
    }
    return done;
  }, [workflow.data, profile]);
}

/**
 * Ranks 0-3 are today: someone is blocked, a reading just drifted, you are
 * seeing them, or they are critical. Ranks 4-5 are this week. Collapsing the
 * two into one number produced a worklist headline of 153, which is a caseload
 * wearing a worklist's clothes.
 */
/**
 * Colour by urgency, defined once because two screens render these rows.
 * Semantic, not decorative: red is act-now, amber is this-week.
 */
export function rankTone(rank: number): string {
  if (rank === 0) return "border-primary/40 bg-primary/10 text-primary";
  if (rank === 1) return "border-critical/40 bg-critical/10 text-critical";
  if (rank === 2) return "border-signal/40 bg-signal/10 text-signal";
  if (rank === 3) return "border-critical/40 bg-critical/10 text-critical";
  return "border-high/40 bg-high/10 text-high";
}

export function splitHorizon(items: WorklistItem[]) {
  return {
    today: items.filter((i) => i.rank <= 3),
    thisWeek: items.filter((i) => i.rank >= 4),
  };
}

export function useWorklist(): { items: WorklistItem[]; ready: boolean } {
  const { profile } = useAuth();
  const patients = useQuery(patientsQuery);
  const risks = useQuery(riskScoresQuery);
  const referrals = useQuery(referralsQuery);
  const consultations = useQuery(consultationsQuery);
  const signals = useQuery(detectionSignalsQuery);
  const { index: access, ready: accessReady } = useAccessIndex();
  const contacted = useContactedToday();

  const items = useMemo(() => {
    if (!accessReady) return [];
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const pmap = new Map((patients.data ?? []).map((p) => [p.id, p] as const));
    const latestRisk = new Map<string, RiskScore>();
    for (const r of risks.data ?? []) {
      const prev = latestRisk.get(r.patient_id);
      if (!prev || new Date(r.computed_at) > new Date(prev.computed_at))
        latestRisk.set(r.patient_id, r);
    }

    const out = new Map<string, WorklistItem>();
    const add = (patientId: string, reason: string, detail: string, rank: number) => {
      const patient = pmap.get(patientId);
      if (!patient) return;
      const existing = out.get(patientId);
      if (existing && existing.rank <= rank) return;
      const d = access.decide(patientId);
      if (!d.allowed) return;
      out.set(patientId, {
        patient,
        risk: latestRisk.get(patientId) ?? null,
        decision: d,
        reason,
        detail,
        rank,
      });
    };

    // 1. Someone is waiting on you to accept a referral.
    for (const r of referrals.data ?? []) {
      if (r.to_provider_id !== profile?.provider_id) continue;
      if (r.status !== "routed") continue;
      const days = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000);
      add(
        r.patient_id,
        "Referral awaiting you",
        `${r.specialty}${r.cross_island ? ", cross-island" : ""} · routed ${days === 0 ? "today" : `${days}d ago`}`,
        0,
      );
    }

    // 2. A reading drifted. This is the one with a clock on it: the numbers
    //    moved this morning, whereas a risk score has been high for a month.
    //    Each signal already carries the action, so it is used verbatim rather
    //    than re-summarised.
    for (const sig of signals.data ?? []) {
      if (sig.status !== "open") continue;
      if (sig.severity !== "urgent" && sig.severity !== "elevated") continue;
      add(
        sig.patient_id,
        sig.severity === "urgent" ? "Reading drifted — act today" : "Reading drifted — this week",
        `${sig.narrative} → ${sig.recommended_action}`,
        sig.severity === "urgent" ? 1 : 4,
      );
    }

    // 3. You are seeing them today.
    for (const c of consultations.data ?? []) {
      if (c.provider_id !== profile?.provider_id) continue;
      if (c.status !== "scheduled") continue;
      const at = new Date(c.scheduled_at);
      if (at < startOfDay || at >= endOfDay) continue;
      add(
        c.patient_id,
        "Appointment today",
        `${c.kind === "teleconsult" ? "Teleconsult" : "Clinic"} at ${clockTime(c.scheduled_at)}`,
        2,
      );
    }

    // 4 and 5. Deterioration risk that has not been actioned yet.
    for (const [patientId, r] of latestRisk) {
      if (contacted.has(patientId)) continue;
      if (r.band === "critical")
        add(patientId, "Critical — contact today", `Risk ${r.score}, ${r.trend}`, 3);
      else if (r.band === "high")
        add(patientId, "High — contact this week", `Risk ${r.score}, ${r.trend}`, 5);
    }

    return [...out.values()].sort(
      (a, b) => a.rank - b.rank || (b.risk?.score ?? 0) - (a.risk?.score ?? 0),
    );
  }, [
    accessReady,
    access,
    patients.data,
    risks.data,
    referrals.data,
    consultations.data,
    signals.data,
    profile,
    contacted,
  ]);

  return { items, ready: accessReady };
}
