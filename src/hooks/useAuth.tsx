import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  full_name: string;
  primary_role: string;
  island_code: string | null;
  patient_id: string | null;
  provider_id: string | null;
  organisation: string | null;
  facility_id: string | null;
  staff_role: string | null;
  is_demo: boolean;
  onboarded: boolean;
  /**
   * Clinical roles are claimed at sign-up and verified afterwards. Until a
   * facility confirms the licence, a self-declared clinician holds the role
   * but none of its reach — see AppShell's pending gate.
   */
  verification_status: string | null;
  licence_no: string | null;
};

type AuthValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: string;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, []);

  useEffect(() => {
    let active = true;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      void loadProfile(next?.user?.id);
    });

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session?.user?.id);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      role: profile?.primary_role ?? "patient",
      loading,
      /*
       * Ask who is signed in; do not remember.
       *
       * This read the session held in React state, which at the one moment it
       * matters most — the instant after registering — has not committed yet.
       * So it loaded the profile of nobody, set it to null, and AppShell's
       * "if (profile && pending)" gate found no profile and let the account
       * straight through into the clinical surfaces. A reload fixed it, which
       * is the worst kind of bug: correct on every screen except the first.
       *
       * Caught by registering a clinician and looking at what they saw before
       * touching anything: the whole application, then the verification wall
       * after a refresh.
       */
      refreshProfile: async () => {
        const { data } = await supabase.auth.getSession();
        await loadProfile(data.session?.user?.id);
      },
      signOut: async () => {
        await supabase.auth.signOut();
        setProfile(null);
      },
    }),
    [session, profile, loading, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
