/**
 * One patient, at a stable address.
 *
 * The chart used to exist only as a pane inside the clinician console, reachable
 * as /clinician?patient=<id> — nothing you could link to from a referral, an
 * access-log row, or a search result. This is that page.
 *
 * Identity is shown whether or not a basis resolves: you are allowed to know
 * that the person you searched for exists and that you have the right one. The
 * record is not. When no basis resolves this renders the identity header and
 * the refusal, and the bundle is never fetched.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Stethoscope } from "lucide-react";
import { patientBundleQuery, patientsQuery, providersQuery } from "@/lib/api";
import { useAccessDecision } from "@/lib/access-basis";
import { useLogRecordAccess } from "@/lib/audit";
import { PatientChart } from "@/components/patient/PatientChart";
import { NoBasisPanel } from "@/components/patient/NoBasisPanel";
import { Panel, Loading } from "@/components/grid";

export const Route = createFileRoute("/_authenticated/patients_/$patientId")({
  head: () => ({
    meta: [
      { title: "Patient record — CariCare Grid" },
      {
        name: "description",
        content:
          "One patient's longitudinal record, assembled across facilities and opened only under a resolved lawful basis.",
      },
    ],
  }),
  component: PatientProfile,
});

function PatientProfile() {
  const { patientId } = Route.useParams();
  const patients = useQuery(patientsQuery);
  const providers = useQuery(providersQuery);
  const decision = useAccessDecision(patientId);

  const bundle = useQuery({
    ...patientBundleQuery(patientId),
    enabled: decision?.allowed === true,
  });

  useLogRecordAccess(patientId, "Full clinical record (patient profile)", decision);

  const patient = (patients.data ?? []).find((p) => p.id === patientId) ?? null;
  const b = bundle.data;

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-8">
      <Link
        to="/patients"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All patients
      </Link>

      {!decision ? (
        <Panel>
          <Loading label="Resolving your access to this record…" />
        </Panel>
      ) : !decision.allowed ? (
        <div className="space-y-4">
          {/* Identity without the record. Knowing you have found the right
              person is not the same as reading their chart, and a clinician
              who cannot confirm identity cannot sensibly request access. */}
          {patient ? (
            <Panel className="p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface text-muted-foreground">
                  <Stethoscope className="h-5 w-5" />
                </span>
                <div>
                  <h1 className="font-display text-[19px] font-semibold tracking-tight">
                    {patient.full_name}
                  </h1>
                  <p className="text-[12.5px] text-muted-foreground">
                    {patient.age}
                    {patient.sex} · {patient.parish}, {patient.island_code} · speaks{" "}
                    {patient.language}
                  </p>
                </div>
              </div>
            </Panel>
          ) : null}
          <NoBasisPanel
            patientId={patientId}
            patientName={patient?.full_name}
            patientMrn={patient?.mrn}
            decision={decision}
          />
        </div>
      ) : !b ? (
        <Panel>
          <Loading label="Assembling the longitudinal record…" />
        </Panel>
      ) : (
        <div className="space-y-4">
          <PatientChart bundle={b} decision={decision} providers={providers.data ?? []} />
          <Panel className="p-4">
            <Link
              to="/clinician"
              search={{ patient: patientId }}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary"
            >
              <Stethoscope className="h-3.5 w-3.5" />
              Open in the clinician console for the consult brief and teleconsult
            </Link>
          </Panel>
        </div>
      )}
    </div>
  );
}
