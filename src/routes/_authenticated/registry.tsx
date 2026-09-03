import { createFileRoute } from "@tanstack/react-router";
import { RegistryPage } from "@/components/facility/Registry";

/**
 * Route registration only.
 *
 * The screen itself lives in a plain component module because other
 * surfaces embed it. Importing a route module for its component pulls
 * createFileRoute into their render tree, which the router warns about and
 * which wedged the production bundle.
 */
export const Route = createFileRoute("/_authenticated/registry")({
  head: () => ({
    meta: [
      { title: "Registry & Import — Onboard Patients and Staff | CariCare Grid" },
      {
        name: "description",
        content:
          "Add patients and staff by hand or import a roster by CSV. The realistic on-ramp for clinics whose records are on paper or in spreadsheets.",
      },
    ],
  }),
  component: RegistryPage,
});
