/**
 * The health summary, on the patient's own home.
 *
 * This was its own page behind its own menu item, which asked a patient to
 * understand that "my health" and "my health summary" were different places.
 * They are not — one is the screen you read and the other is the same facts in
 * a form you can carry out of the building, and a menu is the wrong place to
 * explain that difference.
 *
 * So it lives at the foot of the home screen now. The print stylesheet drops
 * everything marked screen-only, which is the rest of the home, so printing
 * from here still produces the one-page document a clinician can read when
 * they cannot open CareBridge at all.
 */
import { useQuery } from "@tanstack/react-query";
import { patientBundleQuery, providersQuery } from "@/lib/api";
import { isGrantActive } from "@/lib/access";
import { useAuth } from "@/hooks/useAuth";
import { Loading, Pill, Stat } from "@/components/grid";
import {
  ReportShell,
  ReportSection,
  ReportTable,
  downloadCsv,
} from "@/components/reports/ReportShell";
import { bandClasses, shortDate, timeAgo, LANGUAGE_LABEL } from "@/lib/format";

const LAST_90 = `${shortDate(new Date(Date.now() - 90 * 86400000).toISOString())} – ${shortDate(new Date().toISOString())} (90 days)`;

export function HealthSummary() {
  const { profile } = useAuth();
  const id = profile?.patient_id ?? "";
  const bundle = useQuery({ ...patientBundleQuery(id), enabled: Boolean(id) });
  const providers = useQuery(providersQuery);
  const b = bundle.data;

  if (!b) return <Loading label="Assembling your summary…" />;

  const providerName = (pid: string | null) =>
    (providers.data ?? []).find((p) => p.id === pid)?.full_name ?? "Unassigned";
  const latest = b.vitals[0];

  return (
    <ReportShell
      title="My health summary"
      subtitle="Everything a clinician needs if you walk into a clinic that cannot open CareBridge: your conditions, your medicines, your recent readings and who is treating you."
      period={LAST_90}
      onExport={() =>
        downloadCsv("my-health-summary.csv", [
          ["Section", "Item", "Detail"],
          ...b.conditions.map((c) => ["Condition", c.name, c.diagnosed_on ?? ""]),
          ...b.medications.map((m) => ["Medication", m.name, `${m.dosage} ${m.frequency}`]),
          ...b.vitals
            .slice(0, 30)
            .map((v) => [
              "Reading",
              v.measured_at,
              `${v.systolic ?? "—"}/${v.diastolic ?? "—"} mmHg${v.glucose_mmol ? `, ${v.glucose_mmol} mmol/L` : ""}`,
            ]),
        ])
      }
    >
      <ReportSection
        title="Who I am"
        note="Take this to any clinic — it does not need a connection to be read."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Name"
            value={b.patient.full_name}
            hint={`${b.patient.age}${b.patient.sex}`}
          />
          <Stat
            label="Record number"
            value={b.patient.mrn}
            hint={`Born ${shortDate(b.patient.date_of_birth)}`}
          />
          <Stat
            label="Where I live"
            value={`${b.patient.parish}`}
            hint={`${b.patient.island_code} · ${b.patient.km_to_facility} km from care`}
          />
          <Stat
            label="Language"
            value={LANGUAGE_LABEL[b.patient.language] ?? b.patient.language}
            hint={b.patient.insurer ?? "Uninsured"}
          />
        </div>
      </ReportSection>

      <ReportSection title="My conditions" note="What I am being treated for.">
        <ReportTable
          head={["Condition", "Since"]}
          rows={b.conditions.map((c) => [c.name, c.diagnosed_on ? shortDate(c.diagnosed_on) : "—"])}
          empty="No long-term conditions recorded."
        />
      </ReportSection>

      <ReportSection title="My medicines" note="Doses, and how much supply is left.">
        <ReportTable
          head={["Medicine", "Dose", "How often", "Days left"]}
          rows={b.medications.map((m) => [m.name, m.dosage, m.frequency, m.days_supply_left])}
          empty="No medications recorded."
        />
      </ReportSection>

      <ReportSection
        title="My recent readings"
        note={latest ? `Most recent taken ${timeAgo(latest.measured_at)}.` : "No readings yet."}
      >
        <ReportTable
          head={["When", "Blood pressure", "Blood sugar"]}
          rows={b.vitals
            .slice(0, 10)
            .map((v) => [
              shortDate(v.measured_at),
              v.systolic ? `${v.systolic}/${v.diastolic ?? "—"}` : "—",
              v.glucose_mmol ? Number(v.glucose_mmol).toFixed(1) : "—",
            ])}
          empty="No readings sent yet."
        />
      </ReportSection>

      <ReportSection title="Who is treating me" note="And who I have given access to my record.">
        <ReportTable
          head={["Who", "Purpose", "Status"]}
          rows={b.grants.map((g) => [
            providerName(g.provider_id),
            g.purpose,
            <Pill className={bandClasses(isGrantActive(g.status) ? "low" : "moderate")}>
              {g.status}
            </Pill>,
          ])}
          empty="Nobody outside your clinic has access."
        />
      </ReportSection>
    </ReportShell>
  );
}
