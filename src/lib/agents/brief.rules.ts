/**
 * Ordering what a clinician should raise, given findings already computed.
 *
 * Separated from the brief agent for the same reason the Ask rules were: the
 * adapter has to hold a rules implementation and the agent has to call the
 * adapter. It is also the honest boundary of what a model would do here — the
 * findings above it are arithmetic over the record and stay that way. Only the
 * ordering and phrasing of the agenda is a narration task.
 */
export type AgendaSignals = {
  runningOutNames: string[];
  recentSystolic: number | null;
  recentGlucose: number | null;
  poorAdherenceCount: number;
  redactionCount: number;
  referralLine: string | null;
};

export function buildAgenda(s: AgendaSignals): string[] {
  const agenda: string[] = [];
  if (s.referralLine) agenda.push(s.referralLine);
  if (s.poorAdherenceCount)
    agenda.push("Work through adherence barriers — cost, access, side effects, understanding");
  if (s.recentGlucose !== null && s.recentGlucose >= 8.5)
    agenda.push("Review diet, timing and dose for glycaemic control");
  if (s.redactionCount)
    agenda.push("Decide whether the restricted section is needed for today's decision");

  // Unshifted last so they land at the top: a supply gap and an uncontrolled
  // pressure outrank anything else on the list.
  if (s.recentSystolic !== null && s.recentSystolic >= 160)
    agenda.unshift("Recheck blood pressure at the start of the consult");
  if (s.runningOutNames.length)
    agenda.unshift(`Confirm resupply of ${s.runningOutNames.join(", ")} before anything else`);

  if (!agenda.length)
    agenda.push("Routine review — no time-critical item surfaced from the record");
  return agenda;
}
