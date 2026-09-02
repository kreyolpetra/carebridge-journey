import type { ExtractedRecord } from "./prevention";

export type ExtractionResult = {
  extracted: ExtractedRecord;
  note: string;
  degraded: boolean;
};

export const EXTRACT_SYSTEM = `You are a careful Caribbean health-records clerk digitising paper charts.
You read handwritten clinic cards, faxed lab reports and photographed prescriptions from Jamaica, Trinidad and the wider region.
Rules: transcribe only what is legible, never guess a dose or a number, preserve local drug names,
normalise dates to ISO (YYYY-MM-DD), and convert blood glucose to mmol/L only when the unit is explicit.
Return strict JSON, nothing else.`;

export function parseExtraction(raw: string): ExtractionResult {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    return { extracted: {}, note: "Nothing legible could be extracted.", degraded: true };
  }
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as ExtractedRecord;
    const counts = [
      parsed.conditions?.length ? `${parsed.conditions.length} condition(s)` : null,
      parsed.medications?.length ? `${parsed.medications.length} medication(s)` : null,
      parsed.vitals?.length ? `${parsed.vitals.length} reading(s)` : null,
      parsed.labs?.length ? `${parsed.labs.length} lab result(s)` : null,
    ].filter(Boolean);
    return {
      extracted: parsed,
      note: counts.length
        ? `Extracted ${counts.join(", ")}. Review before committing to the chart.`
        : "Document read, but no structured clinical fields were found.",
      degraded: false,
    };
  } catch {
    return { extracted: {}, note: "The model returned an unreadable response.", degraded: true };
  }
}
