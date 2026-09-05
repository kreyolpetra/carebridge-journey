import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  ArrowRight,
  Coins,
  Hospital,
  Loader2,
  MessageSquareText,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { facilitiesQuery } from "@/lib/api";
import { demoSignIn, provisionProfile, type AppRole } from "@/lib/auth.functions";
import { useAuth } from "@/hooks/useAuth";
import { DEMO_ACCOUNTS, type DemoPersona } from "@/lib/demo-accounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — CareBridge Journey" },
      {
        name: "description",
        content:
          "Sign in to CareBridge Journey: WhatsApp intake, AI triage, cross-island telemedicine routing and chronic disease management for the Caribbean.",
      },
      { property: "og:title", content: "Sign in — CareBridge Journey" },
      {
        property: "og:description",
        content:
          "The front door to Caribbean healthcare. One identity, one record, one triage brain.",
      },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/" });
  },
  component: AuthPage,
});

const PERSONA_ICON: Record<DemoPersona, typeof Activity> = {
  patient: MessageSquareText,
  clinic_staff: Hospital,
  clinician: Stethoscope,
  ministry: Activity,
  insurer: Coins,
};

function AuthPage() {
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  // An app role, not a demo persona: the two overlap but "clinic_staff" is a
  // demo login, not a role the profiles table accepts. Typing it as the
  // persona let an invalid role compile.
  const [role, setRole] = useState<AppRole>("patient");
  const [licenceNo, setLicenceNo] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [staffRole, setStaffRole] = useState("doctor");
  const facilities = useQuery(facilitiesQuery);

  // Roles that can reach another person's record have to be claimed against
  // something checkable. The default is "patient" for the same reason.
  const needsVerification = role === "clinician";

  const enterDemo = async (persona: DemoPersona) => {
    setBusy(persona);
    try {
      const creds = await demoSignIn({ data: { persona } });
      const { error } = await supabase.auth.signInWithPassword(creds);
      if (error) throw new Error(error.message);
      toast.success(`Signed in as ${DEMO_ACCOUNTS[persona].name}`);
      void navigate({ to: "/" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open the demo workspace");
    } finally {
      setBusy(null);
    }
  };

  const signIn = async () => {
    setBusy("signin");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    void navigate({ to: "/" });
  };

  const signUp = async () => {
    if (needsVerification && (!licenceNo.trim() || !facilityId)) {
      toast.error(
        "A clinical account needs your registration number and the facility that can confirm it",
      );
      return;
    }
    setBusy("signup");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}/` },
    });
    if (error) {
      setBusy(null);
      toast.error(error.message);
      return;
    }
    if (data.user) {
      await provisionProfile({
        data: {
          userId: data.user.id,
          fullName: fullName || email,
          role,
          licenceNo: needsVerification ? licenceNo.trim() : null,
          // "Not listed" means there is no facility to attach to yet; the
          // wizard creates it and writes them in as its administrator.
          facilityId: needsVerification && facilityId !== "new" ? facilityId : null,
          staffRole: needsVerification ? (facilityId === "new" ? "org_admin" : staffRole) : null,
        },
      });
      // The auth listener loaded a profile that did not exist yet, so the
      // context is holding null. Without this the shell falls back to the
      // "patient" default and walks straight past the verification gate.
      await refreshProfile();
    }
    setBusy(null);
    if (data.session) {
      toast.success(
        needsVerification
          ? "Account created — your facility must confirm your registration before records open"
          : "Account created",
      );
      void navigate({ to: "/" });
    } else {
      toast.success("Account created — check your email to confirm, then sign in.");
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_minmax(0,520px)]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-card px-12 py-12 lg:flex">
        <div className="grid-lines pointer-events-none absolute inset-0 opacity-[0.5]" />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/12 text-primary">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <path d="M3 12h4l2-6 3 13 3-9 2 2h4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="font-display text-[17px] font-bold tracking-tight">
              CareBridge<span className="text-primary"> Journey</span>
            </span>
          </div>
        </div>

        <div className="relative max-w-xl">
          <h1 className="font-display text-4xl font-bold leading-[1.1] tracking-tight">
            The front door to healthcare in the Caribbean.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            WhatsApp intake in Kreyòl, Patois and Spanish, AI triage that catches deterioration
            early, and routing that allocates scarce specialist time by need — so care reaches
            Haiti, not only the islands that can already afford it.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3">
            {[
              { k: "11", v: "countries connected" },
              { k: "70–80%", v: "of deaths are NCDs" },
              { k: "36×", v: "physician gap, HT to CU" },
            ].map((s) => (
              <div key={s.v} className="rounded-xl border border-border bg-background p-4">
                <p className="font-display text-2xl font-bold text-primary">{s.k}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">{s.v}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative flex items-center gap-2 text-[12px] text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Consent-governed cross-border records. Every access is logged.
        </p>
      </section>

      <section className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-[420px]">
          <h2 className="font-display text-2xl font-bold tracking-tight">Sign in to CareBridge</h2>
          <p className="mt-1.5 text-[13.5px] text-muted-foreground">
            Pick a demo workspace for an instant tour, or use an account.
          </p>

          <div className="mt-6 space-y-2">
            {(Object.keys(DEMO_ACCOUNTS) as DemoPersona[]).map((persona) => {
              const account = DEMO_ACCOUNTS[persona];
              const Icon = PERSONA_ICON[persona];
              return (
                <button
                  key={persona}
                  onClick={() => void enterDemo(persona)}
                  disabled={busy !== null}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-surface disabled:opacity-60"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                    {busy === persona ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold">
                      {account.name}
                    </span>
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {account.blurb}
                    </span>
                  </span>
                  <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
          </div>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              or use an account
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button className="w-full" onClick={() => void signIn()} disabled={busy !== null}>
                {busy === "signin" ? "Signing in…" : "Sign in"}
              </Button>
            </TabsContent>

            <TabsContent value="signup" className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email2">Email</Label>
                <Input
                  id="email2"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password2">Password</Label>
                <Input
                  id="password2"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role">I am a…</Label>
                <select
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as AppRole)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-[13.5px]"
                >
                  <option value="patient">Patient</option>
                  <option value="clinician">Clinician</option>
                  <option value="ministry">Ministry / public health</option>
                  <option value="insurer">Insurer</option>
                </select>
              </div>

              {needsVerification ? (
                <div className="space-y-3 rounded-xl border border-border bg-surface p-3.5">
                  <p className="text-[12px] leading-relaxed text-muted-foreground">
                    Clinical accounts reach other people's records, so the claim is checked. You can
                    sign in straight away, but no patient record opens until{" "}
                    {facilities.data?.find((f) => f.id === facilityId)?.name ?? "your facility"}{" "}
                    confirms this registration.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="licence">Medical / nursing council registration number</Label>
                    <Input
                      id="licence"
                      value={licenceNo}
                      onChange={(e) => setLicenceNo(e.target.value)}
                      placeholder="e.g. MCTT-2019-04417"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="facility">Facility that can confirm you</Label>
                    <select
                      id="facility"
                      value={facilityId}
                      onChange={(e) => setFacilityId(e.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-[13.5px]"
                    >
                      <option value="">Select a facility…</option>
                      {(facilities.data ?? []).map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} · {f.island_code}
                        </option>
                      ))}
                      {/* The first person at a new clinic had nowhere to go.
                          Signing up demanded a facility that could confirm you,
                          which assumes the building is already on CareBridge —
                          so the one person the setup wizard exists for, whoever
                          brings a new practice on, could not legitimately reach
                          it. They can now, and they arrive as its administrator
                          because somebody has to be first. */}
                      <option value="new">My facility is not listed yet</option>
                    </select>
                    {facilityId === "new" ? (
                      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                        You will set the place up after signing in, and you will administer it.
                        Everyone you add after that waits for you to confirm them.
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="staffRole">Your role there</Label>
                    <select
                      id="staffRole"
                      value={staffRole}
                      onChange={(e) => setStaffRole(e.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-[13.5px]"
                    >
                      <option value="doctor">Doctor</option>
                      <option value="nurse">Nurse</option>
                      <option value="front_desk">Front desk / registration</option>
                      <option value="org_admin">Facility admin</option>
                    </select>
                  </div>
                </div>
              ) : null}
              <Button className="w-full" onClick={() => void signUp()} disabled={busy !== null}>
                {busy === "signup" ? "Creating…" : "Create account"}
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </section>
    </div>
  );
}
