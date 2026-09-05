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
  /**
   * A hairline of the tile's own tone across the top, fading out to the right.
   *
   * A flat rule across every tile is the look of a dashboard template, and a
   * grey one on the tile that has no state to report is worse than none —
   * it draws a line and says nothing with it. So the wash fades, and a tile
   * with nothing to say draws no line at all.
   */
  const edge =
    tone === "critical"
      ? "before:bg-[linear-gradient(90deg,var(--color-critical)_0%,transparent_62%)]"
      : tone === "low"
        ? "before:bg-[linear-gradient(90deg,var(--color-low)_0%,transparent_62%)]"
        : tone === "signal"
          ? "before:bg-[linear-gradient(90deg,var(--color-primary)_0%,transparent_62%)]"
          : "";
  return (
    <div
      className={cn(
        "panel relative overflow-hidden px-6 py-5",
        tone !== "default" &&
          "before:absolute before:inset-x-0 before:top-0 before:h-[2px] before:opacity-70 before:content-['']",
        edge,
      )}
    >
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mono-num mt-3 text-[34px] font-semibold leading-none tracking-[-0.028em]",
          toneClass,
        )}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">{hint}</div>
      ) : null}
    </div>
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
