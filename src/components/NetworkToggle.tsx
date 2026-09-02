import { useNetworkOnline, setNetworkOnline } from "@/lib/offline";
import { Wifi, WifiOff } from "lucide-react";

export function NetworkToggle() {
  const online = useNetworkOnline();

  return (
    <button
      type="button"
      onClick={() => setNetworkOnline(!online)}
      title="Simulate the island connection dropping"
      className={
        "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors " +
        (online
          ? "border-low/40 bg-low/10 text-low"
          : "border-critical/50 bg-critical/15 text-critical")
      }
    >
      {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      {online ? "Network up" : "Offline — queuing"}
    </button>
  );
}
