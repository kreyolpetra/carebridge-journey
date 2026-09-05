import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const WATCHED = [
  "messages",
  "alerts",
  "referrals",
  "triage_events",
  "vitals",
  "consent_grants",
] as const;

/**
 * Subscribes the whole app to live database changes so consoles update without
 * a refresh. Returns the connection state so the UI can show a "live" dot.
 */
export function useRealtimeGrid() {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const channel = supabase.channel("carebridge-journey");

    for (const table of WATCHED) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
        qc.invalidateQueries();
        if (table === "alerts" && payload.eventType === "INSERT") {
          const row = payload.new as { title?: string; severity?: string };
          if (row?.title) {
            const message = `New ${row.severity ?? "system"} alert · ${row.title}`;
            if (row.severity === "high" || row.severity === "critical") toast.error(message);
            else toast(message);
          }
        }
        if (table === "referrals" && payload.eventType === "INSERT") {
          toast.success("New referral routed onto CareBridge");
        }
      });
    }

    channel.subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  return connected;
}
