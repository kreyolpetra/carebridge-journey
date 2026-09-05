/**
 * The rules that answer a plain-language question, kept apart from the agent.
 *
 * This lives in its own file for one structural reason: the model adapter has
 * to hold a rules implementation, and the agent has to call the adapter. If
 * the rules stayed inside the agent the two would import each other. Splitting
 * them is also what makes the seam legible — this file is the thing a model
 * would replace, and nothing else in the agent changes when it does.
 */
import type { Island } from "@/lib/api";

export const SPECIALTIES = [
  "Cardiology",
  "Endocrinology",
  "Nephrology",
  "Internal Medicine",
  "General Practice",
  "Ophthalmology",
  "Psychiatry",
];

export type Intent =
  | { kind: "risk"; island?: string | undefined; band?: string | undefined }
  | { kind: "gap"; specialty?: string | undefined }
  | { kind: "supply"; island?: string | undefined }
  | { kind: "referrals" }
  | { kind: "country"; code: string }
  | { kind: "equity" }
  | { kind: "meds_out" };

export /** Resolve a free-text question to an intent. Replaceable by a model call. */
function classifyIntent(q: string, islands: Island[]): Intent | null {
  const s = q.toLowerCase().trim();
  if (s.length < 3) return null;

  const island = islands.find(
    (i) => s.includes(i.name.toLowerCase()) || new RegExp(`\\b${i.code.toLowerCase()}\\b`).test(s),
  );
  const specialty = SPECIALTIES.find((sp) => s.includes(sp.toLowerCase()));

  if (/\b(equit|fair|gap|unequal|disparit)/.test(s)) return { kind: "equity" };

  if (/\b(no|without|lack|missing|gap)\b/.test(s) && (specialty || /special/.test(s))) {
    return { kind: "gap", specialty };
  }

  // Plurals matter here: a trailing \b after "shortage" will not match
  // "shortages", which is how people actually phrase this.
  if (/\b(stock|shortages?|supplies|supply|stockouts?|out of stock|running low)\b/.test(s)) {
    return { kind: "supply", island: island?.code };
  }

  if (/\b(run(ning)? out|refill|days? (of )?(supply|medication)|out of medication)\b/.test(s)) {
    return { kind: "meds_out" };
  }

  if (/\b(referral|referred|booked|teleconsult|waiting)\b/.test(s)) return { kind: "referrals" };

  if (/\b(risk|critical|high[- ]risk|sickest|deteriorat|worst)\b/.test(s)) {
    const band = /critical/.test(s) ? "critical" : /high/.test(s) ? "high" : undefined;
    return { kind: "risk", island: island?.code, band };
  }

  if (island && s.split(/\s+/).length <= 4) return { kind: "country", code: island.code };

  return null;
}
