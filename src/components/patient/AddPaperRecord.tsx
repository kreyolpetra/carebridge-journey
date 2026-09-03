/**
 * "Add paper record" as a chart action.
 *
 * The digitising flow itself lives in DigitiseRecord; this is only the button
 * and the dialog that binds it to the chart currently open. Keeping the two
 * apart is what lets the facility console keep its bulk, pick-a-patient
 * version without either copy drifting from the other.
 */
import { useState } from "react";
import { FileUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DigitiseRecord } from "@/components/patient/DigitiseRecord";

export function AddPaperRecord({
  patientId,
  patientName,
}: {
  patientId: string;
  patientName: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-medium transition-colors hover:border-primary/40 hover:text-primary"
      >
        <FileUp className="h-3.5 w-3.5" />
        Add paper record
      </button>

      {open ? (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display text-[18px]">
                Add a paper record · {patientName}
              </DialogTitle>
              <DialogDescription className="text-[13px]">
                Photograph the clinic card or paste what it says. Nothing reaches the chart until
                you review it and commit.
              </DialogDescription>
            </DialogHeader>
            <DigitiseRecord
              patientId={patientId}
              patientName={patientName}
              onCommitted={() => setOpen(false)}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
