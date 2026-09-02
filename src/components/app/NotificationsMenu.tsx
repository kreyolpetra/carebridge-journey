import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNotifications } from "@/lib/notifications";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export function NotificationsMenu() {
  const { items, unreadCount, markAllRead, isRead } = useNotifications();

  return (
    <DropdownMenu onOpenChange={(open) => !open && markAllRead()}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
          className="relative grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
          {unreadCount ? (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-critical px-1 text-[10px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="font-display text-[13.5px] font-semibold">Notifications</span>
          <button onClick={markAllRead} className="text-[12px] font-medium text-primary">
            Mark all read
          </button>
        </div>
        <div className="max-h-[380px] overflow-y-auto">
          {!items.length ? (
            <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">Nothing needs you right now.</p>
          ) : (
            items.slice(0, 20).map((n) => (
              <Link
                key={n.id}
                to={n.to}
                className={cn(
                  "block border-b border-border/60 px-4 py-3 transition-colors hover:bg-surface",
                  !isRead(n.id) && "bg-primary/5",
                )}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                      n.tone === "critical" ? "bg-critical" : n.tone === "warning" ? "bg-high" : "bg-primary",
                    )}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold">{n.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">{n.detail}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{timeAgo(n.at)}</p>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
