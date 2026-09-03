/**
 * Turning a paper clinic card into structured chart data.
 *
 * This was only ever reachable from the facility console, where the first
 * field is a dropdown of two hundred patients defaulted to whoever happens to
 * be first. That is the wrong shape for the common case: a clinician is
 * already looking at a chart, with the patient's card in front of them, and
 * the last thing that work should require is re-picking the patient by name
 * from a list where names repeat.
 *
 * So the patient is a prop, not a field. Mounted from a chart it cannot be
 * pointed at the wrong record, because there is nothing to point.
 *
 * Extraction runs through the same path as everywhere else: with no AI gateway
 * configured it returns the manual-entry result, the document is stored, and a
 * human keys the values in. Nothing reaches the chart until someone presses
 * commit — which is the flow you would want even with a model in the loop.
 */
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileUp, ScanText, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { extractDocument } from "@/lib/documents.functions";
import type { ExtractedRecord } from "@/lib/prevention";
import { Pill } from "@/components/grid";
import { useAuth } from "@/hooks/useAuth";

export function ExtractionPreview({ extracted }: { extracted: ExtractedRecord }) {
  const rows: { label: string; values: string[] }[] = [
    {
      label: "Conditions",
      values: (extracted.conditions ?? []).map(
        (c) => `${c.name}${c.diagnosed ? ` (${c.diagnosed})` : ""}`,
      ),
    },
    {
      label: "Medications",
      values: (extracted.medications ?? []).map((m) =>
        [m.name, m.dosage, m.frequency].filter(Boolean).join(" "),
      ),
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
    {
      label: "Labs",
      values: (extracted.labs ?? []).map(
        (l) => `${l.name} ${l.value}${l.unit ? ` ${l.unit}` : ""}`,
      ),
    },
  ].filter((r) => r.values.length > 0);

  if (rows.length === 0) return null;
  return (
    <div className="mt-3 space-y-2">
      {rows.map((r) => (
        <div key={r.label}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {r.label}
          </p>
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

/** Whether an extraction produced anything a chart could actually take. */
function hasFields(e: ExtractedRecord) {
  return Boolean(
    e.conditions?.length || e.medications?.length || e.vitals?.length || e.labs?.length,
  );
}

export function DigitiseRecord({
  patientId,
  patientName,
  onCommitted,
}: {
  patientId: string;
  /** Shown above the upload so the target record is never in doubt. */
  patientName?: string | undefined;
  onCommitted?: (() => void) | undefined;
}) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("Handwritten clinic card");
  // Defaulting to today would silently backdate every card to the day it was
  // photographed, which is the error this field exists to prevent. Left empty,
  // so supplying it is a decision rather than an omission.
  const [recordDate, setRecordDate] = useState("");
  const [recordTime, setRecordTime] = useState("");
  const [text, setText] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<{
    extracted: ExtractedRecord;
    note: string;
    id?: string;
  } | null>(null);

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
      if (!imageDataUrl && text.trim().length < 10)
        throw new Error("Upload a photo or paste the chart text first.");
      const extraction = await extractDocument({
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
          record_date: recordDate || null,
          record_time: recordTime || null,
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
      toast.success("Document stored against the chart");
      void qc.invalidateQueries({ queryKey: ["clinical_documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const commit = useMutation({
    mutationFn: async (payload: { id: string; extracted: ExtractedRecord }) => {
      const { extracted } = payload;
      const jobs: Promise<unknown>[] = [];
      if (extracted.conditions?.length) {
        jobs.push(
          supabase.from("conditions").insert(
            extracted.conditions.map((c) => ({
              patient_id: patientId,
              name: c.name,
              diagnosed_on:
                c.diagnosed && /^\d{4}/.test(c.diagnosed)
                  ? `${c.diagnosed.slice(0, 4)}-01-01`
                  : "2020-01-01",
            })),
          ) as unknown as Promise<unknown>,
        );
      }
      if (extracted.medications?.length) {
        jobs.push(
          supabase.from("medications").insert(
            extracted.medications.map((m) => ({
              patient_id: patientId,
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
              patient_id: patientId,
              measured_at: v.measured_at
                ? new Date(v.measured_at).toISOString()
                : new Date().toISOString(),
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
      setFileName(null);
      setImageDataUrl(null);
      setText("");
      setRecordDate("");
      setRecordTime("");
      void qc.invalidateQueries({ queryKey: ["clinical_documents"] });
      void qc.invalidateQueries({ queryKey: ["patient-bundle"] });
      onCommitted?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      {patientName ? (
        <p className="rounded-lg border border-primary/25 bg-primary/8 px-3 py-2 text-[12.5px]">
          Everything read off this document goes to{" "}
          <strong className="font-semibold">{patientName}</strong>.
        </p>
      ) : null}

      <label className="block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        Document title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13.5px] font-normal normal-case tracking-normal text-foreground"
        />
      </label>

      {/* When the care happened, which is not when the photograph was taken.
          Without it the record sorts by upload time and a 2019 clinic card
          lands at the top of the timeline looking like this morning's news. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Date on the document
          <input
            type="date"
            value={recordDate}
            onChange={(e) => setRecordDate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13.5px] font-normal normal-case tracking-normal text-foreground"
          />
        </label>
        <label className="block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Time <span className="font-normal normal-case tracking-normal">(if shown)</span>
          <input
            type="time"
            value={recordTime}
            onChange={(e) => setRecordTime(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13.5px] font-normal normal-case tracking-normal text-foreground"
          />
        </label>
      </div>
      <p className="-mt-1 text-[12px] leading-relaxed text-muted-foreground">
        {recordDate
          ? "The record will sit in the patient's history under this date."
          : "If the card covers a range, use its most recent entry. Left blank, the record files under the date you captured it and says so."}
      </p>

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
        type="button"
        onClick={() => fileRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-[13px] font-semibold text-muted-foreground hover:bg-muted/60"
      >
        <FileUp className="h-4 w-4" />
        {fileName ?? "Upload a photo of the clinic card"}
      </button>

      {imageDataUrl ? (
        <img
          src={imageDataUrl}
          alt="Uploaded clinic card"
          className="max-h-52 w-full rounded-lg object-contain"
        />
      ) : null}

      <label className="block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        Or paste what the card says
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder={"HTN dx 2019, T2DM 2021\nBP 156/96 14/02/25\nAmlodipine 10mg od"}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-[12.5px] font-normal normal-case tracking-normal text-foreground"
        />
      </label>

      <button
        type="button"
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
          {/* Committing an empty extraction would write nothing to the chart
              while marking the document committed — a state that reads as "this
              paper record is now in the system" when it is not. So the action
              is only offered when there is something to commit. */}
          {result.id && hasFields(result.extracted) ? (
            <button
              type="button"
              onClick={() => commit.mutate({ id: result.id!, extracted: result.extracted })}
              disabled={commit.isPending}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" /> Commit to the chart
            </button>
          ) : (
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
              The document is stored against this record and a clerk can work from it, but no
              structured fields were read, so there is nothing to add to the chart yet.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
