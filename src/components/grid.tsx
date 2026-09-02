import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
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
    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
      <div className="min-w-0">
        <h2 className="font-display text-[15px] font-semibold">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-[12.5px] text-muted-foreground">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}

export function Pill({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
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
  return (
    <div className="panel px-5 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mono-num mt-1.5 text-[26px] font-semibold leading-none", toneClass)}>{value}</div>
      {hint ? <div className="mt-1.5 text-[12px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, blurb }: { eyebrow?: string; title: string; blurb?: string }) {
  return (
    <div className="mb-5">
      {eyebrow ? (
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</div>
      ) : null}
      <h2 className="mt-1.5 font-display text-2xl font-semibold">{title}</h2>
      {blurb ? <p className="mt-1.5 max-w-2xl text-[14px] text-muted-foreground">{blurb}</p> : null}
    </div>
  );
}

export function Loading({ label = "Loading the Grid…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-10 text-sm text-muted-foreground">
      <span className="h-3 w-3 animate-ping rounded-full bg-primary" />
      {label}
    </div>
  );
}
