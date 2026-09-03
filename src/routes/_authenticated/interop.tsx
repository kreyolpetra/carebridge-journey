import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plug, Copy, FileText } from "lucide-react";
import { apiClientsQuery, documentsQuery } from "@/lib/prevention";
import { facilitiesQuery, patientsQuery, HERO_PATIENT_ID } from "@/lib/api";
import { Panel, PanelHeader, Pill, Stat, Loading } from "@/components/grid";
import { DigitiseRecord } from "@/components/patient/DigitiseRecord";
import { timeAgo } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/interop")({
  head: () => ({
    meta: [
      { title: "Record On-Ramp & Open API — Get Every Clinic In | CariCare Grid" },
      {
        name: "description",
        content:
          "Photograph a paper clinic card and the Grid reads it into structured fields. Existing hospital systems connect through a FHIR-shaped API with scoped, revocable tokens.",
      },
      { property: "og:title", content: "Record On-Ramp & Open API — CariCare Grid" },
      {
        property: "og:description",
        content:
          "Paper charts and legacy EMRs join the Caribbean coordination layer without replacing anything.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Interop,
});

export function Interop() {
  const docs = useQuery(documentsQuery);
  const clients = useQuery(apiClientsQuery);
  const patients = useQuery(patientsQuery);
  const facilities = useQuery(facilitiesQuery);

  const [patientId, setPatientId] = useState(HERO_PATIENT_ID);

  const patientById = useMemo(
    () => new Map((patients.data ?? []).map((p) => [p.id, p])),
    [patients.data],
  );
  const facilityById = useMemo(
    () => new Map((facilities.data ?? []).map((f) => [f.id, f])),
    [facilities.data],
  );
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          Interoperability
        </p>
        <h1 className="font-display text-[26px] font-semibold tracking-tight">
          The on-ramp for paper and legacy systems
        </h1>
        <p className="mt-1 max-w-3xl text-[13.5px] text-muted-foreground">
          A clinic keeping paper cards joins by photographing them. A hospital with an existing EMR
          joins through a FHIR-shaped API. Nobody has to rip out what they already run.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Documents digitised"
          value={docs.data?.length ?? 0}
          hint="Paper cards, faxes, lab reports"
          tone="signal"
        />
        <Stat
          label="Committed to charts"
          value={(docs.data ?? []).filter((d) => d.committed).length}
          hint="Structured and searchable"
          tone="low"
        />
        <Stat
          label="Connected systems"
          value={(clients.data ?? []).filter((c) => c.status === "active").length}
          hint="Live partner integrations"
        />
        <Stat
          label="API calls (30d)"
          value={(clients.data ?? []).reduce((n, c) => n + c.calls_30d, 0).toLocaleString()}
          hint="Every one written to the access log"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Panel>
          <PanelHeader
            title="Digitise a paper record"
            subtitle="Photograph the card or paste the transcription"
          />
          <div className="space-y-3 px-5 py-4">
            {/* The bulk case: a clerk working through a stack of cards, who has
                to say whose card this is. From inside a chart the patient is
                already known and this picker does not appear. */}
            <label className="block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Patient
              <select
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13.5px] font-normal normal-case tracking-normal text-foreground"
              >
                {(patients.data ?? []).slice(0, 200).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} · {p.mrn}
                  </option>
                ))}
              </select>
            </label>
            <DigitiseRecord
              key={patientId}
              patientId={patientId}
              patientName={patientById.get(patientId)?.full_name}
            />
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Connected systems" subtitle="Scoped, revocable, fully logged" />
            <div className="divide-y divide-border">
              {(clients.data ?? []).map((c) => (
                <div key={c.id} className="px-5 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-[13.5px] font-semibold">
                        <Plug className="h-4 w-4 text-primary" /> {c.name}
                      </p>
                      <p className="text-[12px] text-muted-foreground">
                        {c.organisation} · {c.island_code ?? "regional"} · {c.system_kind}
                      </p>
                    </div>
                    <Pill
                      className={
                        c.status === "active"
                          ? "border-low/40 bg-low/10 text-low"
                          : "border-border bg-muted text-muted-foreground"
                      }
                    >
                      {c.status}
                    </Pill>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {c.scopes.map((s) => (
                      <Pill key={s} className="border-border bg-muted text-muted-foreground">
                        {s}
                      </Pill>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                    token {c.token_prefix}… ·{" "}
                    {c.last_used_at ? `last call ${timeAgo(c.last_used_at)}` : "never used"} ·{" "}
                    {c.calls_30d.toLocaleString()} calls / 30d
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Open API"
              subtitle="FHIR-shaped, documented, live right now"
              right={
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(`${origin}/api/public/fhir/metadata`);
                    toast.success("Endpoint copied");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[12px] font-semibold hover:bg-muted"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
              }
            />
            <div className="space-y-3 px-5 py-4 font-mono text-[12px]">
              <Endpoint
                method="GET"
                path="/api/public/fhir/metadata"
                note="Capability statement — no token needed"
              />
              <Endpoint
                method="GET"
                path="/api/public/fhir/patient/{id}"
                note="Bundle: Patient, Condition, MedicationStatement, Observation, Encounter"
              />
              <Endpoint
                method="POST"
                path="/api/public/fhir/observation"
                note="Push a reading; detection runs on arrival"
              />
              <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-[11.5px] leading-relaxed text-muted-foreground">
                {`curl ${origin}/api/public/fhir/patient/${HERO_PATIENT_ID} \\
  -H "Authorization: Bearer ccg_live_tt7f"`}
              </pre>
            </div>
          </Panel>
        </div>
      </div>

      <Panel>
        <PanelHeader
          title="Digitised records"
          subtitle="Everything that came in off paper or fax"
        />
        {docs.isLoading ? (
          <Loading />
        ) : (
          <div className="divide-y divide-border">
            {(docs.data ?? []).map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[13.5px] font-semibold">
                    <FileText className="h-4 w-4 text-primary" /> {d.title}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {patientById.get(d.patient_id ?? "")?.full_name ?? "Unassigned"} ·{" "}
                    {facilityById.get(d.facility_id ?? "")?.name ?? "no facility"} ·{" "}
                    {d.source.replace("_", " ")} · {d.uploaded_by}
                  </p>
                  <p className="text-[12px] text-muted-foreground">{d.extraction_note}</p>
                </div>
                <div className="shrink-0 text-right">
                  <Pill
                    className={
                      d.committed
                        ? "border-low/40 bg-low/10 text-low"
                        : "border-high/40 bg-high/10 text-high"
                    }
                  >
                    {d.committed ? "in the chart" : "needs review"}
                  </Pill>
                  <p className="mt-1 text-[11px] text-muted-foreground">{timeAgo(d.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function Endpoint({ method, path, note }: { method: string; path: string; note: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">
          {method}
        </span>
        <span className="break-all">{path}</span>
      </p>
      <p className="mt-1 font-sans text-[11.5px] text-muted-foreground">{note}</p>
    </div>
  );
}
