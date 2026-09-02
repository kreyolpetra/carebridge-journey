import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { alertsQuery, patientsQuery, referralsQuery } from "@/lib/api";
import { useScope } from "@/hooks/useScope";

const STORAGE_KEY = "caricare.readNotifications";

export type GridNotification = {
  id: string;
  title: string;
  detail: string;
  tone: "critical" | "warning" | "info" | "success";
  at: string;
  to: "/clinician" | "/dashboard" | "/consent" | "/patient";
};

function readStore(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function useNotifications() {
  const { isPatient, patientId } = useScope();
  const alerts = useQuery(alertsQuery);
  const referrals = useQuery(referralsQuery);
  const patients = useQuery(patientsQuery);
  const [read, setRead] = useState<string[]>([]);

  useEffect(() => {
    setRead(readStore());
  }, []);

  const items = useMemo<GridNotification[]>(() => {
    const nameOf = (id: string | null) =>
      (patients.data ?? []).find((p) => p.id === id)?.full_name ?? "A patient";

    const fromAlerts: GridNotification[] = (alerts.data ?? [])
      .filter((a) => (patientId ? a.patient_id === patientId : true))
      .slice(0, 25).map((a) => ({
      id: `alert:${a.id}`,
      title: a.title,
      detail: a.detail,
      tone: a.severity === "high" || a.severity === "critical" ? "critical" : "warning",
      at: a.created_at,
      to: isPatient ? "/patient" : a.kind === "stockout" ? "/dashboard" : "/clinician",
    }));

    const fromReferrals: GridNotification[] = (referrals.data ?? [])
      .filter((r) => r.status === "pending")
      .filter((r) => (patientId ? r.patient_id === patientId : true))
      .slice(0, 15)
      .map((r) => ({
        id: `referral:${r.id}`,
        title: `${r.specialty} referral awaiting acceptance`,
        detail: `${nameOf(r.patient_id)} · ${r.cross_island ? "cross-island route" : "local route"} · ${r.wait_days_routed}d wait`,
        tone: "info",
        at: r.created_at,
        to: isPatient ? "/patient" : "/clinician",
      }));

    return [...fromAlerts, ...fromReferrals].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
  }, [alerts.data, referrals.data, patients.data, isPatient, patientId]);

  const unread = items.filter((i) => !read.includes(i.id));

  const markAllRead = useCallback(() => {
    const ids = items.map((i) => i.id);
    setRead(ids);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  }, [items]);

  return { items, unread, unreadCount: unread.length, markAllRead, isRead: (id: string) => read.includes(id) };
}
