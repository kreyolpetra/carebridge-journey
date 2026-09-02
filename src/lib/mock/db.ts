import { buildSeed, SEED_VERSION, type Tables } from "./seed";

const STORAGE_PREFIX = "caricare-grid-mock-db-v";
const STORAGE_KEY = `${STORAGE_PREFIX}${SEED_VERSION}`;

/** Drop copies written by an earlier seed so they do not sit in storage. */
function clearSupersededStores() {
  if (typeof window === "undefined" || !window.localStorage) return;
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
  if (typeof window === "undefined" || !window.localStorage) return null;
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
  if (typeof window === "undefined" || !window.localStorage) return;
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
          "CariCare Grid: could not persist the mock database (storage quota). " +
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
