/**
 * Standing a facility up on the Grid.
 *
 * The product could be joined but not started: signing up made you pick a
 * facility that already existed and wait for it to confirm you, so a brand-new
 * rural clinic — the exact customer this is built for — had no way in at all.
 *
 * Organised around ending with a worklist that has people in it, not around
 * collecting settings. For places coming from paper, configuration was never
 * the hard part; the first fifty patients is. A wizard that finishes with every
 * option correct and a blank screen has failed, however tidy the form was.
 *
 * Every step is skippable and every default is stated out loud. A wizard you
 * cannot escape is the worst possible first five minutes, and a default nobody
 * can see is a decision taken on their behalf.
 */
import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  Scan,
  Pill as PillIcon,
  BedDouble,
  Users,
  UserPlus,
  Trash2,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { islandsQuery, facilitiesQuery, patientsQuery } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import {
  KIND_PRESET,
  KIND_LABEL,
  KIND_BLURB,
  type FacilityKind,
  type FacilityCapabilities,
} from "@/lib/facility-capability";
import { Panel, PanelHeader, Pill } from "@/components/grid";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/setup")({ component: Setup });

const STEPS = ["The place", "What it has", "Your people", "Your patients"] as const;

type Invite = { name: string; role: StaffRole };
type StaffRole = "doctor" | "nurse" | "front_desk" | "org_admin";

const STAFF_ROLES = [
  { value: "doctor", label: "Doctor" },
  { value: "nurse", label: "Nurse" },
  { value: "front_desk", label: "Front desk" },
  { value: "org_admin", label: "Administrator" },
];

function Setup() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { profile, refreshProfile } = useAuth();
  const islands = useQuery(islandsQuery);
  const facilities = useQuery(facilitiesQuery);
  const patients = useQuery(patientsQuery);

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [islandCode, setIslandCode] = useState("JM");
  const [kind, setKind] = useState<FacilityKind>("clinic");
  const [caps, setCaps] = useState<FacilityCapabilities>(KIND_PRESET.clinic);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<StaffRole>("nurse");
  /**
   * Where finishing takes you, and the only honest answer to "bring your
   * patients in".
   *
   * The first version of this step was a tick box that connected you to the
   * patients already on the Grid. It did nothing, because there is nothing
   * honest for it to do: a clinic does not get to see a country's records by
   * ticking a box — it sees the people it treats, once a lawful basis exists.
   * So the choice now changes where you land, which is real, and the copy says
   * plainly that the first worklist is short.
   */
  const [startWith, setStartWith] = useState<"grid" | "import">("grid");

  /** Choosing a type re-fills the boxes; the next step lets them be corrected. */
  const chooseKind = (k: FacilityKind) => {
    setKind(k);
    setCaps(KIND_PRESET[k]);
  };

  const islandName = useMemo(
    () => (islands.data ?? []).find((i) => i.code === islandCode)?.name ?? islandCode,
    [islands.data, islandCode],
  );

  /**
   * How many people would land on the first worklist.
   *
   * Counted from patients already on the Grid for that country, because that is
   * what actually happens when a clinic joins a shared record: the people are
   * already there, and joining is what makes them visible.
   */
  const wouldSee = useMemo(
    () => islandPatientCount(islandCode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patients.data, islandCode],
  );

  /**
   * People already monitored in that country, counted from the directory
   * itself rather than from a stored total — a number on a setup screen that
   * turns out to be stale is worse than no number.
   */
  function islandPatientCount(code: string) {
    return (patients.data ?? []).filter((p) => p.island_code === code).length;
  }

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("facilities")
        .insert({
          name: name.trim(),
          island_code: islandCode,
          kind,
          beds_total: caps.beds_total,
          beds_occupied: 0,
          has_lab: caps.has_lab,
          has_imaging: caps.has_imaging,
          has_pharmacy: caps.has_pharmacy,
          session_capacity: caps.session_capacity,
          continuity_status: "operational",
          continuity_note: "",
          continuity_since: null,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      const facilityId = (data as { id: string }).id;

      // The person setting it up works there, or nothing else in the product
      // will let them see anything.
      if (profile?.id) {
        await supabase.from("facility_staff").insert({
          facility_id: facilityId,
          user_id: profile.id,
          full_name: profile.full_name,
          staff_role: "org_admin",
        });
        await supabase.from("profiles").update({ facility_id: facilityId }).eq("id", profile.id);
      }

      for (const inv of invites) {
        // Invited, not yet joined: a staff row with no user behind it, which
        // is what an invitation is until somebody accepts it.
        await supabase.from("facility_staff").insert({
          facility_id: facilityId,
          user_id: null,
          full_name: inv.name,
          staff_role: inv.role,
        });
      }
      return facilityId;
    },
    onSuccess: async () => {
      // The profile now points at a different building, and it is held in auth
      // context rather than the query cache — so invalidating queries alone
      // left the whole app still working in the old facility, with the old
      // facility's session size drawing the worklist's line.
      await refreshProfile();
      void qc.invalidateQueries();
      toast("Workspace ready", { description: `${name.trim()} is on the Grid.` });
      void navigate({ to: startWith === "import" ? "/facility" : "/patients" });
    },
    onError: (e: Error) => toast("Could not finish setup", { description: e.message }),
  });

  const canNext =
    step === 0 ? name.trim().length > 1 : step === 1 ? caps.session_capacity > 0 : true;

  const toggle = (k: "has_lab" | "has_imaging" | "has_pharmacy") =>
    setCaps((c) => ({ ...c, [k]: !c[k] }));

  return (
    <div className="mx-auto w-full max-w-[820px] px-5 py-8">
      <div className="mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
          Set up your workspace
        </p>
        <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight">
          Put your facility on the Grid
        </h1>
        <p className="mt-1.5 max-w-[62ch] text-[13.5px] leading-relaxed text-muted-foreground">
          Four steps, and you can skip any of them. Everything here is editable afterwards — the
          point is to finish with a worklist that has people in it, not a form that is complete.
        </p>
      </div>

      {/* Where you are, and how far there is to go. */}
      <ol className="mb-4 flex flex-wrap items-center gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              className={
                "flex items-center gap-2 rounded-lg border px-2.5 py-1 text-[12.5px] font-semibold transition-colors " +
                (i === step
                  ? "border-primary bg-primary/10 text-primary"
                  : i < step
                    ? "border-border text-muted-foreground hover:text-foreground"
                    : "border-border text-muted-foreground/60")
              }
            >
              <span className="mono-num text-[11px]">
                {i < step ? <Check className="h-3 w-3" /> : `0${i + 1}`}
              </span>
              {s}
            </button>
            {i < STEPS.length - 1 ? (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
            ) : null}
          </li>
        ))}
      </ol>

      <Panel>
        {step === 0 ? (
          <>
            <PanelHeader
              title="What is this place?"
              subtitle="The name people who work here would use, and the country it stands in"
            />
            <div className="space-y-4 px-5 py-5">
              <div className="space-y-1.5">
                <Label htmlFor="f-name">Facility name</Label>
                <Input
                  id="f-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Black River Community Clinic"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-island">Country</Label>
                <select
                  id="f-island"
                  value={islandCode}
                  onChange={(e) => setIslandCode(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
                >
                  {(islands.data ?? []).map((i) => (
                    <option key={i.code} value={i.code}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>What kind of place is it?</Label>
                <p className="text-[12px] text-muted-foreground">
                  This only fills in the next step for you. Whatever it gets wrong, you correct in
                  one click.
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(Object.keys(KIND_PRESET) as FacilityKind[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => chooseKind(k)}
                      className={
                        "rounded-xl border p-3 text-left transition-colors " +
                        (kind === k
                          ? "border-primary bg-primary/8 ring-1 ring-inset ring-primary/25"
                          : "border-border hover:border-primary/40")
                      }
                    >
                      <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
                        <Building2 className="h-3.5 w-3.5 text-primary" />
                        {KIND_LABEL[k]}
                      </span>
                      <span className="mt-1 block text-[11.5px] leading-relaxed text-muted-foreground">
                        {KIND_BLURB[k]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <PanelHeader
              title="What does it actually have?"
              subtitle={`Filled in from "${KIND_LABEL[kind]}" — change anything that is wrong`}
            />
            <div className="space-y-4 px-5 py-5">
              <div className="grid gap-2 sm:grid-cols-3">
                {(
                  [
                    ["has_lab", "Laboratory", FlaskConical, "Bloods run on site"],
                    ["has_imaging", "Imaging", Scan, "X-ray or ultrasound here"],
                    ["has_pharmacy", "Dispensary", PillIcon, "Medicines handed out here"],
                  ] as const
                ).map(([key, label, Icon, blurb]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggle(key)}
                    className={
                      "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors " +
                      (caps[key]
                        ? "border-primary bg-primary/8"
                        : "border-border hover:border-primary/40")
                    }
                  >
                    <span
                      className={
                        "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border " +
                        (caps[key]
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border")
                      }
                    >
                      {caps[key] ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </span>
                      <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                        {blurb}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="f-beds">
                    <BedDouble className="mr-1 inline h-3.5 w-3.5" />
                    Beds for overnight stays
                  </Label>
                  <Input
                    id="f-beds"
                    type="number"
                    min={0}
                    value={caps.beds_total}
                    onChange={(e) =>
                      setCaps((c) => ({ ...c, beds_total: Math.max(0, Number(e.target.value)) }))
                    }
                  />
                  <p className="text-[11.5px] text-muted-foreground">
                    Leave at zero and the ward list never appears. That is the only thing the word
                    "hospital" would have decided.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="f-cap">
                    <Users className="mr-1 inline h-3.5 w-3.5" />
                    Patients one clinician can see in a session
                  </Label>
                  <Input
                    id="f-cap"
                    type="number"
                    min={1}
                    value={caps.session_capacity}
                    onChange={(e) =>
                      setCaps((c) => ({
                        ...c,
                        session_capacity: Math.max(1, Number(e.target.value)),
                      }))
                    }
                  />
                  <p className="text-[11.5px] text-muted-foreground">
                    This draws the line on the worklist. Guess honestly — too high and it will
                    quietly promise a day nobody can work.
                  </p>
                </div>
              </div>

              {!caps.has_lab ? (
                <p className="rounded-lg border border-border bg-surface px-3 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
                  With no laboratory here, results taken elsewhere on the Grid matter more, not less
                  — the chart will lead with what has already been done so nobody sends a patient
                  away for a test that exists.
                </p>
              ) : null}
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <PanelHeader
              title="Who else works here?"
              subtitle="They get an invitation. You can do this later — nothing depends on it."
            />
            <div className="space-y-4 px-5 py-5">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[180px] flex-1 space-y-1.5">
                  <Label htmlFor="i-name">Name</Label>
                  <Input
                    id="i-name"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="e.g. Sister Yvette Marshall"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="i-role">Their job</Label>
                  <select
                    id="i-role"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as StaffRole)}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
                  >
                    {STAFF_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!inviteName.trim()) return;
                    setInvites((v) => [...v, { name: inviteName.trim(), role: inviteRole }]);
                    setInviteName("");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12.5px] font-semibold transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>

              {invites.length ? (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {invites.map((inv, n) => (
                    <li
                      key={`${inv.name}-${n}`}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <span className="text-[13px]">
                        {inv.name}
                        <Pill className="ml-2 border-border bg-surface text-muted-foreground">
                          {STAFF_ROLES.find((r) => r.value === inv.role)?.label ?? inv.role}
                        </Pill>
                      </span>
                      <button
                        type="button"
                        onClick={() => setInvites((v) => v.filter((_, x) => x !== n))}
                        className="text-muted-foreground transition-colors hover:text-critical"
                        aria-label={`Remove ${inv.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12.5px] text-muted-foreground">
                  Nobody added yet. You are the administrator either way.
                </p>
              )}

              <p className="rounded-lg border border-border bg-surface px-3 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
                What each person can see follows from their job, not from a list of switches. A
                nurse sees a nursing sidebar; front desk can look someone up to register them and
                cannot open the chart.
              </p>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <PanelHeader
              title="Bring your patients in"
              subtitle="The step that decides whether tomorrow morning is useful"
            />
            <div className="space-y-4 px-5 py-5">
              {(
                [
                  [
                    "grid",
                    "My patients are already on the Grid",
                    `About ${wouldSee} people in ${islandName} are monitored here already. You do not import them — you see the ones you treat, as soon as a basis exists: an episode at this facility, a referral you accept, a discharge handed to you, or their consent.`,
                  ],
                  [
                    "import",
                    "I have a list to bring in",
                    "A spreadsheet of names, dates of birth and conditions — the realistic first day of a pilot. Finishing takes you straight to the importer instead of the worklist.",
                  ],
                ] as const
              ).map(([key, title, blurb]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStartWith(key)}
                  className={
                    "flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors " +
                    (startWith === key ? "border-primary bg-primary/8" : "border-border")
                  }
                >
                  <span
                    className={
                      "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border " +
                      (startWith === key
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border")
                    }
                  >
                    {startWith === key ? <Check className="h-2.5 w-2.5" /> : null}
                  </span>
                  <span>
                    <span className="block text-[13.5px] font-semibold">{title}</span>
                    <span className="mt-1 block text-[12.5px] leading-relaxed text-muted-foreground">
                      {blurb}
                    </span>
                  </span>
                </button>
              ))}

              {/* Said before they see it, rather than left as a disappointment. */}
              <p className="rounded-lg border border-high/40 bg-high/10 px-3 py-2.5 text-[12.5px] leading-relaxed">
                Your first worklist will be short — a new facility has no history behind it. It
                fills as you see people, accept referrals and receive discharges. That is the honest
                shape of week one, not a fault.
              </p>

              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                <p className="text-[13.5px] font-semibold">What this facility is set up to do</p>
                <ul className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                  <li>
                    · A worklist cut at{" "}
                    <span className="font-semibold text-foreground">
                      {caps.session_capacity} patients a session
                    </span>
                    , with everyone below the line handed on rather than dropped
                  </li>
                  <li>
                    ·{" "}
                    {caps.beds_total > 0
                      ? `A ward list for your ${caps.beds_total} beds, and discharge hand-offs back to the clinics that follow your patients up`
                      : "No ward list, because you said there are no beds — and discharge hand-offs from hospitals arriving on your worklist"}
                  </li>
                  <li>
                    ·{" "}
                    {caps.has_lab
                      ? "Results from your own laboratory alongside everything taken elsewhere on the Grid"
                      : "Results taken anywhere on the Grid, leading with tests already done so nobody repeats one"}
                  </li>
                  <li>· A care line on WhatsApp in English, Patois, Kreyòl and Spanish</li>
                </ul>
              </div>
            </div>
          </>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={() => setStep((v) => Math.max(0, v - 1))}
            disabled={step === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-semibold transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </button>

          {step < STEPS.length - 1 ? (
            <>
              <button
                type="button"
                onClick={() => setStep((v) => v + 1)}
                className="ml-auto text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Skip this
              </button>
              <button
                type="button"
                onClick={() => setStep((v) => v + 1)}
                disabled={!canNext}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => create.mutate()}
              disabled={!name.trim() || create.isPending}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {create.isPending
                ? "Setting up…"
                : startWith === "import"
                  ? "Finish and import my list"
                  : "Finish and open my worklist"}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </Panel>
    </div>
  );
}
