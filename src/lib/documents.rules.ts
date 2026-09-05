/**
 * Reading a clinic card written by hand, without a vision model.
 *
 * The extractor here was a stub: it returned nothing and asked a clerk to key
 * every value in. That is a defensible fallback and it was described, in three
 * different documents including this product's own "what is real" page, as the
 * record being *read* — which it was not. This closes that gap for the half of
 * the problem that can be closed without a GPU.
 *
 * What a doctor writes on paper during an outage is not prose. It is the same
 * dozen shapes every time — a blood pressure over a slash, a drug with a dose
 * and a frequency, a diagnosis with a year, a lab with a unit — and those are
 * matchable. So typed or pasted text is parsed here and now.
 *
 * A photograph is a different problem. Turning pixels into those shapes needs
 * a vision model, which needs the compute this project is applying for, and
 * pretending otherwise would be exactly the kind of claim the rest of this
 * codebase refuses to make. A photograph is stored, attached to the record with
 * the date written on it, and its values are keyed in — and the interface says
 * so rather than leaving somebody to discover it.
 *
 * Nothing here guesses. A number without a unit it recognises is left alone,
 * because a misread dose is a clinical safety event and a blank field is not.
 */
import type { ExtractedRecord } from "./prevention";

/** Drugs common in Caribbean chronic-disease clinics, plus their usual shorthand. */
const DRUGS = [
  "amlodipine",
  "losartan",
  "lisinopril",
  "enalapril",
  "hydrochlorothiazide",
  "hctz",
  "atenolol",
  "carvedilol",
  "nifedipine",
  "metformin",
  "gliclazide",
  "glibenclamide",
  "insulin",
  "atorvastatin",
  "simvastatin",
  "aspirin",
  "furosemide",
  "lasix",
  "spironolactone",
  "warfarin",
  "levothyroxine",
  "salbutamol",
  "prednisolone",
];

const CONDITIONS: [RegExp, string][] = [
  [/\b(htn|hypertension|high blood pressure)\b/i, "Hypertension"],
  [/\b(t2dm|type ?2 diabetes|diabetes mellitus|dm2|diabetes)\b/i, "Type 2 Diabetes"],
  [/\b(t1dm|type ?1 diabetes)\b/i, "Type 1 Diabetes"],
  [/\b(ckd|chronic kidney)\b/i, "Chronic Kidney Disease"],
  [/\b(chf|heart failure|cardiac failure)\b/i, "Heart Failure"],
  [/\b(copd)\b/i, "COPD"],
  [/\basthma\b/i, "Asthma"],
  [/\b(ihd|ischaemic heart|angina)\b/i, "Ischaemic Heart Disease"],
  [/\bhyperlipid|dyslipid|high cholesterol\b/i, "Hyperlipidaemia"],
];

/**
 * "od", "bd", "tds", "nocte" — how a dose frequency is actually written down.
 *
 * The order is load-bearing and must not be tidied alphabetically. The first
 * pattern that matches wins, and the generic "daily" sits inside "twice daily"
 * and "three times daily" — so with the once-daily rule first, a drug given
 * twice a day was filed as once a day. Halving a metformin dose on the record
 * is exactly the class of error this file refuses to make, so the specific
 * frequencies are tested first and the loose one is the fallback.
 */
const FREQ: [RegExp, string][] = [
  [/\b(bd|bid|twice daily|twice a day|two times daily)\b/i, "twice daily"],
  [/\b(tds|tid|three times daily|three times a day|three times)\b/i, "three times daily"],
  [/\b(qds|qid|four times daily|four times a day|four times)\b/i, "four times daily"],
  [/\b(nocte|at night|hs)\b/i, "at night"],
  [/\bprn\b|\bas needed\b|\bwhen required\b/i, "as needed"],
  [/\b(od|once daily|once a day|daily|mane)\b/i, "once daily"],
];

const LABS: [RegExp, string, string][] = [
  [/\bhba1c\b[^\d]{0,10}([\d.]+)\s*%?/i, "HbA1c", "%"],
  [/\b(creatinine|creat)\b[^\d]{0,10}([\d.]+)/i, "Creatinine", "µmol/L"],
  [/\begfr\b[^\d]{0,10}([\d.]+)/i, "eGFR", "mL/min"],
  [/\b(cholesterol|chol)\b[^\d]{0,10}([\d.]+)/i, "Total cholesterol", "mmol/L"],
  [/\bldl\b[^\d]{0,10}([\d.]+)/i, "LDL", "mmol/L"],
  [/\b(haemoglobin|hb)\b[^\d]{0,10}([\d.]+)/i, "Haemoglobin", "g/dL"],
];

/** dd/mm/yy or dd-mm-yyyy as people actually write it on a card. */
function isoDate(raw: string): string | undefined {
  const m = /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(raw);
  if (!m) return undefined;
  const [, d, mo, y] = m;
  const year = Number(y) < 100 ? 2000 + Number(y) : Number(y);
  const iso = `${year}-${String(Number(mo)).padStart(2, "0")}-${String(Number(d)).padStart(2, "0")}`;
  return Number.isNaN(new Date(iso).getTime()) ? undefined : iso;
}

export function extractFromText(text: string): ExtractedRecord {
  const out: ExtractedRecord = {};
  if (!text || text.trim().length < 3) return out;

  const lines = text
    .split(/[\r\n;]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  // ---- conditions, with the year if one is written beside them -------------
  const conditions: NonNullable<ExtractedRecord["conditions"]> = [];
  for (const [re, name] of CONDITIONS) {
    const line = lines.find((l) => re.test(l));
    if (!line || conditions.some((c) => c.name === name)) continue;
    const year = /\b(19|20)\d{2}\b/.exec(line)?.[0];
    conditions.push(year ? { name, diagnosed: year } : { name });
  }
  if (conditions.length) out.conditions = conditions;

  // ---- medications: a known drug, then its dose and frequency -------------
  const medications: NonNullable<ExtractedRecord["medications"]> = [];
  for (const line of lines) {
    for (const drug of DRUGS) {
      if (!new RegExp(`\\b${drug}\\b`, "i").test(line)) continue;
      const name = drug === "hctz" ? "Hydrochlorothiazide" : drug === "lasix" ? "Furosemide" : drug;
      if (medications.some((m) => m.name.toLowerCase() === name.toLowerCase())) continue;
      const dosage = /(\d+(?:\.\d+)?\s?(?:mg|mcg|g|units?|iu))\b/i.exec(line)?.[1];
      const freq = FREQ.find(([re]) => re.test(line))?.[1];
      medications.push({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        ...(dosage ? { dosage: dosage.replace(/\s+/g, "") } : {}),
        ...(freq ? { frequency: freq } : {}),
      });
    }
  }
  if (medications.length) out.medications = medications;

  // ---- vitals -------------------------------------------------------------
  const vitals: NonNullable<ExtractedRecord["vitals"]> = [];
  for (const line of lines) {
    const bp = /\b(\d{2,3})\s*\/\s*(\d{2,3})\b/.exec(line);
    // A blood pressure and a date both contain a slash; only one has two
    // numbers in a plausible pressure range.
    const sys = bp ? Number(bp[1]) : null;
    const dia = bp ? Number(bp[2]) : null;
    const plausible =
      sys !== null && dia !== null && sys >= 60 && sys <= 260 && dia >= 30 && dia <= 160;

    const glu = /\b(?:glucose|sugar|bs|rbs|fbs)\b[^\d]{0,10}([\d.]+)/i.exec(line);
    const wt = /\b(\d{2,3}(?:\.\d)?)\s?kg\b/i.exec(line);
    const pulse = /\b(?:pulse|hr)\b[^\d]{0,8}(\d{2,3})\b/i.exec(line);

    if (!plausible && !glu && !wt && !pulse) continue;
    const measured = isoDate(line);
    vitals.push({
      ...(plausible ? { systolic: sys!, diastolic: dia! } : {}),
      ...(glu ? { glucose_mmol: Number(glu[1]) } : {}),
      ...(wt ? { weight_kg: Number(wt[1]) } : {}),
      ...(pulse ? { pulse: Number(pulse[1]) } : {}),
      ...(measured ? { measured_at: measured } : {}),
    });
  }
  if (vitals.length) out.vitals = vitals;

  // ---- labs ---------------------------------------------------------------
  const labs: NonNullable<ExtractedRecord["labs"]> = [];
  for (const [re, name, unit] of LABS) {
    const m = re.exec(text);
    if (!m) continue;
    const value = m[m.length - 1];
    if (!value) continue;
    labs.push({ name, value, unit });
  }
  if (labs.length) out.labs = labs;

  // ---- allergies ----------------------------------------------------------
  const allergy = /\ballerg(?:y|ies|ic to)\b[:\s-]*([^\n;]{2,60})/i.exec(text);
  if (allergy?.[1]) out.allergies = allergy[1].trim();

  return out;
}

/** A sentence describing what was found, for the review step. */
export function describe(e: ExtractedRecord): string {
  const parts = [
    e.conditions?.length ? `${e.conditions.length} condition(s)` : null,
    e.medications?.length ? `${e.medications.length} medication(s)` : null,
    e.vitals?.length ? `${e.vitals.length} reading(s)` : null,
    e.labs?.length ? `${e.labs.length} lab result(s)` : null,
    e.allergies ? "an allergy" : null,
  ].filter(Boolean);
  return parts.length
    ? `Read ${parts.join(", ")} from the text. Check every value before committing.`
    : "Nothing recognisable in the text — key the values in by hand.";
}
