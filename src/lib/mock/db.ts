import { buildSeed, type Tables } from "./seed";

const STORAGE_KEY = "caricare-grid-mock-db-v1";

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
  return loadPersisted() ?? buildSeed();
}

// One store per JS realm (browser tab, or the Node dev-server process during
// SSR of the few routes that still render server-side). See client.ts for why
// that split is fine for this app.
let store: Tables = createStore();

let saveScheduled = false;
export function persist() {
  if (typeof window === "undefined" || !window.localStorage) return;
  if (saveScheduled) return;
  saveScheduled = true;
  queueMicrotask(() => {
    saveScheduled = false;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      // demo-only persistence; ignore quota errors
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
    } catch {
      // ignore
    }
  }
}

export { HERO_PATIENT_ID } from "./seed";
