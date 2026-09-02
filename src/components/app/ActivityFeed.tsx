/**
 * The live activity stream, lifted off its own route.
 *
 * It used to be a standalone nav item sitting next to an Overview that already
 * rendered a cut-down version of the same feed — two entries in the sidebar for
 * one stream. This is the filterable version, and Overview hosts it.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MessageSquareText,
  Stethoscope,
  ArrowRightLeft,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { activityQuery, type ActivityItem } from "@/lib/activity";
import { Panel, PanelHeader, Loading } from "@/components/grid";
import { timeAgo } from "@/lib/format";
import { useScope } from "@/hooks/useScope";
import { cn } from "@/lib/utils";

const META: Record<
  ActivityItem["kind"],
  { label: string; icon: typeof MessageSquareText; tone: string }
> = {
  message: { label: "Messages", icon: MessageSquareText, tone: "text-primary bg-primary/12" },
  triage: { label: "AI triage", icon: Stethoscope, tone: "text-high bg-high/12" },
  referral: { label: "Referrals", icon: ArrowRightLeft, tone: "text-low bg-low/12" },
  consent: { label: "Record access", icon: ShieldCheck, tone: "text-moderate bg-moderate/12" },
  alert: { label: "Alerts", icon: TriangleAlert, tone: "text-critical bg-critical/12" },
};

export function ActivityFeed({ maxHeight = "60vh" }: { maxHeight?: string }) {
  const { isPatient, patientId } = useScope();
  const feed = useQuery(activityQuery(patientId));
  const [kind, setKind] = useState<"all" | ActivityItem["kind"]>("all");
  const [q, setQ] = useState("");

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (feed.data ?? [])
      .filter((i) => kind === "all" || i.kind === kind)
      .filter((i) => (needle ? `${i.title} ${i.detail}`.toLowerCase().includes(needle) : true));
  }, [feed.data, kind, q]);

  return (
    <Panel>
      <PanelHeader
        title={isPatient ? "My activity" : "Activity"}
        subtitle={
          isPatient
            ? "Your messages, triage results, referrals and every time your file was opened"
            : "Every message, triage decision, referral and record access, streaming live"
        }
        right={
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the feed…"
            className="w-[200px] rounded-lg border border-border bg-background px-3 py-1.5 text-[12.5px] outline-none focus:border-primary"
          />
        }
      />
      <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-3">
        {(["all", ...(Object.keys(META) as ActivityItem["kind"][])] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={cn(
              "rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
              kind === k
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {k === "all" ? "Everything" : META[k].label}
          </button>
        ))}
      </div>
      <div className="overflow-y-auto" style={{ maxHeight }}>
        {feed.isLoading ? (
          <Loading label={isPatient ? "Loading your stream…" : "Assembling the regional stream…"} />
        ) : null}
        {!feed.isLoading && !items.length ? (
          <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
            Nothing matches that filter.
          </p>
        ) : null}
        {items.map((item) => {
          const meta = META[item.kind];
          return (
            <div
              key={item.id}
              className="flex gap-3 border-b border-border/60 px-4 py-3 last:border-0"
            >
              <span
                className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", meta.tone)}
              >
                <meta.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold">{item.title}</p>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">{item.detail}</p>
              </div>
              <span className="shrink-0 text-[11.5px] text-muted-foreground">
                {timeAgo(item.at)}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
