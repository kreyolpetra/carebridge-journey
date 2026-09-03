export const BAND_ORDER = ["critical", "high", "moderate", "low"] as const;
export type Band = (typeof BAND_ORDER)[number];

export function bandClasses(band: string) {
  switch (band) {
    case "critical":
      return "bg-critical/15 text-critical border-critical/40";
    case "high":
      return "bg-high/15 text-high border-high/40";
    case "moderate":
      return "bg-moderate/15 text-moderate border-moderate/40";
    default:
      return "bg-low/15 text-low border-low/40";
  }
}

export function severityClasses(severity: string) {
  switch (severity) {
    case "emergency":
    case "high":
      return "bg-critical/15 text-critical border-critical/40";
    case "urgent":
    case "medium":
      return "bg-high/15 text-high border-high/40";
    case "routine":
      return "bg-moderate/15 text-moderate border-moderate/40";
    default:
      return "bg-low/15 text-low border-low/40";
  }
}

export function usd(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
}

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * A date-only string is a calendar date, not an instant.
 *
 * `new Date("2026-08-02")` parses as UTC midnight and then renders in local
 * time, so anywhere west of Greenwich it prints Aug 1 — a document dated the
 * 2nd shows as the 1st, and a birth date disagrees with the record by a day.
 * Timestamps that carry a time are genuine instants and stay local.
 */
export function shortDate(iso: string) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.exec(iso);
  const d = dateOnly
    ? new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
    : new Date(iso);
  // Paper records reach back years, and "Jun 14" in a list of this year's
  // visits reads as this year. The year is shown only when it is not the
  // current one, so recent rows stay short.
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export const LANGUAGE_LABEL: Record<string, string> = {
  en: "English",
  jam: "Jamaican Patois",
  // Was "Haitian / St. Lucian Creole" — two distinct languages under one label.
  // A Kwéyòl speaker is not an interpreter for a Kreyòl speaker.
  "fr-cr": "Kwéyòl (St. Lucia / Dominica)",
  ht: "Haitian Kreyòl",
  fr: "French",
  es: "Spanish",
};

/** Resource tiers — how much specialist capacity a country can offer its own people. */
export const TIER_LABEL: Record<string, string> = {
  well_resourced: "Well resourced",
  middle: "Middle",
  clinician_rich: "Clinician-rich",
  under_resourced: "Under-resourced",
};
