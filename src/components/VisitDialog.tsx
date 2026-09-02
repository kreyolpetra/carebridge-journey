import { CalendarDays, MapPin, Stethoscope, Activity, FlaskConical, Pill as PillIcon, ClipboardList } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pill } from "@/components/grid";
import { bandClasses, severityClasses, clockTime, timeAgo } from "@/lib/format";
import type { Consultation, Medication, Provider, Referral, TriageEvent, Vital } from "@/lib/api";

type Props = {
  visit: Consultation | null;
  onOpenChange: (open: boolean) => void;
  provider: Provider | undefined;
  vitals: Vital[];
  triage: TriageEvent[];
  referral: Referral | undefined;
  medications: Medication[];
};

function longDate(iso: string) {
  return new Date(iso).toLocaleDateString([], {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Readings taken within 3 days of the visit read as that visit's results. */
export function resultsForVisit(scheduledAt: string, vitals: Vital[]) {
  const t = new Date(scheduledAt).getTime();
  const window = 3 * 24 * 60 * 60 * 1000;
  return vitals
    .filter((v) => Math.abs(new Date(v.measured_at).getTime() - t) <= window)
    .sort((a, b) => +new Date(b.measured_at) - +new Date(a.measured_at));
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

export function VisitDialog({ visit, onOpenChange, provider, vitals, triage, referral, medications }: Props) {
  if (!visit) return null;
  const when = new Date(visit.scheduled_at);
  const upcoming = when.getTime() > Date.now();
  const results = resultsForVisit(visit.scheduled_at, vitals);
  const relatedTriage = triage
    .filter((t) => +new Date(t.created_at) <= +when + 24 * 60 * 60 * 1000)
    .slice(0, 2);

  return (
    <Dialog open={!!visit} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[16px]">
            <CalendarDays className="h-4 w-4 text-primary" />
            Visit on {longDate(visit.scheduled_at)}
          </DialogTitle>
          <DialogDescription>
            {clockTime(visit.scheduled_at)} · {upcoming ? "coming up" : timeAgo(visit.scheduled_at)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Pill className={bandClasses(upcoming ? "moderate" : "low")}>{upcoming ? "upcoming" : visit.status}</Pill>
            {referral?.cross_island ? (
              <Pill className={bandClasses("moderate")}>seen from another island</Pill>
            ) : null}
            {referral ? <Pill className={bandClasses("low")}>{referral.specialty}</Pill> : null}
          </div>

          <section className="rounded-xl border border-border p-4">
            <h3 className="flex items-center gap-2 text-[13px] font-semibold">
              <Stethoscope className="h-4 w-4 text-primary" /> Who you saw
            </h3>
            <p className="mt-1.5 text-[13px]">{provider?.full_name ?? "Care team"}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {provider ? `${provider.specialty} · ${provider.island_code}` : "CariCare Grid clinic"}
            </p>
          </section>

          <section className="rounded-xl border border-border p-4">
            <h3 className="flex items-center gap-2 text-[13px] font-semibold">
              <ClipboardList className="h-4 w-4 text-primary" /> Visit notes
            </h3>
            <p className="mt-1.5 text-[13px] leading-relaxed">
              {visit.notes || (upcoming ? "Notes will appear here after your appointment." : "No notes recorded.")}
            </p>
            <h3 className="mt-4 text-[13px] font-semibold">Care plan</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed">
              {visit.plan || (upcoming ? "Your plan will be agreed at the visit." : "No plan recorded.")}
            </p>
          </section>

          <section className="rounded-xl border border-border p-4">
            <h3 className="flex items-center gap-2 text-[13px] font-semibold">
              <FlaskConical className="h-4 w-4 text-primary" /> Results around this visit
            </h3>
            {results.length === 0 ? (
              <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                No readings were recorded within three days of this visit.
              </p>
            ) : (
              <div className="mt-2 divide-y divide-border">
                {results.map((v) => {
                  const bp = bpFlag(v.systolic);
                  const g = glucoseFlag(v.glucose_mmol === null ? null : Number(v.glucose_mmol));
                  return (
                    <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div className="text-[12.5px]">
                        <span className="font-semibold">
                          {new Date(v.measured_at).toLocaleDateString([], { day: "numeric", month: "short" })}
                        </span>{" "}
                        <span className="text-muted-foreground">· {v.source.replace("_", " ")}</span>
                        <div className="mt-0.5 flex flex-wrap gap-3 text-muted-foreground">
                          {v.systolic ? (
                            <span>
                              BP {v.systolic}/{v.diastolic ?? "—"} mmHg
                            </span>
                          ) : null}
                          {v.glucose_mmol !== null ? <span>Glucose {Number(v.glucose_mmol).toFixed(1)} mmol/L</span> : null}
                          {v.pulse ? <span>Pulse {v.pulse} bpm</span> : null}
                          {v.weight_kg !== null && v.weight_kg !== undefined ? (
                            <span>Weight {Number(v.weight_kg).toFixed(1)} kg</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        {bp ? <Pill className={bp.cls}>BP {bp.label}</Pill> : null}
                        {g ? <Pill className={g.cls}>sugar {g.label}</Pill> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {relatedTriage.length > 0 ? (
            <section className="rounded-xl border border-border p-4">
              <h3 className="flex items-center gap-2 text-[13px] font-semibold">
                <Activity className="h-4 w-4 text-primary" /> Why this visit happened
              </h3>
              <div className="mt-2 space-y-2">
                {relatedTriage.map((t) => (
                  <div key={t.id}>
                    <div className="flex items-center gap-2">
                      <Pill className={severityClasses(t.severity)}>{t.severity.replace("_", " ")}</Pill>
                      <span className="text-[12.5px] font-semibold">{t.category}</span>
                    </div>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{t.rationale}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {medications.length > 0 ? (
            <section className="rounded-xl border border-border p-4">
              <h3 className="flex items-center gap-2 text-[13px] font-semibold">
                <PillIcon className="h-4 w-4 text-primary" /> Medications at this visit
              </h3>
              <ul className="mt-2 space-y-1 text-[12.5px] text-muted-foreground">
                {medications.map((m) => (
                  <li key={m.id}>
                    <span className="font-semibold text-foreground">
                      {m.name} {m.dosage}
                    </span>{" "}
                    · {m.frequency}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {referral ? (
            <section className="rounded-xl border border-border p-4 text-[12.5px] text-muted-foreground">
              Referred for <span className="font-semibold text-foreground">{referral.specialty}</span> — {referral.reason}.
              You waited {referral.wait_days_routed} days instead of {referral.wait_days_local}.
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
