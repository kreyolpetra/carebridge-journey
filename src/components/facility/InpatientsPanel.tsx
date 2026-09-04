/**
 * Who is in a bed right now, and the act of sending them home properly.
 *
 * This is the hospital's half of the product, and it is the first surface that
 * exists for one kind of facility and not the other. It is gated on beds, not
 * on the word "hospital": there are clinics here with beds and hospitals whose
 * ward has been closed for a year, and a building's name has never been a
 * reliable account of what is inside it.
 *
 * The discharge action is the point. A discharge summary that stays inside the
 * discharging hospital is a document, not a hand-off — see lib/discharge.ts.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BedDouble, LogOut, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { encountersQuery, type Encounter } from "@/lib/org";
import { patientsQuery, facilitiesQuery, type Facility } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { dischargeMessage } from "@/lib/discharge";
import { Panel, PanelHeader, Pill, Loading } from "@/components/grid";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { shortDate } from "@/lib/format";

function daysOn(iso: string) {
  return Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) + 1);
}

export function InpatientsPanel({ facility }: { facility: Facility | null | undefined }) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const encounters = useQuery(encountersQuery(null));
  const patients = useQuery(patientsQuery);
  const facilities = useQuery(facilitiesQuery);
  const [discharging, setDischarging] = useState<Encounter | null>(null);
  const [summary, setSummary] = useState("");
  const [meds, setMeds] = useState("");
  const [days, setDays] = useState(7);

  const patientById = useMemo(
    () => new Map((patients.data ?? []).map((p) => [p.id, p] as const)),
    [patients.data],
  );

  /** Open admissions at this facility — an episode with no end date on it. */
  const onWard = useMemo(() => {
    if (!facility) return [];
    return (encounters.data ?? [])
      .filter(
        (e) =>
          e.facility_id === facility.id &&
          (e.kind === "admission" || e.kind === "emergency") &&
          !e.ended_at,
      )
      .sort((a, b) => a.started_at.localeCompare(b.started_at));
  }, [encounters.data, facility]);

  const discharge = useMutation({
    mutationFn: async (e: Encounter) => {
      const patient = patientById.get(e.patient_id);
      // Back to whoever holds them the rest of the year — their own island's
      // clinic, not the hospital they happen to be standing in.
      const home = (facilities.data ?? []).find(
        (f) =>
          f.island_code === patient?.island_code && f.kind === "clinic" && f.id !== facility?.id,
      );

      const { error } = await supabase.from("discharges").insert({
        encounter_id: e.id,
        patient_id: e.patient_id,
        from_facility_id: e.facility_id,
        to_facility_id: home?.id ?? null,
        discharged_by_provider_id: profile?.provider_id ?? null,
        summary: summary.trim(),
        medication_changes: meds.trim(),
        follow_up_days: days,
        discharged_at: new Date().toISOString(),
        acknowledged_at: null,
        acknowledged_by_provider_id: null,
      });
      if (error) throw new Error(error.message);

      // The bed is now free, so the episode has to close with it.
      await supabase
        .from("encounters")
        .update({ ended_at: new Date().toISOString(), status: "closed", summary: summary.trim() })
        .eq("id", e.id);

      // And the patient is told, in their own language, what happens next.
      const language = patient?.language ?? "en";
      await supabase.from("messages").insert({
        patient_id: e.patient_id,
        direction: "out",
        body: dischargeMessage(language, facility?.name ?? "hospital", days),
        kind: "text",
        language,
        channel: "whatsapp",
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["encounters"] });
      void qc.invalidateQueries({ queryKey: ["discharges"] });
      void qc.invalidateQueries({ queryKey: ["messages"] });
      setDischarging(null);
      setSummary("");
      setMeds("");
      toast("Discharged and handed over", {
        description: "Their clinic has it on their worklist, and the patient has been told.",
      });
    },
    onError: (err: Error) => toast("Could not discharge", { description: err.message }),
  });

  // Gated on beds rather than on the word "hospital".
  if (!facility || !facility.beds_total) return null;

  return (
    <>
      <Panel className="mb-4">
        <PanelHeader
          title="On the ward now"
          subtitle="Open admissions at this facility, longest stay first"
          right={
            <Pill className="border-primary/40 bg-primary/10 text-primary">
              <BedDouble className="h-3 w-3" />
              {onWard.length} of {facility.beds_total} beds
            </Pill>
          }
        />
        {encounters.isLoading ? <Loading label="Reading the ward list…" /> : null}
        {!encounters.isLoading && !onWard.length ? (
          <p className="px-5 py-5 text-[13px] text-muted-foreground">
            Nobody is admitted here at the moment.
          </p>
        ) : null}
        <div className="max-h-[420px] divide-y divide-border overflow-y-auto">
          {onWard.slice(0, 40).map((e) => {
            const patient = patientById.get(e.patient_id);
            return (
              <div
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold">
                    {patient?.full_name ?? "Patient"}
                    {e.kind === "emergency" ? (
                      <Pill className="ml-2 border-critical/40 bg-critical/10 text-critical">
                        emergency
                      </Pill>
                    ) : null}
                  </p>
                  <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                    {patient?.mrn} · day {daysOn(e.started_at)} · admitted {shortDate(e.started_at)}{" "}
                    · {e.reason}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDischarging(e);
                    setSummary(e.summary || "");
                    setMeds("");
                    setDays(7);
                  }}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[12px] font-semibold transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Discharge
                </button>
              </div>
            );
          })}
        </div>
      </Panel>

      <Dialog open={Boolean(discharging)} onOpenChange={(o) => !o && setDischarging(null)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>
              Discharge {patientById.get(discharging?.patient_id ?? "")?.full_name ?? "patient"}
            </DialogTitle>
            <DialogDescription>
              This hands them back to their own clinic. It goes on that clinic's worklist until a
              named person picks it up — a summary that stays here is a document, not a hand-off.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="d-summary">What happened during the admission</Label>
              <Textarea
                id="d-summary"
                rows={3}
                value={summary}
                onChange={(ev) => setSummary(ev.target.value)}
                placeholder="Admitted with hypertensive urgency. Settled on adjusted regimen…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-meds">What changed about their medication</Label>
              <Textarea
                id="d-meds"
                rows={2}
                value={meds}
                onChange={(ev) => setMeds(ev.target.value)}
                placeholder="Amlodipine increased 5mg to 10mg. Losartan started 50mg daily."
              />
              {/* Named separately because this is where post-discharge harm
                  concentrates: the clinic keeps prescribing the old dose. */}
              <p className="text-[11.5px] text-muted-foreground">
                Kept separate from the summary because it is the part the clinic must act on.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-days">Seen again within</Label>
              <div className="flex flex-wrap gap-1.5">
                {[3, 5, 7, 14].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDays(d)}
                    className={
                      "rounded-lg border px-3 py-1 text-[12.5px] font-semibold transition-colors " +
                      (days === d
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground")
                    }
                  >
                    {d} days
                  </button>
                ))}
              </div>
            </div>
            <p className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
              <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              The patient is messaged on their care line in their own language, so they know to
              expect the call even if the clinic is slow.
            </p>
            <button
              type="button"
              onClick={() => discharging && discharge.mutate(discharging)}
              disabled={!summary.trim() || discharge.isPending}
              className="w-full rounded-lg bg-primary px-3 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {discharge.isPending ? "Discharging…" : "Discharge and hand over"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
