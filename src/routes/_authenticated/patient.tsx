import { createFileRoute } from "@tanstack/react-router";
import { PatientLine } from "@/components/patient/CareLineView";

/** Route registration only — the screen lives in CareLineView. */
export const Route = createFileRoute("/_authenticated/patient")({
  head: () => ({
    meta: [
      { title: "Messages — WhatsApp Intake & AI Triage | CareBridge Journey" },
      {
        name: "description",
        content:
          "Simulated WhatsApp intake for Caribbean NCD patients: home readings, voice notes and local language varieties, triaged by AI in seconds.",
      },
      { property: "og:title", content: "Messages — WhatsApp Intake & AI Triage" },
      {
        property: "og:description",
        content:
          "No app install, no data plan required. The patient texts; CareBridge triages and routes.",
      },
    ],
  }),
  component: PatientLine,
});
