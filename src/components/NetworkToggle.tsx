import { useNetworkOnline, setNetworkOnline, usePendingCount, isDurable } from "@/lib/offline";
import { Wifi, WifiOff } from "lucide-react";

export function NetworkToggle({ onDark = false }: { onDark?: boolean } = {}) {
  const online = useNetworkOnline();
  const waiting = usePendingCount();

  return (
    <button
      type="button"
      onClick={() => setNetworkOnline(!online)}
      title={
        online
          ? "Simulate the island connection dropping"
          : `${waiting} write${waiting === 1 ? "" : "s"} waiting${isDurable() ? " — saved on this device, they survive a reload or a power cut" : " — this browser refuses storage, so they last only for this session"}`
      }
      className={
        "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors " +
        (online
          ? onDark
            ? "border-sidebar-accent/40 bg-sidebar-accent/12 text-sidebar-accent"
            : "border-low/40 bg-low/10 text-low"
          : "border-critical/50 bg-critical/15 text-critical")
      }
    >
      {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      {online
        ? waiting
          ? `Syncing ${waiting}`
          : "Network up"
        : waiting
          ? `Offline — ${waiting} waiting`
          : "Offline"}
    </button>
  );
}
