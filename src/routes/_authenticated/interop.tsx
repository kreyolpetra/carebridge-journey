import { createFileRoute } from "@tanstack/react-router";
import { Interop } from "@/components/facility/Interop";

/**
 * Route registration only.
 *
 * The screen itself lives in a plain component module because other
 * surfaces embed it. Importing a route module for its component pulls
 * createFileRoute into their render tree, which the router warns about and
 * which wedged the production bundle.
 */
export const Route = createFileRoute("/_authenticated/interop")({
  head: () => ({
    meta: [
      { title: "Record On-Ramp & Open API — Get Every Clinic In | CariCare Grid" },
      {
        name: "description",
        content:
          "Photograph a paper clinic card and the Grid reads it into structured fields. Existing hospital systems connect through a FHIR-shaped API with scoped, revocable tokens.",
      },
      { property: "og:title", content: "Record On-Ramp & Open API — CariCare Grid" },
      {
        property: "og:description",
        content:
          "Paper charts and legacy EMRs join the Caribbean coordination layer without replacing anything.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Interop,
});
