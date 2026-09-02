// Previously two TanStack Start server functions delegating to demo-auth.server.ts
// (which called supabaseAdmin's real Auth admin API). Now that the backend is an
// in-memory mock with no real RLS/admin boundary, demo accounts are pre-seeded
// directly (see src/lib/mock/seed.ts DEMO_USER_IDS) and these just need to run in
// the browser against the mock client — no server round-trip required.
import { DEMO_ACCOUNTS, DEMO_PASSWORD, type DemoPersona } from "./demo-accounts";

export async function demoSignIn({ data }: { data: { persona: DemoPersona } }) {
  const account = DEMO_ACCOUNTS[data.persona];
  return { email: account.email, password: DEMO_PASSWORD };
}

export async function provisionProfile({ data }: { data: { userId: string; fullName: string; role: string } }) {
  const { supabase } = await import("@/integrations/supabase/client");
  await supabase.from("profiles").upsert({ id: data.userId, full_name: data.fullName, primary_role: data.role, onboarded: false }, { onConflict: "id" });
  await supabase.from("user_roles").upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role" });
  return { ok: true };
}
