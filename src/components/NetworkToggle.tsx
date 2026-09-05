import { useNetworkOnline, setNetworkOnline, usePendingCount, isDurable } from "@/lib/offline";
import { Wifi, WifiOff } from "lucide-react";

export function NetworkToggle({
  onDark = false,
  compact = false,
  className = "",
}: { onDark?: boolean; compact?: boolean; className?: string } = {}) {
  const online = useNetworkOnline();
  const waiting = usePendingCount();

  /*
   * Compact stays quiet until it has something to say.
   *
   * This is the phone header, where space is the scarcest thing on the screen.
   * A permanent "Network up" badge there would be chrome; an "Offline — 1
   * waiting" badge is the whole point of the feature, so it appears exactly
   * when a write is being held and disappears again once it has gone.
   */
  if (compact && online && !waiting) return null;

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
        "flex shrink-0 items-center gap-2 rounded-full border font-medium transition-colors " +
        (compact ? "px-2.5 py-1 text-[11.5px] " : "px-3 py-1.5 text-[12px] ") +
        (className ? className + " " : "") +
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
