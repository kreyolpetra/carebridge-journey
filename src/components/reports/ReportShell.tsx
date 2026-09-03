/**
 * The frame every report shares.
 *
 * What separates a report from the dashboards this app already has is that it
 * is a document: it names its subject, states the period it covers, records
 * when and by whom it was produced, and leaves the building. A screen that
 * shows live numbers and cannot be printed is not something a ministry can put
 * in front of a committee, and a committee paper without a date is worthless
 * three weeks later.
 *
 * So the header carries the period and the generation stamp, and both survive
 * printing — the print stylesheet drops the app chrome and keeps this.
 */
import type { ReactNode } from "react";
import { Printer, Download } from "lucide-react";
import { Panel } from "@/components/grid";
import { useAuth } from "@/hooks/useAuth";

export function toCsv(rows: (string | number | null | undefined)[][]) {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const v = cell === null || cell === undefined ? "" : String(cell);
          // Quote anything that would otherwise break the row apart.
          return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(","),
    )
    .join("\n");
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReportShell({
  title,
  subtitle,
  period,
  children,
  onExport,
  exportLabel = "Export CSV",
}: {
  title: string;
  subtitle: string;
  /** What span of time the figures cover. Stated, never implied. */
  period: string;
  children: ReactNode;
  onExport?: (() => void) | undefined;
  exportLabel?: string;
}) {
  const { profile } = useAuth();
  const now = new Date();

  return (
    <div className="report-root mx-auto w-full max-w-[1100px] px-5 py-8">
      <Panel className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              CariCare Grid report
            </p>
            <h1 className="mt-1 font-display text-[24px] font-bold tracking-tight">{title}</h1>
            <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
            <p className="mt-3 text-[12px] text-muted-foreground">
              <strong className="font-semibold text-foreground">Period:</strong> {period} ·{" "}
              <strong className="font-semibold text-foreground">Generated:</strong>{" "}
              {now.toLocaleString()} ·{" "}
              <strong className="font-semibold text-foreground">By:</strong>{" "}
              {profile?.full_name ?? "Grid user"}
              {profile?.organisation ? ` (${profile.organisation})` : ""}
            </p>
          </div>
          <div className="report-actions flex shrink-0 flex-wrap items-center gap-2">
            {onExport ? (
              <button
                type="button"
                onClick={onExport}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12.5px] font-semibold hover:bg-surface"
              >
                <Download className="h-3.5 w-3.5" />
                {exportLabel}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[12.5px] font-semibold text-primary-foreground"
            >
              <Printer className="h-3.5 w-3.5" />
              Print / save as PDF
            </button>
          </div>
        </div>
      </Panel>

      <div className="space-y-4">{children}</div>

      <p className="mt-6 text-[11.5px] leading-relaxed text-muted-foreground">
        Produced by CariCare Grid from the live record. Figures reflect the moment of generation and
        will move as the underlying data does. All patient data in this prototype is synthetic.
      </p>
    </div>
  );
}

/** A titled block of a report — the unit a reader scans for. */
export function ReportSection({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <Panel className="report-section">
      <div className="border-b border-border px-5 py-3">
        <h2 className="font-display text-[15px] font-semibold tracking-tight">{title}</h2>
        {note ? <p className="mt-0.5 text-[12.5px] text-muted-foreground">{note}</p> : null}
      </div>
      <div className="p-5">{children}</div>
    </Panel>
  );
}

/** A plain table. Reports are read in rows, not in cards. */
export function ReportTable({
  head,
  rows,
  empty = "Nothing to report for this period.",
}: {
  head: string[];
  rows: ReactNode[][];
  empty?: string;
}) {
  if (!rows.length) return <p className="text-[13px] text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-[13px]">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            {head.map((h, i) => (
              <th
                key={h}
                className={"pb-2 pr-3 font-medium " + (i === 0 ? "" : "text-right")}
                scope="col"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              {r.map((cell, j) => (
                <td
                  key={j}
                  className={
                    "py-2.5 pr-3 " +
                    (j === 0 ? "font-medium text-foreground" : "text-right tabular-nums")
                  }
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
