/**
 * The paper reader, under test.
 *
 * This suite exists because of one bug. The frequency patterns were ordered so
 * that the loose "daily" rule was tried first, and "daily" sits inside "twice
 * daily" — so a drug given twice a day was read off the card and filed as once
 * a day. Nothing in the interface would have looked wrong. A clinician would
 * have reviewed a plausible line and approved it.
 *
 * A comment saying "keep this order" is not protection; a failing test is. So
 * every frequency form has a case here, and so does every value the reader is
 * allowed to write into a chart.
 */
import type { EvalCase } from "./eval-harness";
import { extractFromText, describe } from "@/lib/documents.rules";
import { normaliseSpoken } from "@/lib/dictation";

const freq = (line: string) => extractFromText(line).medications?.[0]?.frequency;

export const documentCases: EvalCase[] = [
  {
    family: "safety",
    name: "twice daily is not filed as once daily",
    run: async () => {
      const got = freq("Metformin 1g twice daily");
      return got === "twice daily" ? null : `filed "${got}" — a halved dose on the record`;
    },
  },
  {
    family: "safety",
    name: "three times daily survives the loose 'daily' rule",
    run: async () => {
      const got = freq("Salbutamol 2 puffs three times daily");
      return got === "three times daily" ? null : `filed "${got}"`;
    },
  },
  {
    family: "safety",
    name: "four times daily survives it too",
    run: async () => {
      const got = freq("Prednisolone 5mg four times daily");
      return got === "four times daily" ? null : `filed "${got}"`;
    },
  },
  {
    family: "correctness",
    name: "ward shorthand bd/tds/od",
    run: async () => {
      const cases: [string, string][] = [
        ["Amlodipine 10mg od", "once daily"],
        ["Metformin 1g bd", "twice daily"],
        ["Furosemide 40mg tds", "three times daily"],
        ["Levothyroxine 50mcg mane", "once daily"],
        ["Atorvastatin 20mg nocte", "at night"],
      ];
      for (const [line, want] of cases) {
        const got = freq(line);
        if (got !== want) return `"${line}" read as "${got}", expected "${want}"`;
      }
      return null;
    },
  },
  {
    family: "correctness",
    name: "dose and unit are kept together",
    run: async () => {
      const m = extractFromText("Amlodipine 10 mg od").medications?.[0];
      return m?.dosage === "10mg" ? null : `dosage read as "${m?.dosage}"`;
    },
  },
  {
    family: "safety",
    name: "a date is never read as a blood pressure",
    run: async () => {
      const v = extractFromText("Reviewed 03/04/25 in clinic").vitals;
      return v?.length ? `invented a pressure of ${v[0]?.systolic}/${v[0]?.diastolic}` : null;
    },
  },
  {
    family: "safety",
    name: "an implausible pressure is refused rather than filed",
    run: async () => {
      const v = extractFromText("Form 12/300 completed").vitals;
      return v?.some((x) => x.systolic) ? "filed a nonsense pressure" : null;
    },
  },
  {
    family: "grounding",
    name: "nothing is invented from text with no clinical content",
    run: async () => {
      const out = extractFromText("Patient attended. Pleasant lady. Chatted about the weather.");
      return Object.keys(out).length ? `invented ${Object.keys(out).join(", ")}` : null;
    },
  },
  {
    family: "honesty",
    name: "an empty read says so instead of implying success",
    run: async () => {
      const said = describe({});
      return /nothing recognisable/i.test(said) ? null : `said "${said}"`;
    },
  },
  {
    family: "correctness",
    name: "an allergy is captured, since the safety engine checks against it",
    run: async () => {
      const a = extractFromText("Allergic to penicillin — rash").allergies;
      return /penicillin/i.test(a ?? "") ? null : `allergy read as "${a}"`;
    },
  },
  {
    family: "correctness",
    name: "a condition keeps the year it was diagnosed",
    run: async () => {
      const c = extractFromText("HTN dx 2019").conditions?.[0];
      return c?.name === "Hypertension" && c.diagnosed === "2019" ? null : JSON.stringify(c);
    },
  },
  {
    family: "correctness",
    name: "spoken '156 over 96' becomes a pressure the chart can plot",
    run: async () => {
      const v = extractFromText(normaliseSpoken("b p 156 over 96")).vitals?.[0];
      return v?.systolic === 156 && v.diastolic === 96 ? null : JSON.stringify(v);
    },
  },
  {
    family: "correctness",
    name: "spoken units are written the way the reader expects",
    run: async () => {
      const m = extractFromText(normaliseSpoken("amlodipine 10 milligrams once daily"))
        .medications?.[0];
      return m?.dosage === "10mg" && m.frequency === "once daily" ? null : JSON.stringify(m);
    },
  },
  {
    family: "safety",
    name: "spoken 'twice daily' is not halved either",
    run: async () => {
      const m = extractFromText(normaliseSpoken("metformin 1 g twice daily")).medications?.[0];
      return m?.frequency === "twice daily" ? null : `spoken dose filed as "${m?.frequency}"`;
    },
  },
];
