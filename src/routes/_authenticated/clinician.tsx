/**
 * The clinician console has become the "My list" tab of /patients.
 *
 * Both screens were already building the same list — every patient a lawful
 * basis reaches, sorted by risk score — and opening the same chart. They
 * differed only in what a row showed and whether you could act on it.
 *
 * The route stays as a redirect rather than being deleted, because Overview,
 * the notifications menu, the facility console, the detection worklist and the
 * ask agent all link here, and a bookmark should not 404.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/clinician")({
  validateSearch: (search: Record<string, unknown>): { patient?: string } =>
    typeof search["patient"] === "string" ? { patient: search["patient"] as string } : {},
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/patients", search, replace: true });
  },
});
