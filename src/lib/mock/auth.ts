import { DEMO_ACCOUNTS, DEMO_PASSWORD, type DemoPersona } from "../demo-accounts";
import { DEMO_USER_IDS } from "./seed";
import { getTable } from "./db";

type MockUser = { id: string; email: string; user_metadata: Record<string, unknown> };
type MockSession = { access_token: string; user: MockUser };
type AuthChangeEvent = "SIGNED_IN" | "SIGNED_OUT";
type Listener = (event: AuthChangeEvent, session: MockSession | null) => void;

const SESSION_KEY = "caricare-grid-mock-session";
const listeners = new Set<Listener>();

// The session lives in memory and is only mirrored to localStorage so it can
// survive a reload. Some browsers refuse localStorage on file:// URLs, and if
// that were the only store, signing in would appear to succeed and then bounce
// straight back to the login screen — so memory is the source of truth.
let memorySession: MockSession | null = null;

function readSession(): MockSession | null {
  if (memorySession) return memorySession;
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    memorySession = raw ? (JSON.parse(raw) as MockSession) : null;
    return memorySession;
  } catch {
    return null;
  }
}

function writeSession(session: MockSession | null) {
  memorySession = session;
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // Best-effort persistence only; the in-memory session above still works.
  }
}

function notify(event: AuthChangeEvent, session: MockSession | null) {
  for (const l of listeners) l(event, session);
}

function demoPersonaForEmail(email: string): DemoPersona | null {
  const entry = (Object.entries(DEMO_ACCOUNTS) as [DemoPersona, (typeof DEMO_ACCOUNTS)[DemoPersona]][]).find(([, acc]) => acc.email === email);
  return entry ? entry[0] : null;
}

function sessionFor(userId: string, email: string, metadata: Record<string, unknown> = {}): MockSession {
  return {
    access_token: `mock.${userId}.${Date.now()}`,
    user: { id: userId, email, user_metadata: metadata },
  };
}

export const mockAuth = {
  async getSession() {
    return { data: { session: readSession() }, error: null };
  },

  async getUser() {
    const session = readSession();
    if (!session) return { data: { user: null }, error: { message: "Auth session missing" } };
    return { data: { user: session.user }, error: null };
  },

  async getClaims(token: string) {
    const session = readSession();
    if (!session || session.access_token !== token) return { data: null, error: { message: "Invalid token" } };
    return { data: { claims: { sub: session.user.id, email: session.user.email } }, error: null };
  },

  onAuthStateChange(cb: Listener) {
    listeners.add(cb);
    return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
  },

  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const persona = demoPersonaForEmail(email);
    if (persona) {
      if (password !== DEMO_PASSWORD) return { data: { session: null, user: null }, error: { message: "Invalid login credentials" } };
      const userId = DEMO_USER_IDS[persona];
      const session = sessionFor(userId, email, { full_name: DEMO_ACCOUNTS[persona].name, demo_persona: persona });
      writeSession(session);
      notify("SIGNED_IN", session);
      return { data: { session, user: session.user }, error: null };
    }

    const users = getTable("auth_users") as { id: string; email: string; password: string }[];
    const found = users.find((u) => u.email === email && u.password === password);
    if (!found) return { data: { session: null, user: null }, error: { message: "Invalid login credentials" } };
    const session = sessionFor(found.id, email);
    writeSession(session);
    notify("SIGNED_IN", session);
    return { data: { session, user: session.user }, error: null };
  },

  async signUp({ email, password, options }: { email: string; password: string; options?: { data?: Record<string, unknown> } }) {
    const users = getTable("auth_users") as { id: string; email: string; password: string }[];
    if (users.some((u) => u.email === email)) return { data: { user: null, session: null }, error: { message: "User already registered" } };
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
    users.push({ id, email, password });
    const session = sessionFor(id, email, options?.data ?? {});
    writeSession(session);
    notify("SIGNED_IN", session);
    return { data: { user: session.user, session }, error: null };
  },

  async signOut() {
    writeSession(null);
    notify("SIGNED_OUT", null);
    return { error: null };
  },

  admin: {
    async listUsers() {
      return { data: { users: [] }, error: null };
    },
    async createUser() {
      return { data: { user: null }, error: { message: "Not supported in the mock backend" } };
    },
    async updateUserById() {
      return { data: { user: null }, error: null };
    },
  },
};
