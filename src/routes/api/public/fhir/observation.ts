import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  patient_id: z.string().uuid(),
  systolic: z.number().int().min(50).max(300).optional(),
  diastolic: z.number().int().min(30).max(200).optional(),
  glucose_mmol: z.number().min(1).max(40).optional(),
  pulse: z.number().int().min(20).max(250).optional(),
  weight_kg: z.number().min(20).max(400).optional(),
  measured_at: z.string().optional(),
  device: z.string().max(120).optional(),
  reported_by: z.enum(["patient", "clinic", "device", "chw"]).default("device"),
});

/**
 * Partner write endpoint: a home device gateway, clinic system or community
 * health worker app pushes a reading into CareBridge, where the detection layer
 * picks it up.
 */
export const Route = createFileRoute("/api/public/fhir/observation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = (request.headers.get("authorization") ?? "")
          .replace(/^Bearer\s+/i, "")
          .trim();
        if (!token) return Response.json({ error: "Missing bearer token." }, { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: clients } = await supabaseAdmin
          .from("api_clients")
          .select("id, name, scopes, status, token_prefix");
        const client = (clients ?? []).find(
          (c) => token === c.token_prefix || token.startsWith(`${c.token_prefix}_`),
        );
        if (!client || client.status !== "active") {
          return Response.json({ error: "Unrecognised or inactive token." }, { status: 401 });
        }

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json(
            { error: "Invalid observation", detail: parsed.error.issues },
            { status: 400 },
          );
        }
        const b = parsed.data;

        const { data: inserted, error } = await supabaseAdmin
          .from("vitals")
          .insert({
            patient_id: b.patient_id,
            measured_at: b.measured_at ?? new Date().toISOString(),
            systolic: b.systolic ?? null,
            diastolic: b.diastolic ?? null,
            glucose_mmol: b.glucose_mmol ?? null,
            pulse: b.pulse ?? null,
            weight_kg: b.weight_kg ?? null,
            source: "home",
            reported_by: b.reported_by,
            device: b.device ?? client.name,
          })
          .select("id")
          .single();
        if (error) return Response.json({ error: error.message }, { status: 400 });

        // Let the detection layer look at the new reading immediately.
        const { data: trends } = await supabaseAdmin.rpc("detect_trend", {
          p_patient: b.patient_id,
        });
        for (const t of trends ?? []) {
          await supabaseAdmin.from("detection_signals").insert({
            patient_id: b.patient_id,
            kind: "home_reading",
            metric: t.metric,
            current_value: t.current_value,
            baseline_value: t.baseline_value,
            delta_pct: t.delta_pct,
            severity: t.severity,
            narrative: t.narrative,
            recommended_action: t.recommended_action,
          });
        }

        return Response.json(
          {
            resourceType: "Observation",
            id: inserted.id,
            status: "final",
            signals_raised: (trends ?? []).length,
          },
          { status: 201 },
        );
      },
    },
  },
});
