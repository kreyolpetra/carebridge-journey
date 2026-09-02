// Runs client-side — see the note in triage.functions.ts. Vision extraction needs
// a gateway key that must stay server-side, so with none configured this always
// returned the manual-entry path. The document is still stored; a clerk keys the
// values in, which is the reviewed-before-it-touches-the-chart flow anyway.
import type { ExtractionResult } from "./documents.server";

export async function extractDocument(_input: {
  data: { text?: string | undefined; imageDataUrl?: string | undefined; title: string };
}): Promise<ExtractionResult> {
  return {
    extracted: {},
    note: "Stored for review — no AI gateway configured, so key the values in manually.",
    degraded: true,
  };
}
