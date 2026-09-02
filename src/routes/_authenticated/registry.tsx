import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Upload, Download, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { islandsQuery, patientsQuery } from "@/lib/api";
import { Panel, PanelHeader, Pill, Stat, Loading } from "@/components/grid";
import { useAuth } from "@/hooks/useAuth";
import {
  parseCsv,
  toCsv,
  downloadCsv,
  validatePatientRow,
  validateStaffRow,
  PATIENT_TEMPLATE_HEADERS,
  STAFF_TEMPLATE_HEADERS,
  type RowResult,
} from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/registry")({
  head: () => ({
    meta: [
      { title: "Registry & Import — Onboard Patients and Staff | CariCare Grid" },
      {
        name: "description",
        content:
          "Add patients and staff by hand or import a roster by CSV. The realistic on-ramp for clinics whose records are on paper or in spreadsheets.",
      },
    ],
  }),
  component: RegistryPage,
});

const MAX_ROWS = 250;

export function RegistryPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const patients = useQuery(patientsQuery);
  const islands = useQuery(islandsQuery);
  const patientFileRef = useRef<HTMLInputElement>(null);
  const staffFileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<"patients" | "staff">("patients");
  const [results, setResults] = useState<{ kind: string; ok: number; failed: RowResult[] } | null>(null);
  const [csvPreview, setCsvPreview] = useState<{ title: string; text: string } | null>(null);

  // Manual patient form
  const [mrn, setMrn] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [islandCode, setIslandCode] = useState("HT");
  const [parish, setParish] = useState("");
  const [language, setLanguage] = useState("ht");

  // Manual staff form
  const [staffName, setStaffName] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffRole, setStaffRole] = useState("clinician");

  const knownIslands = useMemo(
    () => new Set((islands.data ?? []).map((i) => i.code)),
    [islands.data],
  );

  const byIsland = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of patients.data ?? []) counts.set(p.island_code, (counts.get(p.island_code) ?? 0) + 1);
    return (islands.data ?? [])
      .map((i) => ({ code: i.code, name: i.name, tier: i.tier, count: counts.get(i.code) ?? 0 }))
      .sort((a, b) => b.count - a.count);
  }, [patients.data, islands.data]);

  /** Every registry write leaves an audit row — including the ones that fail. */
  const audit = async (resource: string, allowed: boolean, detail: string) => {
    await supabase.from("consent_access_log").insert({
      patient_id: null,
      provider_id: null,
      grant_id: null,
      resource,
      allowed,
      accessed_at: new Date().toISOString(),
      basis: "administrative",
      tier: profile?.primary_role ?? "unknown",
      actor_name: profile?.full_name ?? "Unknown actor",
      sensitive_category: null,
      break_glass_id: null,
      facility_id: profile?.facility_id ?? null,
      detail,
    });
  };

  const addPatient = useMutation({
    mutationFn: async () => {
      const row = validatePatientRow(
        {
          mrn,
          first_name: firstName,
          last_name: lastName,
          date_of_birth: dob,
          island_code: islandCode,
          parish,
          language,
        },
        1,
        knownIslands,
      );
      if (!row.ok) throw new Error(row.error);

      const existing = (patients.data ?? []).find((p) => (p as { mrn?: string }).mrn === mrn);
      if (existing) throw new Error(`MRN ${mrn} already exists on the Grid`);

      const { conditions, ...patientFields } = row.value as Record<string, unknown> & { conditions: string[] };
      const { data: created, error } = await supabase.from("patients").insert(patientFields).select().single();
      if (error) throw new Error(error.message);

      for (const name of conditions) {
        await supabase.from("conditions").insert({ patient_id: created.id, name, diagnosed_on: null, sensitivity: "standard" });
      }
      await audit("patient.create", true, `Created ${patientFields.full_name} (${mrn})`);
      return created;
    },
    onSuccess: (created) => {
      toast.success(`${created.full_name} added to the registry`);
      setMrn(""); setFirstName(""); setLastName(""); setDob(""); setParish("");
      void qc.invalidateQueries();
    },
    onError: async (e: Error) => {
      await audit("patient.create", false, e.message);
      toast.error(e.message);
    },
  });

  const addStaff = useMutation({
    mutationFn: async () => {
      const row = validateStaffRow(
        { name: staffName, email: staffEmail, role: staffRole, island_code: islandCode },
        1,
        knownIslands,
      );
      if (!row.ok) throw new Error(row.error);
      // Staff added through the registry by their own facility are verified by
      // that act — a named admin vouched for them — so they skip the pending
      // queue that self-signup lands in.
      const { error } = await supabase.from("profiles").insert({ ...row.value, verification_status: "verified" } as never);
      if (error) throw new Error(error.message);
      await audit("staff.create", true, `Created ${staffName} (${staffRole})`);
    },
    onSuccess: () => {
      toast.success(`${staffName} added`);
      setStaffName(""); setStaffEmail("");
      void qc.invalidateQueries();
    },
    onError: async (e: Error) => {
      await audit("staff.create", false, e.message);
      toast.error(e.message);
    },
  });

  const importCsv = async (file: File, kind: "patients" | "staff") => {
    const text = await file.text();
    const { rows } = parseCsv(text);

    if (rows.length === 0) {
      toast.error("No data rows found in that file");
      return;
    }
    if (rows.length > MAX_ROWS) {
      toast.error(`${rows.length} rows — this import accepts ${MAX_ROWS} at a time`);
      return;
    }

    const validated = rows.map((row, idx) =>
      kind === "patients"
        ? validatePatientRow(row, idx + 2, knownIslands)
        : validateStaffRow(row, idx + 2, knownIslands),
    );

    const good = validated.filter((r) => r.ok);
    const failed = validated.filter((r) => !r.ok);

    // Valid rows are written even when others fail. A clerk importing a ward
    // roster should not lose 240 good records to 10 bad ones.
    let written = 0;
    for (const r of good) {
      try {
        if (kind === "patients") {
          const { conditions, ...fields } = r.value as Record<string, unknown> & { conditions: string[] };
          const { data: created, error } = await supabase.from("patients").insert(fields).select().single();
          if (error) throw new Error(error.message);
          for (const name of conditions ?? []) {
            await supabase.from("conditions").insert({ patient_id: created.id, name, diagnosed_on: null, sensitivity: "standard" });
          }
        } else {
          const { error } = await supabase.from("profiles").insert({ ...r.value, verification_status: "verified" } as never);
          if (error) throw new Error(error.message);
        }
        written++;
      } catch (e) {
        failed.push({ line: r.line, ok: false, error: e instanceof Error ? e.message : "write failed" });
      }
    }

    await audit(`${kind}.import`, failed.length === 0, `${written} imported, ${failed.length} rejected`);
    setResults({ kind, ok: written, failed });
    void qc.invalidateQueries();
    toast[failed.length ? "warning" : "success"](
      `${written} ${kind} imported${failed.length ? `, ${failed.length} rejected` : ""}`,
    );
  };

  // Downloads are inert inside a published-artifact viewer — the anchor click
  // does not throw, it simply does nothing. So the CSV is always shown on
  // screen to copy as well; that path works everywhere.
  const template = (kind: "patients" | "staff") => {
    const headers = kind === "patients" ? PATIENT_TEMPLATE_HEADERS : STAFF_TEMPLATE_HEADERS;
    const example =
      kind === "patients"
        ? [{ mrn: "HT-2026-0001", first_name: "Mirlande", last_name: "Pierre", date_of_birth: "1972-04-18", sex: "F", phone: "+50937000000", island_code: "HT", parish: "Ouest", language: "ht", conditions: "Hypertension;Type 2 Diabetes" }]
        : [{ name: "Dr. Jean Baptiste", email: "jbaptiste@example.ht", role: "clinician", island_code: "HT", facility: "Hôpital Universitaire" }];
    const csv = toCsv(headers, example);
    downloadCsv(`caricare-${kind}-template.csv`, csv);
    setCsvPreview({ title: `${kind} template`, text: csv });
  };

  const exportPatients = () => {
    const headers = ["mrn", "full_name", "age", "sex", "island_code", "parish", "language"];
    const csv = toCsv(headers, (patients.data ?? []) as unknown as Record<string, unknown>[]);
    downloadCsv("caricare-patient-registry.csv", csv);
    setCsvPreview({ title: `patient registry (${patients.data?.length ?? 0} rows)`, text: csv });
  };

  if (patients.isLoading || islands.isLoading) return <Loading label="Loading registry" />;

  return (
    <div className="page">
      <header className="mb-5">
        <p className="eyebrow">Registry &amp; onboarding</p>
        <h1 className="font-display text-3xl font-bold tracking-tight">Get a clinic onto the Grid</h1>
        <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-muted-foreground">
          Most clinics in this region keep records on paper or in a spreadsheet, not in a system with an API.
          Bulk CSV import is the realistic first step — and the only one that works where an integration
          engine never will. Rows are validated individually, so a bad line rejects itself instead of the file.
        </p>
      </header>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Patients on the Grid" value={(patients.data?.length ?? 0).toLocaleString()} hint="Across all countries" />
        <Stat label="Countries" value={islands.data?.length ?? 0} hint="Connected health systems" tone="signal" />
        <Stat label="Rows per import" value={MAX_ROWS} hint="Validated line by line" />
        <Stat
          label="Largest cohort"
          value={byIsland[0]?.code ?? "—"}
          hint={`${byIsland[0]?.count ?? 0} patients`}
          tone="low"
        />
      </div>

      <div className="mb-4 flex gap-2">
        {(["patients", "staff"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "rounded-lg border px-4 py-2 text-[13.5px] font-medium capitalize transition-colors " +
              (tab === t
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-surface")
            }
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-4">
          {tab === "patients" ? (
            <Panel>
              <PanelHeader title="Add a patient" subtitle="One record, entered by hand" />
              <div className="grid gap-3 p-5 sm:grid-cols-2">
                <Field label="MRN" value={mrn} onChange={setMrn} placeholder="HT-2026-0001" />
                <Field label="Date of birth" value={dob} onChange={setDob} placeholder="1972-04-18" />
                <Field label="First name" value={firstName} onChange={setFirstName} placeholder="Mirlande" />
                <Field label="Last name" value={lastName} onChange={setLastName} placeholder="Pierre" />
                <label className="grid gap-1.5">
                  <span className="text-[12px] font-medium text-muted-foreground">Country</span>
                  <select
                    value={islandCode}
                    onChange={(e) => setIslandCode(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-[13.5px]"
                  >
                    {(islands.data ?? []).map((i) => (
                      <option key={i.code} value={i.code}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Field label="Parish / department" value={parish} onChange={setParish} placeholder="Ouest" />
                <label className="grid gap-1.5">
                  <span className="text-[12px] font-medium text-muted-foreground">Language</span>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-[13.5px]"
                  >
                    <option value="ht">Haitian Kreyòl</option>
                    <option value="fr">French</option>
                    <option value="en">English</option>
                    <option value="jam">Jamaican Patois</option>
                    <option value="fr-cr">Kwéyòl</option>
                    <option value="es">Spanish</option>
                  </select>
                </label>
                <div className="flex items-end">
                  <button
                    onClick={() => addPatient.mutate()}
                    disabled={addPatient.isPending}
                    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-[13.5px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    <UserPlus className="h-4 w-4" />
                    {addPatient.isPending ? "Adding…" : "Add patient"}
                  </button>
                </div>
              </div>
            </Panel>
          ) : (
            <Panel>
              <PanelHeader title="Add a staff member" subtitle="Directory entry and workspace role" />
              <div className="grid gap-3 p-5 sm:grid-cols-2">
                <Field label="Full name" value={staffName} onChange={setStaffName} placeholder="Dr. Jean Baptiste" />
                <Field label="Email" value={staffEmail} onChange={setStaffEmail} placeholder="jbaptiste@example.ht" />
                <label className="grid gap-1.5">
                  <span className="text-[12px] font-medium text-muted-foreground">Role</span>
                  <select
                    value={staffRole}
                    onChange={(e) => setStaffRole(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-[13.5px]"
                  >
                    <option value="clinician">Clinician</option>
                    <option value="ministry">Ministry / public health</option>
                    <option value="insurer">Insurer</option>
                    <option value="admin">Administrator</option>
                  </select>
                </label>
                <div className="flex items-end">
                  <button
                    onClick={() => addStaff.mutate()}
                    disabled={addStaff.isPending}
                    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-[13.5px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    <UserPlus className="h-4 w-4" />
                    {addStaff.isPending ? "Adding…" : "Add staff"}
                  </button>
                </div>
              </div>
            </Panel>
          )}

          <Panel>
            <PanelHeader
              title={`Import ${tab} by CSV`}
              subtitle={`Up to ${MAX_ROWS} rows. Quoted fields, embedded commas and CRLF are handled.`}
            />
            <div className="p-5">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => (tab === "patients" ? patientFileRef : staffFileRef).current?.click()}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-[13.5px] font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Upload className="h-4 w-4" /> Choose CSV
                </button>
                <button
                  onClick={() => template(tab)}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-[13.5px] font-medium hover:bg-surface"
                >
                  <FileSpreadsheet className="h-4 w-4" /> Download template
                </button>
                {tab === "patients" && (
                  <button
                    onClick={exportPatients}
                    className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-[13.5px] font-medium hover:bg-surface"
                  >
                    <Download className="h-4 w-4" /> Export registry
                  </button>
                )}
              </div>

              <input
                ref={patientFileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importCsv(f, "patients");
                  e.target.value = "";
                }}
              />
              <input
                ref={staffFileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importCsv(f, "staff");
                  e.target.value = "";
                }}
              />

              <div className="mt-4 rounded-lg border border-border bg-surface p-3">
                <p className="text-[12px] font-medium text-muted-foreground">Required columns</p>
                <code className="mt-1 block break-all font-mono text-[12px] text-foreground">
                  {(tab === "patients" ? PATIENT_TEMPLATE_HEADERS : STAFF_TEMPLATE_HEADERS).join(", ")}
                </code>
                {tab === "patients" && (
                  <p className="mt-2 text-[12px] text-muted-foreground">
                    <code className="font-mono">date_of_birth</code> must be <code className="font-mono">YYYY-MM-DD</code>.
                    Multiple conditions are separated by <code className="font-mono">;</code>.
                  </p>
                )}
              </div>

              {csvPreview && (
                <div className="mt-4 rounded-lg border border-border">
                  <div className="flex items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2">
                    <span className="text-[12.5px] font-medium">
                      {csvPreview.title} — copy from here if the download did not start
                    </span>
                    <button
                      onClick={() => setCsvPreview(null)}
                      className="text-[12px] text-muted-foreground hover:text-foreground"
                    >
                      Dismiss
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={csvPreview.text}
                    onFocus={(e) => e.currentTarget.select()}
                    className="h-32 w-full resize-y bg-background p-3 font-mono text-[11.5px] leading-relaxed outline-none"
                  />
                </div>
              )}

              {results && (
                <div className="mt-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-low" />
                    <span className="text-[13.5px] font-medium">{results.ok} imported</span>
                    {results.failed.length > 0 && (
                      <>
                        <AlertTriangle className="ml-2 h-4 w-4 text-critical" />
                        <span className="text-[13.5px] font-medium text-critical">
                          {results.failed.length} rejected
                        </span>
                      </>
                    )}
                  </div>
                  {results.failed.length > 0 && (
                    <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-border">
                      <table className="w-full text-[12.5px]">
                        <thead className="bg-surface">
                          <tr className="text-left text-muted-foreground">
                            <th className="px-3 py-2 font-medium">Line</th>
                            <th className="px-3 py-2 font-medium">Why it was rejected</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.failed.map((f, i) => (
                            <tr key={i} className="border-t border-border">
                              <td className="px-3 py-1.5 font-mono tabular-nums">{f.line}</td>
                              <td className="px-3 py-1.5 text-muted-foreground">{f.error}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Panel>
        </div>

        <Panel className="self-start">
          <PanelHeader title="Patients by country" subtitle="Where the registry is thin" />
          <div className="p-5">
            <div className="grid gap-2">
              {byIsland.map((row) => (
                <div key={row.code} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="font-mono text-[12px] text-muted-foreground">{row.code}</span>
                    <span className="truncate text-[13px]">{row.name}</span>
                    {row.tier === "under_resourced" && (
                      <Pill className="bg-critical/15 text-critical border-critical/40">low capacity</Pill>
                    )}
                  </div>
                  <span className="mono-num text-[13px] tabular-nums">{row.count}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
              Every create and every import writes an audit row — including rejected ones — visible under{" "}
              <strong className="text-foreground">Access log</strong>. Administrative actions are evidence too,
              not just clinical reads.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 rounded-md border border-input bg-background px-3 text-[13.5px]"
      />
    </label>
  );
}
