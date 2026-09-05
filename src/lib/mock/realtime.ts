type ChangeEvent = "INSERT" | "UPDATE" | "DELETE";
type ChangePayload = {
  eventType: ChangeEvent;
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
};
type ChangeListener = (payload: ChangePayload) => void;

const tableListeners = new Map<string, Set<ChangeListener>>();

export function emitChange(
  table: string,
  eventType: ChangeEvent,
  row: Record<string, unknown> | null,
) {
  const set = tableListeners.get(table);
  if (!set) return;
  const payload: ChangePayload = {
    eventType,
    new: eventType === "DELETE" ? null : row,
    old: eventType === "DELETE" ? row : null,
  };
  for (const cb of set) cb(payload);
}

function subscribeTable(table: string, cb: ChangeListener) {
  if (!tableListeners.has(table)) tableListeners.set(table, new Set());
  tableListeners.get(table)!.add(cb);
  return () => tableListeners.get(table)?.delete(cb);
}

/**
 * Minimal stand-in for a Supabase Realtime channel: `.on("postgres_changes", {table}, cb)`
 * plus `.subscribe()`. Backed by the same-tab emitter above, fed by query-builder
 * mutations, so `useRealtimeGrid()` behaves the same as against a live database.
 */
export function mockChannel(_name: string) {
  const unsubs: (() => void)[] = [];
  const channel = {
    on(_event: string, filter: { table?: string }, cb: ChangeListener) {
      if (filter?.table) unsubs.push(subscribeTable(filter.table, cb));
      return channel;
    },
    subscribe(cb?: (status: string) => void) {
      if (cb) queueMicrotask(() => cb("SUBSCRIBED"));
      return channel;
    },
    unsubscribe() {
      for (const u of unsubs) u();
    },
  };
  return channel;
}
