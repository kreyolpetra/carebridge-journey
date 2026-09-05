/**
 * The island connection dropping, and what the product does about it.
 *
 * Rural Caribbean connectivity is not an outage, it is Tuesday. A clinical tool
 * that fails when the signal does gets abandoned, so the product carries a
 * toggle that simulates it — and the toggle has to tell the truth, because a
 * pill reading "Offline — queuing" over screens that quietly dropped the write
 * is precisely the kind of claim this product refuses to make everywhere else.
 *
 * So there is a real queue. A write handed to `queueWrite` runs immediately
 * when the connection is up, and is held with a human-readable label when it is
 * not; reconnecting replays them in the order they were made. The pill counts
 * what is actually waiting rather than asserting that something is.
 *
 * Two honest limits, stated here and on screen rather than discovered:
 *
 *   1. The queue lives in memory. A reload loses it. Surviving a refresh means
 *      persisting the intent of a write rather than a closure, which is real
 *      work and not pretended at here.
 *   2. Not every write goes through it. The ones that do are the ones a person
 *      makes while the signal is bad — a reading sent from a house 38 km from
 *      the clinic, a patient marked as contacted in a van. Reads still fail
 *      normally, because a stale chart shown as current would be worse than an
 *      error.
 */
import { useSyncExternalStore } from "react";

type Listener = () => void;

let online = true;
const listeners = new Set<Listener>();

/** A write waiting for the signal to come back. */
type Pending = { id: string; label: string; run: () => Promise<unknown> };
let pending: Pending[] = [];

/** Bumped on every change so `useSyncExternalStore` sees a new snapshot. */
let version = 0;

function emit() {
  version += 1;
  for (const l of listeners) l();
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

/**
 * Run a write, or hold it until the connection returns.
 *
 * Returns true when it ran and false when it was queued, so a caller can tell
 * the user which of those happened instead of claiming success either way.
 */
export async function queueWrite(label: string, run: () => Promise<unknown>): Promise<boolean> {
  if (online) {
    await run();
    return true;
  }
  pending.push({ id: crypto.randomUUID(), label, run });
  emit();
  return false;
}

/** Replay what is waiting, oldest first. */
export async function flushQueue(): Promise<number> {
  if (!online || !pending.length) return 0;
  const batch = pending;
  pending = [];
  emit();
  let done = 0;
  for (const p of batch) {
    try {
      await p.run();
      done += 1;
    } catch {
      // A write that fails on replay goes back in the queue rather than being
      // dropped: losing it silently is the failure this exists to prevent.
      pending.push(p);
    }
  }
  emit();
  return done;
}

export function pendingWrites() {
  return pending.map((p) => p.label);
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

/** How many writes are waiting, for the pill. */
export function usePendingCount() {
  return useSyncExternalStore(
    subscribe,
    () => pending.length,
    () => 0,
  );
}

/** Exposed for tests and for the "what is simulated" screen. */
export function queueVersion() {
  return version;
}
