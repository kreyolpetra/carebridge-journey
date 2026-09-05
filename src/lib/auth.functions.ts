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

/** Roles that carry access to other people's records, and so cannot be self-declared. */
const VERIFIED_ROLES = new Set(["clinician", "ministry", "insurer", "admin"]);

/** The roles the profiles table will accept. */
export type AppRole = "patient" | "clinician" | "ministry" | "insurer" | "admin";

export async function provisionProfile({
  data,
}: {
  data: {
    userId: string;
    fullName: string;
    /**
     * Narrowed to the roles the database actually accepts. It was `string`,
     * which meant a typo in a caller compiled fine and failed at write time.
     */
    role: AppRole;
    licenceNo?: string | null;
    facilityId?: string | null;
    staffRole?: string | null;
  };
}) {
  const { supabase } = await import("@/integrations/supabase/client");
  // Signing up as a clinician used to grant the role outright: a dropdown
  // selection was enough to read identified charts. The role is still recorded
  // — it is what the facility will verify against — but it starts pending, and
  // AppShell holds a pending account out of every clinical surface.
  /*
   * The one account nobody else can confirm.
   *
   * Verification means "a facility vouched for this licence", and it is right
   * that a clinician joining an existing facility waits for it. The person
   * bringing a new practice onto CareBridge has no such facility — that is the
   * thing they are about to create — so holding them pending would park them
   * at a wall with nobody on the other side of it, forever. They self-attest,
   * become the administrator of what they create, and every colleague they add
   * afterwards waits for them. Somebody has to be first.
   */
  const foundingAdmin = data.staffRole === "org_admin" && !data.facilityId;
  const verification_status =
    VERIFIED_ROLES.has(data.role) && !foundingAdmin ? "pending" : "verified";
  await supabase.from("profiles").upsert(
    {
      id: data.userId,
      full_name: data.fullName,
      primary_role: data.role,
      onboarded: false,
      verification_status,
      licence_no: data.licenceNo ?? null,
      facility_id: data.facilityId ?? null,
      staff_role: (data.staffRole ?? null) as never,
    },
    { onConflict: "id" },
  );
  await supabase
    .from("user_roles")
    .upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role" });
  return { ok: true, verification_status };
}
