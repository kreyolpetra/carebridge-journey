/**
 * One visit, opened from the care history.
 *
 * The timeline lists what happened; this is where a clinician reads the visit
 * itself — the note, the readings taken around it, and the referral it produced.
 * The patient already had this on their own record via VisitDialog; the
 * clinician's timeline rendered flat rows you could not click.
 *
 * It shows exactly as much as the row it was opened from: the same disclosure
 * the care history resolved, so opening a visit can never reveal more than the
 * timeline said it would.
 */
import {
  CalendarDays,
  MapPin,
  Stethoscope,
  Activity,
  ClipboardList,
  Lock,
  ShieldAlert,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pill } from "@/components/grid";
import { resultsForVisit } from "@/components/VisitDialog";
import { ENCOUNTER_KIND_LABEL, type Encounter } from "@/lib/org";
import { SENSITIVE_LABEL, TIER_LABEL, type CareTier } from "@/lib/access";
import type { Consultation, Facility, Referral, Vital } from "@/lib/api";
import { bandClasses, clockTime, shortDate } from "@/lib/format";

export type Disclosure = "full" | "summary" | "existence";

function longDate(iso: string) {
  return new Date(iso).toLocaleDateString([], {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function bpFlag(systolic: number | null) {
  if (!systolic) return null;
  if (systolic >= 160) return { label: "high — needs attention", cls: bandClasses("critical") };
  if (systolic >= 140) return { label: "above target", cls: bandClasses("high") };
  return { label: "in range", cls: bandClasses("low") };
}

function glucoseFlag(g: number | null) {
  if (g === null) return null;
  if (g >= 11) return { label: "high — needs attention", cls: bandClasses("critical") };
  if (g >= 7.8) return { label: "above target", cls: bandClasses("high") };
  if (g < 4) return { label: "low", cls: bandClasses("high") };
  return { label: "in range", cls: bandClasses("low") };
}

export function VisitDetailDialog({
  encounter,
  onOpenChange,
  facility,
  islandName,
  clinician,
  disclosure,
  restricted,
  sensitivity,
  tier,
  vitals,
  referrals,
  consultations,
  sharedUnderAgreement,
}: {
  encounter: Encounter | null;
  onOpenChange: (open: boolean) => void;
  facility: Facility | undefined;
  islandName: string;
  clinician: string | null;
  disclosure: Disclosure;
  restricted: boolean;
  sensitivity: string | undefined;
  tier: CareTier | null;
  vitals: Vital[];
  referrals: Referral[];
  consultations: Consultation[];
  sharedUnderAgreement: boolean;
}) {
  if (!encounter) return null;

  const consultation = encounter.consultation_id
    ? consultations.find((c) => c.id === encounter.consultation_id)
    : undefined;
  const readings = resultsForVisit(encounter.started_at, vitals).slice(0, 6);
  // A referral raised within a day of the visit reads as this visit's outcome.
  const referral = referrals.find(
    (r) =>
      Math.abs(new Date(r.created_at).getTime() - new Date(encounter.started_at).getTime()) <=
      36 * 3600 * 1000,
  );
  const note = encounter.summary || consultation?.notes || "";
  const plan = consultation?.plan ?? "";

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-[19px]">
            {ENCOUNTER_KIND_LABEL[encounter.kind] ?? encounter.kind} ·{" "}
            {longDate(encounter.started_at)}
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            {facility?.name ?? "Facility"} · {islandName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {encounter.status === "open" ? (
              <Pill className="border-signal/30 bg-signal/10 text-signal">open episode</Pill>
            ) : (
              <Pill className="border-border bg-surface text-muted-foreground">closed</Pill>
            )}
            {sharedUnderAgreement ? (
              <Pill className="border-signal/30 bg-signal/10 text-signal">
                shared under agreement
              </Pill>
            ) : null}
            {tier ? (
              <Pill className="border-border bg-surface text-muted-foreground">
                {TIER_LABEL[tier]}
              </Pill>
            ) : null}
          </div>

          <dl className="grid gap-3 rounded-lg border border-border bg-surface p-3 text-[12.5px] sm:grid-cols-3">
            <div>
              <dt className="flex items-center gap-1.5 text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" /> When
              </dt>
              <dd className="mt-0.5 font-medium">
                {shortDate(encounter.started_at)}
                {encounter.ended_at ? ` — ${shortDate(encounter.ended_at)}` : " — ongoing"}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" /> Where
              </dt>
              <dd className="mt-0.5 font-medium">{facility?.name ?? "Facility"}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-muted-foreground">
                <Stethoscope className="h-3.5 w-3.5" /> Seen by
              </dt>
              <dd className="mt-0.5 font-medium">{clinician ?? "Not recorded"}</dd>
            </div>
          </dl>

          {restricted ? (
            <div className="flex items-start gap-2 rounded-lg border border-high/30 bg-high/5 p-3 text-[13px]">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-high" />
              <div>
                <p className="font-semibold">Restricted entry</p>
                <p className="mt-1 leading-relaxed text-muted-foreground">
                  This episode is filed under{" "}
                  {SENSITIVE_LABEL[sensitivity ?? ""] ?? "a sensitive category"}. You can see that
                  it happened so the record does not look complete, but its content needs the
                  patient's explicit grant for that category.
                </p>
              </div>
            </div>
          ) : disclosure === "existence" ? (
            <p className="rounded-lg border border-border bg-surface p-3 text-[13px] text-muted-foreground">
              A clinical appointment took place. Your role sees appointment history without clinical
              content.
            </p>
          ) : (
            <>
              <section>
                <h3 className="flex items-center gap-2 text-[13px] font-semibold">
                  <ClipboardList className="h-4 w-4 text-primary" /> Reason for the visit
                </h3>
                <p className="mt-1.5 text-[13px] leading-relaxed">{encounter.reason}</p>
              </section>

              <section>
                <h3 className="flex items-center gap-2 text-[13px] font-semibold">
                  <ClipboardList className="h-4 w-4 text-primary" /> Visit note
                </h3>
                {disclosure === "full" ? (
                  <>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                      {note || "No note recorded for this episode yet."}
                    </p>
                    {plan ? (
                      <>
                        <h4 className="mt-3 text-[13px] font-semibold">Care plan</h4>
                        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                          {plan}
                        </p>
                      </>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-1.5 flex items-start gap-2 rounded-lg border border-border bg-surface p-3 text-[12.5px] leading-relaxed text-muted-foreground">
                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      The note is held at {facility?.name ?? "the treating facility"} and sits
                      outside your scope{tier ? ` as ${TIER_LABEL[tier].toLowerCase()}` : ""}.
                      Request it from them, or ask the patient to grant it.
                    </span>
                  </p>
                )}
              </section>

              {readings.length ? (
                <section>
                  <h3 className="flex items-center gap-2 text-[13px] font-semibold">
                    <Activity className="h-4 w-4 text-primary" /> Readings around this visit
                  </h3>
                  <div className="mt-2 divide-y divide-border rounded-lg border border-border">
                    {readings.map((v) => {
                      const bp = bpFlag(v.systolic);
                      const gl = glucoseFlag(v.glucose_mmol ? Number(v.glucose_mmol) : null);
                      return (
                        <div
                          key={v.id}
                          className="flex flex-wrap items-center gap-2 px-3 py-2 text-[12.5px]"
                        >
                          <span className="text-muted-foreground">
                            {shortDate(v.measured_at)} {clockTime(v.measured_at)}
                          </span>
                          {v.systolic ? (
                            <span className="font-medium">
                              {v.systolic}/{v.diastolic} mmHg
                            </span>
                          ) : null}
                          {bp ? <Pill className={bp.cls}>{bp.label}</Pill> : null}
                          {v.glucose_mmol ? (
                            <span className="font-medium">{v.glucose_mmol} mmol/L</span>
                          ) : null}
                          {gl ? <Pill className={gl.cls}>{gl.label}</Pill> : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {referral ? (
                <section>
                  <h3 className="text-[13px] font-semibold">Referral raised</h3>
                  <p className="mt-1.5 text-[13px] text-muted-foreground">
                    {referral.specialty} · {referral.cross_island ? "cross-island" : "on-island"} ·
                    local wait {referral.wait_days_local}d → routed {referral.wait_days_routed}d ·{" "}
                    {referral.status}
                  </p>
                </section>
              ) : null}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
