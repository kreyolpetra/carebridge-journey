/**
 * Losing the signal, and losing the power.
 *
 * These are different failures and the product has to survive both. A dropped
 * signal is Tuesday in rural Caribbean connectivity; a power cut is Tuesday in
 * hurricane season. The first only needs a queue. The second needs the queue to
 * still be there when the lights come back, which an in-memory one is not — the
 * previous version of this file held closures, and a closure does not survive
 * the tab being killed.
 *
 * So a queued write is now a description of the write rather than a function
 * that performs it: table, operation, payload. That can be written to disk, and
 * it is — every change, immediately, because the whole point is to be robust to
 * the machine dying between two keystrokes. On the next load the queue is read
 * back and replayed.
 *
 * What is deliberately not claimed:
 *
 *   - Reads still fail when the connection is down. A stale chart presented as
 *     current is worse than an error, and no amount of caching makes a
 *     three-day-old medication list safe to prescribe against.
 *   - Storage can be unavailable — a private window, a locked-down browser, the
 *     sandboxed frame a shared link runs in. When it is, the queue still works
 *     for the session and says so rather than pretending to durability it does
 *     not have.
 *   - Work typed and never submitted is a separate problem, handled by draft
 *     persistence where the typing happens.
 */
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

type Listener = () => void;

const KEY = "caricare-offline-queue";

/**
 * A write, described rather than performed.
 *
 * Serialisable on purpose: this is the difference between surviving a lost
 * signal and surviving a lost power supply.
 */
export type WriteIntent = {
  id: string;
  label: string;
  table: string;
  op: "insert" | "update";
  payload: Record<string, unknown>;
  /** For an update: the row to match, e.g. { id: "..." }. */
  match?: Record<string, string>;
  queuedAt: string;
};

let online = true;
let pending: WriteIntent[] = [];
/** False when the browser refuses storage — said out loud rather than assumed. */
let durable = true;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(pending));
  } catch {
    durable = false;
  }
}

function restore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) pending = JSON.parse(raw) as WriteIntent[];
  } catch {
    durable = false;
  }
}
restore();

/**
 * Replay whatever the last session left behind.
 *
 * Restoring the queue is only half of surviving a power cut — without this the
 * writes come back on screen as "waiting" and then wait forever, because the
 * only thing that used to trigger a flush was the connection transitioning
 * from down to up, and a machine that just booted never makes that transition.
 * The short delay lets the client finish starting before the first replay.
 */
if (pending.length) {
  setTimeout(() => {
    void flushQueue();
  }, 600);
}

export function setNetworkOnline(value: boolean) {
  const was = online;
  online = value;
  emit();
  if (!was && value) void flushQueue();
}

export function isNetworkOnline() {
  return online;
}

export function isDurable() {
  return durable;
}

/**
 * Run a write, or write down what it would have been.
 *
 * Returns true when it went through and false when it was held, so a caller
 * can tell the user which happened instead of claiming success either way.
 */
export async function queueWrite(intent: Omit<WriteIntent, "id" | "queuedAt">): Promise<boolean> {
  if (online) {
    await perform({ ...intent, id: "direct", queuedAt: new Date().toISOString() });
    return true;
  }
  pending.push({ ...intent, id: crypto.randomUUID(), queuedAt: new Date().toISOString() });
  persist();
  emit();
  return false;
}

async function perform(i: WriteIntent) {
  /*
   * The one place a dynamic table name is used, so the one place the generated
   * schema types cannot help: they key every method off a literal table name,
   * and a replayed intent only knows its table at runtime. Cast here and
   * nowhere else — the callers that build intents are still checked against
   * their own table's shape.
   */
  const db = supabase as unknown as {
    from: (t: string) => {
      insert: (v: unknown) => Promise<{ error: { message: string } | null }>;
      update: (v: unknown) => {
        eq: (k: string, v: string) => unknown;
      } & Promise<{ error: { message: string } | null }>;
    };
  };

  if (i.op === "insert") {
    const { error } = await db.from(i.table).insert(i.payload);
    if (error) throw new Error(error.message);
    return;
  }
  let q = db.from(i.table).update(i.payload) as unknown as {
    eq: (k: string, v: string) => typeof q;
  } & Promise<{ error: { message: string } | null }>;
  for (const [k, v] of Object.entries(i.match ?? {})) q = q.eq(k, v);
  const { error } = await q;
  if (error) throw new Error(error.message);
}

/** Replay what is waiting, oldest first. */
export async function flushQueue(): Promise<number> {
  if (!online || !pending.length) return 0;
  const batch = pending;
  pending = [];
  persist();
  emit();

  let done = 0;
  for (const i of batch) {
    try {
      await perform(i);
      done += 1;
    } catch {
      // A write that fails on replay goes back rather than being dropped:
      // losing it silently is the whole failure this exists to prevent.
      pending.push(i);
    }
  }
  persist();
  emit();
  return done;
}

export function pendingWrites(): WriteIntent[] {
  return pending;
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useNetworkOnline() {
  return useSyncExternalStore(
    subscribe,
    () => online,
    () => true,
  );
}

export function usePendingCount() {
  return useSyncExternalStore(
    subscribe,
    () => pending.length,
    () => 0,
  );
}

/**
 * Anything typed but not submitted, kept where the typing happens.
 *
 * A power cut between two keystrokes loses a half-written consult note, which
 * is the commonest way this product could waste somebody's time. Drafts are
 * per key, cleared on submit, and failing to save one is never allowed to break
 * the form it belongs to.
 */
export function saveDraft(key: string, value: unknown) {
  try {
    localStorage.setItem(`caricare-draft:${key}`, JSON.stringify(value));
  } catch {
    /* a lost draft is a lost draft, not a lost form */
  }
}

export function readDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`caricare-draft:${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(`caricare-draft:${key}`);
  } catch {
    /* ignore */
  }
}
