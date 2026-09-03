import { createFileRoute } from "@tanstack/react-router";
import { Prevention } from "@/components/outreach/Prevention";

/**
 * Route registration only.
 *
 * The screen itself lives in a plain component module because other
 * surfaces embed it. Importing a route module for its component pulls
 * createFileRoute into their render tree, which the router warns about and
 * which wedged the production bundle.
 */
export const Route = createFileRoute("/_authenticated/prevention")({
  head: () => ({
    meta: [
      { title: "Prevention Engine — Find Patients Before They Crash | CariCare Grid" },
      {
        name: "description",
        content:
          "Build a cohort in seconds, message every patient in it on WhatsApp or SMS, and track who replied, who sent a reading and who got booked in — prevention delivered, not just displayed.",
      },
      { property: "og:title", content: "Prevention Engine — CariCare Grid" },
      {
        property: "og:description",
        content: "Screening campaigns and automated outreach for Caribbean chronic disease care.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Prevention,
});
