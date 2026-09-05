import { buildSeed, SEED_VERSION, type Tables } from "./seed";

const STORAGE_PREFIX = "carebridge-journey-mock-db-v";
const STORAGE_KEY = `${STORAGE_PREFIX}${SEED_VERSION}`;

/**
 * Whether this browser will let us touch localStorage at all.
 *
 * A published artifact runs inside a sandboxed iframe where every access can
 * throw. Probing once and remembering the answer keeps the failure to a single
 * exception rather than one per write.
 */
let storageUsable: boolean | null = null;
function storageOk(): boolean {
  if (storageUsable !== null) return storageUsable;
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      storageUsable = false;
    } else {
      window.localStorage.setItem("__ccg_probe", "1");
      window.localStorage.removeItem("__ccg_probe");
      storageUsable = true;
    }
  } catch {
    storageUsable = false;
  }
  return storageUsable;
}

/** Drop copies written by an earlier seed so they do not sit in storage. */
function clearSupersededStores() {
  if (!storageOk()) return;
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(STORAGE_PREFIX) && key !== STORAGE_KEY) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // storage unavailable; nothing to clean
  }
}

function loadPersisted(): Tables | null {
  if (!storageOk()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Tables) : null;
  } catch {
    return null;
  }
}

function createStore(): Tables {
  clearSupersededStores();
  return loadPersisted() ?? buildSeed();
}

// One store per JS realm (browser tab, or the Node dev-server process during
// SSR of the few routes that still render server-side). See client.ts for why
// that split is fine for this app.
let store: Tables = createStore();

let saveScheduled = false;
let warnedAboutQuota = false;
export function persist() {
  if (!storageOk()) return;
  if (saveScheduled) return;
  saveScheduled = true;
  queueMicrotask(() => {
    saveScheduled = false;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (err) {
      // The dataset is a few megabytes and localStorage caps around five, so
      // this is a real possibility rather than a theoretical one. Swallowing it
      // silently meant the app kept working from memory while every change
      // quietly failed to survive a reload — the worst of both. Warn once and
      // carry on in memory.
      if (!warnedAboutQuota) {
        warnedAboutQuota = true;
        console.warn(
          "CareBridge Journey: could not persist the mock database (storage quota). " +
            "The app will keep working, but changes will not survive a reload.",
          err,
        );
      }
    }
  });
}

export function getTable(name: string): Record<string, unknown>[] {
  if (!store[name]) store[name] = [];
  return store[name];
}

export function resetDb() {
  store = buildSeed();
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      clearSupersededStores();
    } catch {
      // ignore
    }
  }
}

export { HERO_PATIENT_ID } from "./seed";
