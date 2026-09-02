import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, ScanText, Plug, CheckCircle2, Copy, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { extractDocument } from "@/lib/documents.functions";
import { apiClientsQuery, documentsQuery, type ExtractedRecord } from "@/lib/prevention";
import { facilitiesQuery, patientsQuery, HERO_PATIENT_ID } from "@/lib/api";
import { Panel, PanelHeader, Pill, Stat, Loading } from "@/components/grid";
import { timeAgo } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
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
        content: "Paper charts and legacy EMRs join the Caribbean coordination layer without replacing anything.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Interop,
});

function Interop() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const docs = useQuery(documentsQuery);
  const clients = useQuery(apiClientsQuery);
  const patients = useQuery(patientsQuery);
  const facilities = useQuery(facilitiesQuery);
  const runExtract = extractDocument;
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("Handwritten clinic card");
  const [patientId, setPatientId] = useState(HERO_PATIENT_ID);
  const [text, setText] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<{ extracted: ExtractedRecord; note: string; id?: string } | null>(null);

  const patientById = useMemo(() => new Map((patients.data ?? []).map((p) => [p.id, p])), [patients.data]);
  const facilityById = useMemo(() => new Map((facilities.data ?? []).map((f) => [f.id, f])), [facilities.data]);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const onFile = async (file: File) => {
    setFileName(file.name);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => setImageDataUrl(String(reader.result));
      reader.readAsDataURL(file);
    } else {
      setImageDataUrl(null);
      setText(await file.text());
    }
  };

  const digitise = useMutation({
    mutationFn: async () => {
      if (!imageDataUrl && text.trim().length < 10) throw new Error("Upload a photo or paste the chart text first.");
      const extraction = await runExtract({
        data: { title, text: text || undefined, imageDataUrl: imageDataUrl ?? undefined },
      });
      const { data, error } = await supabase
        .from("clinical_documents")
        .insert({
          patient_id: patientId,
          title,
          doc_type: imageDataUrl ? "scan" : "transcription",
          source: imageDataUrl ? "paper_scan" : "typed",
          original_text: text.slice(0, 8000),
          extraction_status: extraction.degraded ? "needs_review" : "complete",
          extracted: JSON.parse(JSON.stringify(extraction.extracted)),
          extraction_note: extraction.note,
          uploaded_by: profile?.full_name ?? "Staff",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { ...extraction, id: data.id };
    },
    onSuccess: (r) => {
      setResult({ extracted: r.extracted, note: r.note, id: r.id });
      toast.success("Document digitised");
      void qc.invalidateQueries({ queryKey: ["clinical_documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const commit = useMutation({
    mutationFn: async (payload: { id: string; extracted: ExtractedRecord; patient_id: string }) => {
      const { extracted, patient_id } = payload;
      const jobs: Promise<unknown>[] = [];
      if (extracted.conditions?.length) {
        jobs.push(
          supabase.from("conditions").insert(
            extracted.conditions.map((c) => ({
              patient_id,
              name: c.name,
              diagnosed_on: c.diagnosed && /^\d{4}/.test(c.diagnosed) ? `${c.diagnosed.slice(0, 4)}-01-01` : "2020-01-01",
            })),
          ) as unknown as Promise<unknown>,
        );
      }
      if (extracted.medications?.length) {
        jobs.push(
          supabase.from("medications").insert(
            extracted.medications.map((m) => ({
              patient_id,
              name: m.name,
              dosage: m.dosage ?? "",
              frequency: m.frequency ?? "",
              adherence_pct: 80,
              days_supply_left: 30,
            })),
          ) as unknown as Promise<unknown>,
        );
      }
      if (extracted.vitals?.length) {
        jobs.push(
          supabase.from("vitals").insert(
            extracted.vitals.map((v) => ({
              patient_id,
              measured_at: v.measured_at ? new Date(v.measured_at).toISOString() : new Date().toISOString(),
              systolic: v.systolic ?? null,
              diastolic: v.diastolic ?? null,
              glucose_mmol: v.glucose_mmol ?? null,
              pulse: v.pulse ?? null,
              weight_kg: v.weight_kg ?? null,
              source: "paper_import",
              reported_by: "clinic",
            })),
          ) as unknown as Promise<unknown>,
        );
      }
      await Promise.all(jobs);
      await supabase.from("clinical_documents").update({ committed: true }).eq("id", payload.id);
    },
    onSuccess: () => {
      toast.success("Committed to the patient's chart");
      setResult(null);
      void qc.invalidateQueries({ queryKey: ["clinical_documents"] });
      void qc.invalidateQueries({ queryKey: ["patient-bundle"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Interoperability</p>
        <h1 className="font-display text-[26px] font-semibold tracking-tight">The on-ramp for paper and legacy systems</h1>
        <p className="mt-1 max-w-3xl text-[13.5px] text-muted-foreground">
          A clinic keeping paper cards joins by photographing them. A hospital with an existing EMR joins through a
          FHIR-shaped API. Nobody has to rip out what they already run.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Documents digitised" value={docs.data?.length ?? 0} hint="Paper cards, faxes, lab reports" tone="signal" />
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
          <PanelHeader title="Digitise a paper record" subtitle="Photograph the card or paste the transcription" />
          <div className="space-y-3 px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                Patient
                <select
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13.5px] font-normal normal-case tracking-normal text-foreground"
                >
                  {(patients.data ?? []).slice(0, 200).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                Document title
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13.5px] font-normal normal-case tracking-normal text-foreground"
                />
              </label>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-[13px] font-semibold text-muted-foreground hover:bg-muted/60"
            >
              <FileUp className="h-4 w-4" />
              {fileName ?? "Upload a photo of the clinic card"}
            </button>

            {imageDataUrl ? (
              <img src={imageDataUrl} alt="Uploaded clinic card" className="max-h-52 w-full rounded-lg object-contain" />
            ) : null}

            <label className="block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Or paste what the card says
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                placeholder={"MARLENE CAMPBELL\nHTN dx 2019, T2DM 2021\nBP 156/96 14/02/25\nAmlodipine 10mg od"}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-[12.5px] font-normal normal-case tracking-normal text-foreground"
              />
            </label>

            <button
              onClick={() => digitise.mutate()}
              disabled={digitise.isPending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[13.5px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              <ScanText className="h-4 w-4" />
              {digitise.isPending ? "Reading the record…" : "Read into the chart"}
            </button>

            {result ? (
              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <p className="text-[12.5px] text-muted-foreground">{result.note}</p>
                <ExtractionPreview extracted={result.extracted} />
                {result.id ? (
                  <button
                    onClick={() => commit.mutate({ id: result.id!, extracted: result.extracted, patient_id: patientId })}
                    disabled={commit.isPending}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Commit to the chart
                  </button>
                ) : null}
              </div>
            ) : null}
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
              <Endpoint method="GET" path="/api/public/fhir/metadata" note="Capability statement — no token needed" />
              <Endpoint
                method="GET"
                path="/api/public/fhir/patient/{id}"
                note="Bundle: Patient, Condition, MedicationStatement, Observation, Encounter"
              />
              <Endpoint method="POST" path="/api/public/fhir/observation" note="Push a reading; detection runs on arrival" />
              <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-[11.5px] leading-relaxed text-muted-foreground">
{`curl ${origin}/api/public/fhir/patient/${HERO_PATIENT_ID} \\
  -H "Authorization: Bearer ccg_live_tt7f"`}
              </pre>
            </div>
          </Panel>
        </div>
      </div>

      <Panel>
        <PanelHeader title="Digitised records" subtitle="Everything that came in off paper or fax" />
        {docs.isLoading ? (
          <Loading />
        ) : (
          <div className="divide-y divide-border">
            {(docs.data ?? []).map((d) => (
              <div key={d.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[13.5px] font-semibold">
                    <FileText className="h-4 w-4 text-primary" /> {d.title}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {patientById.get(d.patient_id ?? "")?.full_name ?? "Unassigned"} ·{" "}
                    {facilityById.get(d.facility_id ?? "")?.name ?? "no facility"} · {d.source.replace("_", " ")} ·{" "}
                    {d.uploaded_by}
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
        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">{method}</span>
        <span className="break-all">{path}</span>
      </p>
      <p className="mt-1 font-sans text-[11.5px] text-muted-foreground">{note}</p>
    </div>
  );
}

function ExtractionPreview({ extracted }: { extracted: ExtractedRecord }) {
  const rows: { label: string; values: string[] }[] = [
    { label: "Conditions", values: (extracted.conditions ?? []).map((c) => `${c.name}${c.diagnosed ? ` (${c.diagnosed})` : ""}`) },
    {
      label: "Medications",
      values: (extracted.medications ?? []).map((m) => [m.name, m.dosage, m.frequency].filter(Boolean).join(" ")),
    },
    {
      label: "Readings",
      values: (extracted.vitals ?? []).map((v) =>
        [
          v.systolic ? `${v.systolic}/${v.diastolic ?? "—"} mmHg` : null,
          v.glucose_mmol ? `${v.glucose_mmol} mmol/L` : null,
          v.measured_at,
        ]
          .filter(Boolean)
          .join(" · "),
      ),
    },
    { label: "Labs", values: (extracted.labs ?? []).map((l) => `${l.name} ${l.value}${l.unit ? ` ${l.unit}` : ""}`) },
  ].filter((r) => r.values.length > 0);

  if (rows.length === 0) return null;
  return (
    <div className="mt-3 space-y-2">
      {rows.map((r) => (
        <div key={r.label}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{r.label}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {r.values.map((v) => (
              <Pill key={v} className="border-primary/30 bg-primary/5 text-foreground">
                {v}
              </Pill>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
