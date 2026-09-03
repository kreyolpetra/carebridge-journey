/**
 * The paper records held against one patient.
 *
 * Uploading a clinic card without anywhere to read it back is a drawer with no
 * handle — the document went in, and the chart looked exactly as it did
 * before. This is the other half: what came off paper, who put it there, and
 * whether it ever reached the structured record.
 *
 * That last distinction is the one worth showing. A document can be stored and
 * still be nowhere in the chart, because nothing legible was extracted from
 * it. Collapsing "we have the photograph" and "the chart knows what it says"
 * into one green tick would misrepresent the state of the record, which for a
 * patient with a thin history is precisely the thing a clinician is trying to
 * judge.
 */
import { useQuery } from "@tanstack/react-query";
import { FileText, ScanLine, Keyboard } from "lucide-react";
import { documentsQuery } from "@/lib/prevention";
import { Panel, PanelHeader, Pill } from "@/components/grid";
import { timeAgo } from "@/lib/format";

export function PaperRecords({ patientId }: { patientId: string }) {
  const docs = useQuery(documentsQuery);
  const mine = (docs.data ?? []).filter((d) => d.patient_id === patientId);

  return (
    <Panel>
      <PanelHeader
        title="Paper records"
        subtitle="Clinic cards, faxes and lab reports captured against this patient"
      />
      <div className="divide-y divide-border">
        {mine.map((d) => (
          <div key={d.id} className="flex items-start justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {d.source === "paper_scan" ? (
                  <ScanLine className="h-3.5 w-3.5 shrink-0 text-primary" />
                ) : (
                  <Keyboard className="h-3.5 w-3.5 shrink-0 text-primary" />
                )}
                <span className="truncate text-[13.5px] font-semibold">{d.title}</span>
              </div>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {d.source === "paper_scan" ? "Photographed" : "Typed"} by {d.uploaded_by} ·{" "}
                {timeAgo(d.created_at)}
              </p>
              {d.original_text ? (
                <p className="mt-1.5 line-clamp-2 max-w-xl font-mono text-[11.5px] leading-relaxed text-muted-foreground">
                  {d.original_text}
                </p>
              ) : null}
              {!d.committed && d.extraction_note ? (
                <p className="mt-1.5 max-w-xl text-[12px] leading-relaxed text-muted-foreground">
                  {d.extraction_note}
                </p>
              ) : null}
            </div>
            <Pill
              className={
                d.committed
                  ? "shrink-0 border-low/40 bg-low/10 text-low"
                  : "shrink-0 border-high/40 bg-high/10 text-high"
              }
            >
              {d.committed ? "in the chart" : "stored only"}
            </Pill>
          </div>
        ))}

        {!mine.length ? (
          <div className="flex items-start gap-2.5 px-5 py-6 text-[13px] leading-relaxed text-muted-foreground">
            <FileText className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              No paper records captured for this patient. Use{" "}
              <strong className="font-semibold text-foreground">Add paper record</strong> at the top
              of the chart to photograph a clinic card or type what it says.
            </span>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
