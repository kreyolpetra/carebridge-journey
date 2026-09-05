import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("panel", className)} {...rest}>
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  subtitle,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 px-6 py-4">
      <div className="min-w-0">
        <h2 className="font-display text-[16.5px] font-semibold tracking-[-0.014em]">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {right}
    </div>
  );
}

export function Pill({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.055em]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * A headline figure.
 *
 * This was a bordered, shadowed tile with a coloured hairline across its top —
 * the dashboard convention of about 2018, and the most dated thing on the
 * home screen. Four of them in a row turned the most important numbers on the
 * page into four identical boxes.
 *
 * The box is gone. What is left is a rule in the figure's own tone, the label,
 * the number and its qualifier — so the four read as a set of measurements
 * rather than a set of containers, and the tone does the work the border was
 * doing badly. A figure with no state to report draws a neutral rule rather
 * than a coloured one, because a line that says nothing is worse than none.
 */
export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "signal" | "critical" | "low";
}) {
  const toneClass =
    tone === "signal"
      ? "text-primary"
      : tone === "critical"
        ? "text-critical"
        : tone === "low"
          ? "text-low"
          : "text-foreground";
  const ruleClass =
    tone === "signal"
      ? "bg-primary"
      : tone === "critical"
        ? "bg-critical"
        : tone === "low"
          ? "bg-low"
          : "bg-border";
  return (
    <div className="relative py-1 pl-4">
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-[3px] rounded-full", ruleClass)}
      />
      <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground sm:text-[10.5px] sm:tracking-[0.12em]">
        {label}
      </div>
      <div
        className={cn(
          /*
           * Smaller on a phone.
           *
           * 38px was chosen against a desktop grid of four figures across. On a
           * 390px screen each figure has the full width to itself, so the same
           * size reads as shouting — "CRITICAL · 83" filling a third of the
           * screen above the reading someone actually came to send. The figure
           * is still the largest thing in its block; it just stops competing
           * with the task.
           */
          "display-num mt-1.5 text-[22px] font-bold leading-[1.06] tracking-[-0.028em] sm:mt-2.5 sm:text-[38px] sm:leading-[1.02] sm:tracking-[-0.032em]",
          toneClass,
        )}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}

/**
 * A list of things, as rows rather than as cards.
 *
 * The pattern this replaces was a bordered, filled card for every item, sitting
 * inside a bordered panel — an object drawn twice. Border, fill, radius and
 * shadow each say "separate thing", and spending all four on every row of a
 * list leaves nothing left to lift the row that actually matters.
 */
export function RowList({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("divide-y divide-border/70", className)}>{children}</ul>;
}

export function Row({
  title,
  detail,
  right,
  onClick,
}: {
  title: ReactNode;
  detail?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold">{title}</span>
        {detail ? (
          <span className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground">
            {detail}
          </span>
        ) : null}
      </span>
      {right}
    </>
  );
  return (
    <li>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="flex w-full items-center gap-3 px-1 py-3 text-left transition-colors hover:bg-surface-hover"
        >
          {inner}
        </button>
      ) : (
        <div className="flex items-center gap-3 px-1 py-3">{inner}</div>
      )}
    </li>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  blurb,
}: {
  eyebrow?: string;
  title: string;
  blurb?: string;
}) {
  return (
    <div className="mb-5">
      {eyebrow ? (
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          {eyebrow}
        </div>
      ) : null}
      <h2 className="mt-2 font-display text-[28px] font-semibold tracking-[-0.026em]">{title}</h2>
      {blurb ? <p className="mt-1.5 max-w-2xl text-[14px] text-muted-foreground">{blurb}</p> : null}
    </div>
  );
}

export function Loading({ label = "Loading CareBridge…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-10 text-sm text-muted-foreground">
      <span className="h-3 w-3 animate-ping rounded-full bg-primary" />
      {label}
    </div>
  );
}
