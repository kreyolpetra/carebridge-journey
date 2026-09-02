import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquareText, Stethoscope, ArrowRightLeft, ShieldCheck, TriangleAlert } from "lucide-react";
import { activityQuery, type ActivityItem } from "@/lib/activity";
import { Panel, PanelHeader, Loading } from "@/components/grid";
import { timeAgo } from "@/lib/format";
import { useScope } from "@/hooks/useScope";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({
    meta: [
      { title: "Live Activity Feed — CariCare Grid" },
      {
        name: "description",
        content:
          "Every message, AI triage decision, referral route and record access on the Grid, streaming live across the region.",
      },
      { property: "og:title", content: "Live Activity Feed — CariCare Grid" },
      { property: "og:description", content: "One auditable stream of everything happening across the islands." },
    ],
  }),
  component: ActivityPage,
});

const META: Record<ActivityItem["kind"], { label: string; icon: typeof MessageSquareText; tone: string }> = {
  message: { label: "Messages", icon: MessageSquareText, tone: "text-primary bg-primary/12" },
  triage: { label: "AI triage", icon: Stethoscope, tone: "text-high bg-high/12" },
  referral: { label: "Referrals", icon: ArrowRightLeft, tone: "text-low bg-low/12" },
  consent: { label: "Record access", icon: ShieldCheck, tone: "text-moderate bg-moderate/12" },
  alert: { label: "Alerts", icon: TriangleAlert, tone: "text-critical bg-critical/12" },
};

function ActivityPage() {
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
    <div className="mx-auto w-full max-w-[1000px] px-5 py-8">
      <h1 className="font-display text-2xl font-bold tracking-tight">
        {isPatient ? "My activity" : "Activity"}
      </h1>
      <p className="mt-1 text-[13.5px] text-muted-foreground">
        {isPatient
          ? "Everything on your own record — your messages, triage results, referrals and who opened your file."
          : "Everything happening on the Grid right now — auditable, in one stream."}
      </p>

      <Panel className="mt-6">
        <PanelHeader
          title="Live feed"
          subtitle={isPatient ? "Updates in realtime as your care moves" : "Updates in realtime as the region works"}
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
        <div className="max-h-[70vh] overflow-y-auto">
          {feed.isLoading ? <Loading label={isPatient ? "Loading your stream…" : "Assembling the regional stream…"} /> : null}
          {!feed.isLoading && !items.length ? (
            <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">Nothing matches that filter.</p>
          ) : null}
          {items.map((item) => {
            const meta = META[item.kind];
            return (
              <div key={item.id} className="flex gap-3 border-b border-border/60 px-4 py-3 last:border-0">
                <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", meta.tone)}>
                  <meta.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold">{item.title}</p>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">{item.detail}</p>
                </div>
                <span className="shrink-0 text-[11.5px] text-muted-foreground">{timeAgo(item.at)}</span>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
