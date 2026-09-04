/**
 * Sensitive-category rules, with no database behind them.
 *
 * These were declared alongside the query definitions in access.ts, which
 * imports the Supabase client — so importing a constant pulled the whole mock
 * database in, and building the store is the first thing that module does. A
 * pure rule that cannot be imported without spinning up a database also cannot
 * be tested without one, which is why the agent evaluation suite needed this
 * split before it could run at all.
 */
export type SensitiveCategory =
  "mental_health" | "hiv" | "srh" | "substance_use" | "gbv" | "genetic" | "adolescent";

export const SENSITIVE_CATEGORIES: {
  code: SensitiveCategory;
  label: string;
  gate: string;
}[] = [
  {
    code: "mental_health",
    label: "Mental health & psychiatric notes",
    gate: "Explicit consent, or the treating psychiatrist",
  },
  {
    code: "hiv",
    label: "HIV status, testing and ART",
    gate: "Explicit consent; emergency override allowed with mandatory review",
  },
  { code: "srh", label: "Sexual & reproductive health", gate: "Explicit consent" },
  {
    code: "substance_use",
    label: "Substance use & addiction treatment",
    gate: "Explicit consent, or attending clinician only",
  },
  {
    code: "gbv",
    label: "Sexual assault / intimate-partner violence notes",
    gate: "Explicit consent; never visible to admin tiers",
  },
  { code: "genetic", label: "Genetic and familial risk data", gate: "Explicit consent" },
  {
    code: "adolescent",
    label: "Adolescent confidential services (12–17)",
    gate: "The young person's own consent",
  },
];

export const SENSITIVE_LABEL: Record<string, string> = Object.fromEntries(
  SENSITIVE_CATEGORIES.map((c) => [c.code, c.label]),
);

export function isSensitive(sensitivity?: string | null) {
  return !!sensitivity && sensitivity !== "standard";
}
