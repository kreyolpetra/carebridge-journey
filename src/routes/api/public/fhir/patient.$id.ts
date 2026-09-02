import { createFileRoute } from "@tanstack/react-router";

type Client = { id: string; name: string; organisation: string; scopes: string[]; status: string; token_prefix: string };

function unauthorised(detail: string) {
  return Response.json(
    {
      resourceType: "OperationOutcome",
      issue: [{ severity: "error", code: "security", diagnostics: detail }],
    },
    { status: 401 },
  );
}

/**
 * Partner read endpoint: an external EMR pulls a patient's chart as a
 * FHIR-shaped Bundle. Callers are authenticated by bearer token, scope-checked,
 * and every read lands in the patient's access log.
 */
export const Route = createFileRoute("/api/public/fhir/patient/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
        if (!token) return unauthorised("Missing bearer token.");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: clients } = await supabaseAdmin
          .from("api_clients")
          .select("id, name, organisation, scopes, status, token_prefix");
        const client = ((clients ?? []) as Client[]).find(
          (c) => token === c.token_prefix || token.startsWith(`${c.token_prefix}_`),
        );
        if (!client) return unauthorised("Unrecognised token.");
        if (client.status !== "active") return unauthorised(`Token is ${client.status}.`);
        if (!client.scopes.includes("patient.read")) return unauthorised("Token lacks the patient.read scope.");

        const patientId = params.id;
        const [patient, conditions, medications, vitals, encounters] = await Promise.all([
          supabaseAdmin.from("patients").select("*").eq("id", patientId).maybeSingle(),
          supabaseAdmin.from("conditions").select("*").eq("patient_id", patientId),
          supabaseAdmin.from("medications").select("*").eq("patient_id", patientId),
          supabaseAdmin
            .from("vitals")
            .select("*")
            .eq("patient_id", patientId)
            .order("measured_at", { ascending: false })
            .limit(50),
          supabaseAdmin.from("encounters").select("*").eq("patient_id", patientId).limit(50),
        ]);

        if (!patient.data) {
          return Response.json(
            { resourceType: "OperationOutcome", issue: [{ severity: "error", code: "not-found" }] },
            { status: 404 },
          );
        }

        const p = patient.data;
        const entry: unknown[] = [
          {
            resource: {
              resourceType: "Patient",
              id: p.id,
              name: [{ text: p.full_name }],
              telecom: [{ system: "phone", value: p.phone }],
              gender: p.sex?.toLowerCase() === "f" ? "female" : "male",
              address: [{ district: p.parish, country: p.island_code }],
              communication: [{ language: { text: p.language } }],
            },
          },
        ];
        for (const c of conditions.data ?? []) {
          entry.push({
            resource: {
              resourceType: "Condition",
              id: c.id,
              subject: { reference: `Patient/${p.id}` },
              code: { text: c.name },
              onsetDateTime: c.diagnosed_on,
            },
          });
        }
        for (const m of medications.data ?? []) {
          entry.push({
            resource: {
              resourceType: "MedicationStatement",
              id: m.id,
              subject: { reference: `Patient/${p.id}` },
              medicationCodeableConcept: { text: m.name },
              dosage: [{ text: `${m.dosage} ${m.frequency}` }],
            },
          });
        }
        for (const v of vitals.data ?? []) {
          if (v.systolic != null) {
            entry.push({
              resource: {
                resourceType: "Observation",
                id: `${v.id}-bp`,
                status: "final",
                subject: { reference: `Patient/${p.id}` },
                effectiveDateTime: v.measured_at,
                code: { text: "Blood pressure" },
                component: [
                  { code: { text: "Systolic" }, valueQuantity: { value: v.systolic, unit: "mmHg" } },
                  { code: { text: "Diastolic" }, valueQuantity: { value: v.diastolic, unit: "mmHg" } },
                ],
              },
            });
          }
          if (v.glucose_mmol != null) {
            entry.push({
              resource: {
                resourceType: "Observation",
                id: `${v.id}-glu`,
                status: "final",
                subject: { reference: `Patient/${p.id}` },
                effectiveDateTime: v.measured_at,
                code: { text: "Blood glucose" },
                valueQuantity: { value: Number(v.glucose_mmol), unit: "mmol/L" },
              },
            });
          }
        }
        for (const e of encounters.data ?? []) {
          entry.push({
            resource: {
              resourceType: "Encounter",
              id: e.id,
              status: e.status === "closed" ? "finished" : "in-progress",
              subject: { reference: `Patient/${p.id}` },
              period: { start: e.started_at, end: e.ended_at },
              reasonCode: [{ text: e.reason }],
            },
          });
        }

        await Promise.all([
          supabaseAdmin.from("consent_access_log").insert({
            patient_id: patientId,
            resource: `FHIR Bundle via ${client.name}`,
            allowed: true,
            basis: "institutional",
            actor_name: client.organisation,
          }),
          supabaseAdmin
            .from("api_clients")
            .update({ last_used_at: new Date().toISOString(), calls_30d: 1 })
            .eq("id", client.id),
        ]);

        return Response.json(
          { resourceType: "Bundle", type: "collection", total: entry.length, entry },
          { headers: { "content-type": "application/fhir+json", "cache-control": "no-store" } },
        );
      },
    },
  },
});
