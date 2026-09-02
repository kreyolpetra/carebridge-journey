import { createFileRoute } from "@tanstack/react-router";

/**
 * FHIR-shaped capability statement. Public by design: a clinic system
 * evaluating the Grid needs to discover the contract before it has a token.
 */
export const Route = createFileRoute("/api/public/fhir/metadata")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const base = new URL(request.url).origin;
        return Response.json({
          resourceType: "CapabilityStatement",
          status: "active",
          publisher: "CariCare Grid — Caribbean NCD coordination layer",
          fhirVersion: "4.0.1",
          format: ["application/fhir+json"],
          security: {
            description:
              "Bearer token issued per partner system. Tokens are scoped, revocable, and every read is written to the patient's access log.",
          },
          rest: [
            {
              mode: "server",
              resource: [
                {
                  type: "Patient",
                  interaction: [{ code: "read" }],
                  documentation: `GET ${base}/api/public/fhir/patient/{id} — returns a Bundle: Patient, Conditions, MedicationStatements, Observations, Encounters.`,
                },
                {
                  type: "Observation",
                  interaction: [{ code: "create" }],
                  documentation: `POST ${base}/api/public/fhir/observation — push a reading (home cuff, glucometer, clinic device) into the Grid.`,
                },
              ],
            },
          ],
        });
      },
    },
  },
});
