/**
 * Whether someone has to bring this patient home, and whether they arranged it.
 *
 * A procedure done under sedation cannot end with the patient driving home, or
 * walking to a route taxi, or being alone in a house overnight. That is not a
 * courtesy — it is the condition on which the procedure is safe to do at all.
 * So when nobody has been arranged, one of two things happens on the day: the
 * list is cancelled, or it goes ahead and should not have.
 *
 * Both outcomes waste the scarcest thing a small island health service has.
 * A cancelled theatre slot is the same failure as the repeated blood test and
 * the impossible worklist — capacity burned for a reason somebody could have
 * fixed with a phone call two days earlier.
 *
 * This does NOT arrange transport. There is no bus in this file. It checks
 * that an arrangement exists, asks the patient on the care line if it does
 * not, and puts the ones still unanswered in front of a human while there is
 * still time to ring somebody.
 *
 * On what is stored: a name and a relationship, and nothing else. The cousin
 * driving the car is not our patient and has consented to nothing, so the
 * record holds the least that is useful — enough for the front desk to know
 * the arrangement is real, not a contact database of everybody's relatives.
 */
import type { AlertTier } from "@/lib/safety";
import type { Consultation } from "@/lib/api";

/**
 * What makes an escort necessary, matched against the reason the appointment
 * was booked for.
 *
 * Ordered most serious first, and read as rules rather than a list of
 * procedures: the question each asks is "what will this patient be like when
 * it is over", not "what is it called".
 */
export const ESCORT_RULES: {
  match: RegExp;
  reason: string;
  tier: AlertTier;
}[] = [
  {
    match: /sedat|endoscop|colonoscop|gastroscop|angiogra|cardiac cath|biops/i,
    reason: "Sedation — cannot travel home alone or be alone overnight",
    tier: "stop",
  },
  {
    match: /surgery|surgical|operat|theatre|cataract|hernia|excision/i,
    reason: "Post-operative — needs someone to take them home",
    tier: "stop",
  },
  {
    match: /dilat|mydriat|eye drops|retinal|fundus/i,
    reason: "Pupils dilated — vision blurred, must not drive afterwards",
    tier: "review",
  },
  {
    match: /infusion|transfus|iron|chemo/i,
    reason: "Infusion — may feel unwell for several hours afterwards",
    tier: "review",
  },
];

export function escortRuleFor(text: string) {
  return ESCORT_RULES.find((r) => r.match.test(text)) ?? null;
}

/** How close to the appointment an unarranged escort becomes somebody's job. */
export const AT_RISK_HOURS = 48;

export type EscortNeed = {
  required: boolean;
  /** Why, in words a patient could read. */
  reason: string;
  tier: AlertTier;
  confirmed: boolean;
  escortName: string;
  escortRelationship: string;
  /** Negative once the appointment is in the past. */
  hoursAway: number;
  /** Required, nobody named, and close enough that it needs chasing now. */
  atRisk: boolean;
  /** Whether the patient has already been asked on the care line. */
  asked: boolean;
};

export function escortNeed(c: Consultation, now = Date.now()): EscortNeed {
  const required = Boolean(c.escort_required);
  const escortName = c.escort_name ?? "";
  const confirmed = required && Boolean(c.escort_confirmed_at) && escortName.length > 0;
  const hoursAway = (new Date(c.scheduled_at).getTime() - now) / 3_600_000;
  const rule = escortRuleFor(c.notes ?? "");

  return {
    required,
    reason: c.escort_reason || rule?.reason || "Needs someone to travel with them",
    tier: rule?.tier ?? "review",
    confirmed,
    escortName,
    escortRelationship: c.escort_relationship ?? "",
    hoursAway,
    atRisk: required && !confirmed && hoursAway > 0 && hoursAway <= AT_RISK_HOURS,
    asked: Boolean(c.escort_asked_at),
  };
}

/**
 * The question, written per language rather than translated at send time.
 *
 * It asks for a name, because "yes" is not an arrangement. Someone who has to
 * name a person has usually spoken to them.
 */
export const ESCORT_REQUEST_COPY: Record<string, string> = {
  en: "For your appointment you will need an adult to bring you home afterwards and stay with you — you will not be able to travel on your own. Please reply with the name of the person bringing you.",
  jam: "Fi yuh appointment yuh wi need a big smaddy fi carry yuh home aftawod an stay wid yuh — yuh naa go can travel pon yuh own. Please reply wid di name a di person weh a bring yuh.",
  ht: "Pou randevou ou a, w ap bezwen yon granmoun pou mennen ou lakay apre epi rete avèk ou — ou p ap ka vwayaje pou kont ou. Tanpri reponn ak non moun k ap vin avèk ou.",
  es: "Para su cita necesitará que un adulto le lleve a casa después y se quede con usted — no podrá viajar solo. Por favor responda con el nombre de la persona que le acompañará.",
};

/** Confirmation, once a name has been recorded. */
export const ESCORT_CONFIRMED_COPY: Record<string, string> = {
  en: "Thank you — we have noted that {name} is bringing you. Your appointment can go ahead.",
  jam: "Tank yuh — wi note seh {name} a bring yuh. Yuh appointment can gwaan.",
  ht: "Mèsi — nou note se {name} k ap vin avèk ou. Randevou ou a ka fèt.",
  es: "Gracias — hemos anotado que {name} le acompañará. Su cita puede seguir adelante.",
};

export function escortConfirmedMessage(language: string, name: string) {
  const t = ESCORT_CONFIRMED_COPY[language] ?? ESCORT_CONFIRMED_COPY["en"]!;
  return t.replace("{name}", name);
}
