import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ActivityItem = {
  id: string;
  kind: "message" | "triage" | "referral" | "consent" | "alert";
  title: string;
  detail: string;
  at: string;
};

export const activityQuery = (patientId?: string | null) =>
  queryOptions({
  queryKey: ["activity-feed", patientId ?? "all"],
  staleTime: 10_000,
  queryFn: async (): Promise<ActivityItem[]> => {
    const scope = <T extends { eq: (c: string, v: string) => T }>(q: T, column = "patient_id") =>
      patientId ? q.eq(column, patientId) : q;

    const [messages, triage, referrals, access, alerts, patients] = await Promise.all([
      scope(supabase.from("messages").select("*").order("created_at", { ascending: false }).limit(30)),
      scope(supabase.from("triage_events").select("*").order("created_at", { ascending: false }).limit(30)),
      scope(supabase.from("referrals").select("*").order("created_at", { ascending: false }).limit(30)),
      scope(supabase.from("consent_access_log").select("*").order("accessed_at", { ascending: false }).limit(30)),
      scope(supabase.from("alerts").select("*").order("created_at", { ascending: false }).limit(30)),
      supabase.from("patients").select("id, full_name").limit(1000),
    ]);

    const names = new Map(((patients.data ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]));
    const nameOf = (id: string | null) => (id ? (names.get(id) ?? "Unknown patient") : "System");

    const items: ActivityItem[] = [];

    for (const m of (messages.data ?? []) as any[]) {
      items.push({
        id: `m:${m.id}`,
        kind: "message",
        title: `${m.direction === "in" ? "Message from" : "Reply to"} ${nameOf(m.patient_id)}`,
        detail: m.body.length > 130 ? `${m.body.slice(0, 130)}…` : m.body,
        at: m.created_at,
      });
    }
    for (const t of (triage.data ?? []) as any[]) {
      items.push({
        id: `t:${t.id}`,
        kind: "triage",
        title: `AI triage · ${t.severity} · ${nameOf(t.patient_id)}`,
        detail: `${t.category} → ${String(t.recommended_level).replace(/_/g, " ")}`,
        at: t.created_at,
      });
    }
    for (const r of (referrals.data ?? []) as any[]) {
      items.push({
        id: `r:${r.id}`,
        kind: "referral",
        title: `${r.specialty} referral ${r.status} · ${nameOf(r.patient_id)}`,
        detail: `${r.cross_island ? "Cross-island route" : "Local route"} · ${r.wait_days_local}d → ${r.wait_days_routed}d`,
        at: r.created_at,
      });
    }
    for (const a of (access.data ?? []) as any[]) {
      items.push({
        id: `a:${a.id}`,
        kind: "consent",
        title: `Record access ${a.allowed ? "granted" : "blocked"} · ${nameOf(a.patient_id)}`,
        detail: `Resource: ${a.resource}`,
        at: a.accessed_at,
      });
    }
    for (const al of (alerts.data ?? []) as any[]) {
      items.push({
        id: `al:${al.id}`,
        kind: "alert",
        title: `${al.severity} alert · ${al.title}`,
        detail: al.detail,
        at: al.created_at,
      });
    }

    return items.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime()).slice(0, 120);
  },
});
