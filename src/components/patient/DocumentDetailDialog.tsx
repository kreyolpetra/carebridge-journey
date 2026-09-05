/**
 * One paper record, opened from the care history.
 *
 * The row in the timeline says a document exists and roughly what it is; this
 * is where you read it. That split matters for paper more than for a typed
 * note, because the transcription is the evidence: a clinician deciding
 * whether to trust "HTN dx 2019" wants to see the line it was read off, in the
 * order and wording the card used.
 *
 * So the original text is shown verbatim and monospaced rather than tidied
 * into prose. Cleaning it up would quietly assert a confidence in the reading
 * that nobody has earned.
 */
import { ScanLine, Keyboard, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pill } from "@/components/grid";
import { ExtractionPreview } from "@/components/patient/DigitiseRecord";
import type { ClinicalDocument } from "@/lib/prevention";
import { shortDate, timeAgo } from "@/lib/format";

export function DocumentDetailDialog({
  doc,
  onOpenChange,
  /** False for tiers that may know a document exists but not read it. */
  canRead,
}: {
  doc: ClinicalDocument;
  onOpenChange: (open: boolean) => void;
  canRead: boolean;
}) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-[18px]">
            {doc.source === "paper_scan" ? (
              <ScanLine className="h-4 w-4 text-primary" />
            ) : (
              <Keyboard className="h-4 w-4 text-primary" />
            )}
            {doc.title}
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            {/* Two different dates, never collapsed: what the paper says, and
                when it entered CareBridge. A record whose dates disagree is
                telling you something, and hiding one of them loses it. */}
            {doc.record_date ? (
              <>
                Dated {shortDate(doc.record_date)}
                {doc.record_time ? ` at ${doc.record_time}` : ""} ·{" "}
              </>
            ) : (
              <>No date on the document · </>
            )}
            {doc.source === "paper_scan" ? "photographed" : "typed"} by {doc.uploaded_by}, captured{" "}
            {shortDate(doc.created_at)} ({timeAgo(doc.created_at)})
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-1.5">
          <Pill className="border-border bg-surface text-muted-foreground">paper record</Pill>
          <Pill
            className={
              doc.committed
                ? "border-low/40 bg-low/10 text-low"
                : "border-high/40 bg-high/10 text-high"
            }
          >
            {doc.committed ? "in the chart" : "stored only"}
          </Pill>
        </div>

        {!doc.record_date && canRead ? (
          <p className="rounded-lg border border-border bg-surface px-3 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
            Nobody recorded what date this document carries, so it sits in the history under the day
            it was captured rather than the day the care happened.
          </p>
        ) : null}

        {!canRead ? (
          <p className="rounded-lg border border-border bg-surface px-3 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
            This document is listed so the record does not look complete, but reading its contents
            sits outside your scope.
          </p>
        ) : (
          <>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                What the document says
              </p>
              {doc.original_text ? (
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface px-3 py-2.5 font-mono text-[12px] leading-relaxed">
                  {doc.original_text}
                </pre>
              ) : (
                <p className="text-[13px] text-muted-foreground">
                  No transcription was captured — this entry holds the photograph only.
                </p>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {doc.committed ? "Read into the chart" : "Read from it"}
              </p>
              <ExtractionPreview extracted={doc.extracted} />
              {doc.extraction_note ? (
                <p className="mt-2 flex items-start gap-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {doc.extraction_note}
                </p>
              ) : null}
            </div>

            {!doc.committed ? (
              <p className="rounded-lg border border-high/30 bg-high/8 px-3 py-2.5 text-[12.5px] leading-relaxed text-high">
                Nothing from this document has been added to the structured chart. Conditions,
                medications and readings on this patient do not yet reflect it.
              </p>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
