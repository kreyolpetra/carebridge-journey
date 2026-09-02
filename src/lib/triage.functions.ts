// Runs client-side. Was a TanStack Start server function calling the Lovable AI
// gateway (the key must stay server-side), with ruleBasedTriage as its fallback.
// With no gateway configured and no backend to host the call, the fallback was
// the only path that ever ran — so it now runs directly in the browser, which
// also lets the app work as a static build with no server behind it.
import { ruleBasedTriage, type PatientContext, type TriageResult } from "./triage.server";

export async function analyzeMessage({
  data,
}: {
  data: { context: PatientContext; message: string };
}): Promise<{ result: TriageResult; degraded: boolean; note?: string }> {
  return {
    result: ruleBasedTriage(data.context, data.message),
    degraded: true,
    note: "Deterministic clinical rules — no AI gateway configured.",
  };
}
