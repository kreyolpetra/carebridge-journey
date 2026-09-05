/**
 * Reading a clinic card, through the same seam as every other judgement.
 *
 * This used to return nothing at all — for a photograph and for typed text
 * alike — and ask a clerk to key every value in. That was described in three
 * places, including this product's own "what is real" page, as the record
 * being read, which it was not.
 *
 * Typed or pasted text is now genuinely parsed by rules (lib/documents.rules).
 * A photograph still needs the vision model at the seam, and says so.
 */
import { getAdapter } from "./agents/model";
import type { ExtractionResult } from "./documents.server";

export async function extractDocument(input: {
  data: { text?: string | undefined; imageDataUrl?: string | undefined; title: string };
}): Promise<ExtractionResult> {
  const { value, degraded } = await getAdapter().extractDocument({
    text: input.data.text,
    imageDataUrl: input.data.imageDataUrl,
  });
  return { extracted: value.extracted, note: value.note, degraded };
}
