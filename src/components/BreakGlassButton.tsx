import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logRecordAccess } from "@/lib/audit";
import { STAFF_ROLE_TIER } from "@/lib/access";

/**
 * Emergency override. Only licensed clinical staff may trigger it; access
 * lasts 24 hours, the patient is notified immediately, and the event is
 * flagged in the ledger for mandatory governance review.
 */
export function BreakGlassButton({ patientId }: { patientId: string }) {
  const { role, profile } = useAuth();
  const qc = useQueryClient();
  // Spec §5: licensed clinical staff only. Front desk and facility admins can
  // never trigger an override, so employment at a facility is not enough — the
  // staff role has to map to a tier that delivers care.
  const tier = profile?.staff_role ? STAFF_ROLE_TIER[profile.staff_role] : null;
  const authorised =
    (role === "clinician" &&
      (tier === "attending" || tier === "consulting" || tier === "nursing")) ||
    role === "admin";

  const trigger = useMutation({
    mutationFn: async () => {
      const reason = window.prompt(
        "Break-glass access is logged and reviewed. State the clinical emergency:",
        "Patient unresponsive; immediate medication and allergy history required.",
      );
      if (!reason) return null;
      const { data, error } = await supabase
        .from("break_glass_events")
        .insert({
          patient_id: patientId,
          facility_id: profile?.facility_id ?? null,
          provider_id: profile?.provider_id ?? null,
          actor_name: profile?.full_name ?? "Clinician",
          actor_tier: tier ?? "attending",
          reason,
          started_at: new Date().toISOString(),
          // Spec §5: 24 hours, non-renewable. Without this the override had no
          // expiry at all, so the resolver would have treated it as permanent.
          expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          patient_notified_at: new Date().toISOString(),
          review_status: "pending",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await logRecordAccess({
        patientId,
        providerId: profile?.provider_id ?? null,
        facilityId: profile?.facility_id ?? null,
        resource: "Full chart under emergency override",
        basis: "break_glass",
        actorName: profile?.full_name ?? "Clinician",
        breakGlassId: data.id,
      });
      return data.id;
    },
    onSuccess: (id) => {
      if (!id) return;
      toast.warning("Break-glass access opened for 24 hours — patient notified, review scheduled");
      void qc.invalidateQueries({ queryKey: ["break_glass_events"] });
      void qc.invalidateQueries({ queryKey: ["access_log"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!authorised) return null;

  return (
    <button
      onClick={() => trigger.mutate()}
      disabled={trigger.isPending}
      className="inline-flex items-center gap-1.5 rounded-lg border border-critical/40 bg-critical/10 px-2.5 py-1 text-[11.5px] font-semibold text-critical hover:bg-critical/15"
      title="Emergency override — logged, patient notified, reviewed within 72 hours"
    >
      <ShieldAlert className="h-3.5 w-3.5" />
      Break glass
    </button>
  );
}
