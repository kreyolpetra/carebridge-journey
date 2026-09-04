import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  Lock,
  Check,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  HERO_PATIENT_ID,
  islandsQuery,
  patientBundleQuery,
  patientsQuery,
  providersQuery,
  riskScoresQuery,
  workflowEventsQuery,
  type Patient,
  type RiskScore,
  referralsQuery,
  consultationsQuery,
} from "@/lib/api";
import { runClinicianBrief } from "@/lib/agents/clinician";
import { AgentBrief } from "@/components/app/AgentBrief";
import { useAuth } from "@/hooks/useAuth";
import { useScope } from "@/hooks/useScope";
import { useLogRecordAccess } from "@/lib/audit";
import { useAccessIndex, type AccessDecision } from "@/lib/access-basis";
import { useWorklist, rankTone, type WorklistItem } from "@/hooks/useWorklist";
import { useMyFacility } from "@/hooks/useMyFacility";
import {
  allocateAttention,
  capacityForFacility,
  countByDisposition,
  DEFAULT_SESSION_CAPACITY,
  DISPOSITION_LABEL,
} from "@/lib/attention";
import { acceptReferral as acceptReferralOnGrid } from "@/lib/referrals";
import { InSessionNow } from "@/components/patient/InSessionNow";
import { BASIS_LABEL, BASIS_TONE } from "@/lib/access";
import { PatientChart } from "@/components/patient/PatientChart";
import { NoBasisPanel } from "@/components/patient/NoBasisPanel";
import { Panel, PanelHeader, Pill, Loading, Stat } from "@/components/grid";
import { bandClasses, clockTime } from "@/lib/format";

/** How many below-the-line rows to draw when the section is opened. */
const BELOW_PREVIEW = 25;

export const Route = createFileRoute("/_authenticated/patients")({
  head: () => ({
    meta: [
      { title: "Patients — Worklist & Directory | CariCare Grid" },
      {
        name: "description",
        content:
          "A queue ordered by clinical risk instead of arrival time, with the patient's whole longitudinal record assembled from fragmented island systems.",
      },
      { property: "og:title", content: "Patients — Worklist & Directory" },
      {
        property: "og:description",
        content: "See who is deteriorating before they arrive at the emergency room.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { patient?: string } =>
    typeof search["patient"] === "string" ? { patient: search["patient"] as string } : {},
  component: Patients,
});

const PAGE_SIZE = 20;
/** The wide view drops the chart, so it can afford far more rows per page. */
const WIDE_PAGE_SIZE = 60;

const BANDS = [
  { key: "critical", label: "Critical", hint: "Contact today", tone: "critical" },
  { key: "high", label: "High", hint: "Contact this week", tone: "high" },
  { key: "moderate", label: "Moderate", hint: "Monitoring", tone: "moderate" },
  { key: "low", label: "Stable", hint: "Self-management", tone: "low" },
] as const;

function Patients() {
  const search = Route.useSearch();
  const { profile } = useAuth();
  const [selected, setSelected] = useState<string | null>(search.patient ?? null);
  const [bandFilter, setBandFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<"work" | "mine" | "find">("work");
  const [wide, setWide] = useState(false);
  const patients = useQuery(patientsQuery);
  const risks = useQuery(riskScoresQuery);
  const providers = useQuery(providersQuery);
  const workflow = useQuery(workflowEventsQuery);
  const referrals = useQuery(referralsQuery);
  const consultations = useQuery(consultationsQuery);
  const qc = useQueryClient();
  const { index: access, ready: accessReady } = useAccessIndex();
  const { isAggregateOnly } = useScope();

  /**
   * Who this clinician has already contacted today.
   *
   * The list resets overnight, because the bands it is sorted by say "contact
   * today" and "contact this week" — a permanent flag would mean a patient
   * contacted once in March never resurfaces. Events are per-clinician, so a
   * consultant clearing their round does not empty the ward nurse's list, and
   * the most recent event per patient wins so the mark can be undone.
   */
  const contacted = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const decided = new Set<string>();
    const done = new Set<string>();
    for (const e of workflow.data ?? []) {
      if (e.action !== "patient_contacted" && e.action !== "patient_contact_cleared") continue;
      if (e.actor_id && profile?.id && e.actor_id !== profile.id) continue;
      if (new Date(e.created_at) < startOfDay) continue;
      if (decided.has(e.patient_id)) continue; // newest first, so this is the latest word
      decided.add(e.patient_id);
      if (e.action === "patient_contacted") done.add(e.patient_id);
    }
    return done;
  }, [workflow.data, profile?.id]);

  const setContacted = useMutation({
    mutationFn: async ({ patientId, done }: { patientId: string; done: boolean }) => {
      const { error } = await supabase.from("workflow_events").insert({
        patient_id: patientId,
        actor_id: profile?.id ?? null,
        actor_name: profile?.full_name ?? "Clinician",
        action: done ? "patient_contacted" : "patient_contact_cleared",
        label: done ? "Marked contacted" : "Contact mark cleared",
        detail: null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["workflow_events"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const decision = useMemo<AccessDecision | null>(
    () => (accessReady && selected ? access.decide(selected) : null),
    [access, accessReady, selected],
  );
  // Identity is directory-level, so it resolves even when the record does not.
  const selectedPatient = useMemo(
    () => (selected ? ((patients.data ?? []).find((p) => p.id === selected) ?? null) : null),
    [patients.data, selected],
  );

  // The chart is not fetched at all without a basis. Refusing to render a
  // record we already pulled into the browser would be theatre, not access
  // control.
  const bundle = useQuery({
    ...patientBundleQuery(selected ?? ""),
    enabled: Boolean(selected) && decision?.allowed === true,
  });
  useLogRecordAccess(selected, "Full clinical record (clinician console)", decision);

  /**
   * The queue is the reader's own panel, not the region's. Every row is
   * resolved against the access model; patients with no lawful basis are
   * counted but never named, so the console still tells a clinician how much
   * regional need sits outside their reach without leaking who those people
   * are.
   */
  const { queue, restricted } = useMemo(() => {
    const byPatient = new Map<string, RiskScore>();
    for (const r of risks.data ?? []) {
      const prev = byPatient.get(r.patient_id);
      if (!prev || new Date(r.computed_at) > new Date(prev.computed_at))
        byPatient.set(r.patient_id, r);
    }
    const pmap = new Map((patients.data ?? []).map((p) => [p.id, p] as const));
    const rows = [...byPatient.values()]
      .map((r) => ({ risk: r, patient: pmap.get(r.patient_id) }))
      .filter((row): row is { risk: RiskScore; patient: Patient } => Boolean(row.patient))
      .filter((row) => bandFilter === "all" || row.risk.band === bandFilter);

    if (!accessReady) return { queue: [], restricted: 0 };

    const mine: { risk: RiskScore; patient: Patient; decision: AccessDecision }[] = [];
    let withheld = 0;
    for (const row of rows) {
      const d = access.decide(row.patient.id);
      if (d.allowed) mine.push({ ...row, decision: d });
      else withheld += 1;
    }
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? mine.filter(
          (row) =>
            row.patient.full_name.toLowerCase().includes(needle) ||
            row.patient.parish.toLowerCase().includes(needle),
        )
      : mine;

    return {
      // Contacted patients drop to the bottom rather than disappearing, so the
      // list shows progress and the mark stays reversible.
      queue: filtered.sort((a, b) => {
        const ac = contacted.has(a.patient.id);
        const bc = contacted.has(b.patient.id);
        if (ac !== bc) return ac ? 1 : -1;
        return b.risk.score - a.risk.score;
      }),
      restricted: withheld,
    };
  }, [risks.data, patients.data, bandFilter, access, accessReady, query, contacted]);

  /**
   * The worklist comes from the shared hook so the home screen and this screen
   * cannot disagree about what needs doing. Search and the band tiles are
   * applied here, because they are this screen's controls.
   */
  const myFacility = useMyFacility();
  const { items: worklistAll } = useWorklist();
  const worklist = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return worklistAll
      .filter((i) => bandFilter === "all" || i.risk?.band === bandFilter)
      .filter(
        (i) =>
          !needle ||
          i.patient.full_name.toLowerCase().includes(needle) ||
          i.patient.parish.toLowerCase().includes(needle),
      );
  }, [worklistAll, query, bandFilter]);

  /**
   * The list is cut at the size of the session rather than at a clinical
   * horizon.
   *
   * It used to split today from this week, which sounds like planning and is
   * not: both halves were open-ended, so the clinician still had to decide in
   * their head where the day actually stopped, and whoever fell below that
   * private line fell off the record entirely. Cutting at capacity makes the
   * line visible and, more to the point, makes it answerable — every name
   * under it is handed to someone, and the summary says to whom.
   */
  const [showBelow, setShowBelow] = useState(false);
  const allocation = useMemo(
    () =>
      allocateAttention(worklist, {
        spent: contacted.size,
        capacity: capacityForFacility(myFacility),
      }),
    [worklist, contacted, myFacility],
  );
  const handedOff = countByDisposition(allocation.below);

  /**
   * Every patient on the Grid, browsable by name — the directory.
   *
   * Identity only: name, age, sex, parish, country, language. Whether a row is
   * readable is shown on it (the basis you hold, or "sealed"), and selecting a
   * sealed one puts the refusal panel in the chart pane rather than a blank.
   * Nothing clinical appears here — a risk score is a clinical judgement, so it
   * stays on "My list" where a basis has already been resolved.
   *
   * Sorted by name, because a directory you browse is ordered the way you would
   * look someone up in it, not by how ill they are.
   */
  const indexMatches = useMemo(() => {
    if (isAggregateOnly || !accessReady) return [];
    const needle = query.trim().toLowerCase();
    // Browsable. What protects the patient here is that the directory carries no
    // clinical content, that opening a sealed record is refused, and that the
    // attempt lands in their own access log — not whether the list is hidden
    // behind a search box, which anyone can defeat with two keystrokes.
    return (patients.data ?? [])
      .filter(
        (p) =>
          !needle ||
          p.full_name.toLowerCase().includes(needle) ||
          p.parish.toLowerCase().includes(needle),
      )
      .slice()
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [patients.data, query, isAggregateOnly, accessReady]);

  const indexPageCount = Math.max(
    1,
    Math.ceil(indexMatches.length / (wide ? WIDE_PAGE_SIZE : PAGE_SIZE)),
  );
  const indexPageSafe = Math.min(page, indexPageCount);
  const indexRows = indexMatches.slice(
    (indexPageSafe - 1) * (wide ? WIDE_PAGE_SIZE : PAGE_SIZE),
    indexPageSafe * (wide ? WIDE_PAGE_SIZE : PAGE_SIZE),
  );

  const pageCount = Math.max(1, Math.ceil(queue.length / (wide ? WIDE_PAGE_SIZE : PAGE_SIZE)));
  const pageSafe = Math.min(page, pageCount);
  const size = wide ? WIDE_PAGE_SIZE : PAGE_SIZE;
  const pageRows = queue.slice((pageSafe - 1) * size, pageSafe * size);
  /**
   * The worklist is not paged — it is cut at the size of a session, and the
   * block below the line accounts for the rest. Leaving the pager on it made
   * the footer read "showing 1-20 of 203" under a list of twelve, which is the
   * same count-disagrees-with-the-list problem this screen has had twice.
   */
  const activeTotal = tab === "work" ? 0 : tab === "mine" ? queue.length : indexMatches.length;
  const activePageCount = tab === "work" ? 1 : tab === "mine" ? pageCount : indexPageCount;
  const activePage = tab === "work" ? 1 : tab === "mine" ? pageSafe : indexPageSafe;

  // Open on the top of this clinician's own list rather than a fixed patient —
  // the hardcoded default landed most users straight on a refusal panel.
  useEffect(() => {
    if (selected || !queue.length) return;
    setSelected(queue[0]!.patient.id);
  }, [selected, queue]);

  // Band counts follow the same rule: they describe the panel this clinician is
  // responsible for, not every scored patient in eleven countries.
  const counts = useMemo(() => {
    const c: Record<string, number> = { critical: 0, high: 0, moderate: 0, low: 0 };
    if (!accessReady) return c;
    const byPatient = new Map<string, RiskScore>();
    for (const r of risks.data ?? []) {
      const prev = byPatient.get(r.patient_id);
      if (!prev || new Date(r.computed_at) > new Date(prev.computed_at))
        byPatient.set(r.patient_id, r);
    }
    for (const r of byPatient.values()) {
      if (!access.decide(r.patient_id).allowed) continue;
      if (c[r.band] !== undefined) c[r.band] = (c[r.band] ?? 0) + 1;
    }
    return c;
  }, [risks.data, access, accessReady]);

  const acceptConsult = useMutation({
    mutationFn: (referralId: string) =>
      acceptReferralOnGrid({
        referralId,
        patientId: selected!,
        patient: (patients.data ?? []).find((p) => p.id === selected),
        providerId: profile?.provider_id ?? null,
      }),
    onSuccess: () => {
      toast.success("Teleconsult opened — patient notified on WhatsApp");
      qc.invalidateQueries();
    },
  });

  const b = bundle.data;
  // ---- pre-consult brief agent -------------------------------------------
  const islands = useQuery(islandsQuery);
  const [briefFor, setBriefFor] = useState<string | null>(null);
  const [briefDecision, setBriefDecision] = useState<"accepted" | "dismissed" | null>(null);

  const brief = useMemo(() => {
    if (!b || briefFor !== selected) return null;
    const island = (islands.data ?? []).find((i) => i.code === b.patient.island_code);
    return runClinicianBrief({
      patient: b.patient,
      vitals: b.vitals,
      medications: b.medications,
      conditions: b.conditions,
      messages: b.messages,
      risk: b.risk,
      referrals: b.referrals,
      grants: b.grants,
      actor: { name: profile?.full_name ?? "Clinician", island: profile?.island_code ?? null },
      localSpecialties: [
        ...new Set(
          (providers.data ?? [])
            .filter((p) => p.island_code === b.patient.island_code)
            .map((p) => p.specialty),
        ),
      ],
      islandTier: island?.tier,
    });
  }, [b, briefFor, selected, islands.data, providers.data, profile]);

  /**
   * One worklist row. Extracted because it is now rendered on both sides of
   * the capacity line, and two copies of a row would drift.
   */
  const worklistRow = (row: WorklistItem) => {
    const done = contacted.has(row.patient.id);
    return (
      <div
        key={row.patient.id}
        className={
          "mb-1 rounded-lg border-l-[3px] transition-colors " +
          (row.patient.id === selected
            ? "border-primary bg-primary/12 ring-1 ring-inset ring-primary/25"
            : "border-transparent hover:bg-surface")
        }
      >
        <button
          onClick={() => setSelected(row.patient.id)}
          className={"w-full px-3 pt-2.5 text-left " + (done ? "opacity-55" : "")}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[13.5px] font-semibold">{row.patient.full_name}</span>
            {row.risk ? (
              <span className="mono-num shrink-0 text-[13px] font-semibold">
                Risk {row.risk.score}
                <span className="text-[11px] font-normal text-muted-foreground">/100</span>
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
            <span className="font-medium text-foreground/70">{row.patient.mrn}</span> ·{" "}
            {row.patient.age}
            {row.patient.sex} · {row.patient.parish}, {row.patient.island_code}
          </p>
          {/* The reason is the point of this list. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Pill className={rankTone(row.rank)}>{row.reason}</Pill>
            <span className="truncate text-[11.5px] text-muted-foreground">{row.detail}</span>
          </div>
        </button>
        <div className="px-3 pb-2 pt-1.5">
          <button
            type="button"
            onClick={() => setContacted.mutate({ patientId: row.patient.id, done: !done })}
            disabled={setContacted.isPending}
            className={
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11.5px] font-medium transition-colors disabled:opacity-60 " +
              (done
                ? "border-low/40 bg-low/10 text-low"
                : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary")
            }
          >
            <Check className="h-3 w-3" />
            {done ? "Contacted today" : "Mark contacted"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold tracking-tight">Patients</h1>
        <p className="mt-1.5 text-[13.5px] text-muted-foreground">
          What needs doing today, your caseload, and the whole directory.
        </p>
      </div>

      {/* Who is being seen right now, above the list of who still needs
          seeing. Two different states, so two different places. */}
      <InSessionNow />

      {/* These were four large tiles carrying population counts — "HIGH 137"
          is a ministry statistic, not a nurse's next action, and it occupied
          the best row on the page. The filter is genuinely useful, so it stays
          as a filter and stops pretending to be a headline. */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Filter by risk
          <span className="ml-1 font-normal normal-case tracking-normal opacity-70">
            (across your {Object.values(counts).reduce((a, n) => a + n, 0)} patients)
          </span>
        </span>
        {BANDS.map((band) => {
          const active = bandFilter === band.key;
          return (
            <button
              key={band.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setBandFilter(active ? "all" : band.key);
                setPage(1);
              }}
              className={
                "rounded-lg border px-2.5 py-1 text-[12.5px] font-medium transition-colors " +
                (active
                  ? "border-primary/50 bg-primary/8 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground")
              }
            >
              {band.label}
              <span className="ml-1.5 tabular-nums opacity-70">{counts[band.key] ?? 0}</span>
            </button>
          );
        })}
        {bandFilter !== "all" ? (
          <button
            type="button"
            onClick={() => {
              setBandFilter("all");
              setPage(1);
            }}
            className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className={"grid gap-4 " + (wide ? "" : "lg:grid-cols-[430px_minmax(0,1fr)]")}>
        <Panel className="h-fit">
          <div className="border-b border-border px-3 py-2.5">
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name or parish…"
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-[12.5px] outline-none focus:border-primary"
            />
            {/* Three scopes, narrowest first. The worklist is what to do today;
                My patients is the caseload a lawful basis reaches; All patients
                is the region. "My list" used to mean the middle one while
                reading like the first, which is a bad thing for a screen a
                clinician opens to find out what needs doing. */}
            <div className="mt-2.5 flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setTab("work");
                  setPage(1);
                }}
                className={
                  "rounded-lg px-2.5 py-1 text-[12.5px] font-semibold transition-colors " +
                  (tab === "work"
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                Worklist ({allocation.above.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab("mine");
                  setPage(1);
                }}
                className={
                  "rounded-lg px-2.5 py-1 text-[12.5px] font-medium transition-colors " +
                  (tab === "mine"
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                My patients ({queue.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab("find");
                  setPage(1);
                }}
                className={
                  "rounded-lg px-2.5 py-1 text-[12.5px] font-medium transition-colors " +
                  (tab === "find"
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                All patients ({indexMatches.length})
              </button>
              {/* The chart takes two thirds of the screen and shows one person.
                  When you are scanning rather than reading, that trade is the
                  wrong way round — this hands the width back to the list. */}
              <button
                type="button"
                onClick={() => {
                  setWide((w) => !w);
                  setPage(1);
                }}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                title={
                  wide ? "Back to the split view with the chart" : "Use the full width for the list"
                }
              >
                {wide ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
                {wide ? "Show chart" : "Wide view"}
              </button>
            </div>
          </div>
          <div className="max-h-[620px] overflow-y-auto p-2">
            {risks.isLoading ? <Loading label="Scoring the panel…" /> : null}
            {tab === "work" && allocation.above.map((row) => worklistRow(row))}

            {/* The line, and what happens on the other side of it. */}
            {tab === "work" && allocation.below.length ? (
              <div className="mt-1 rounded-lg border border-dashed border-border">
                <div className="px-3 py-2.5">
                  <p className="text-[12.5px] font-semibold">
                    Below the line for today — {allocation.below.length} people
                  </p>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
                    A session holds about {allocation.capacity} contacts and{" "}
                    {allocation.spent === 0
                      ? "none are spent yet"
                      : `${allocation.spent} ${allocation.spent === 1 ? "is" : "are"} already spent`}
                    . These are not dropped — they go to another pair of hands:{" "}
                    {handedOff.nurse ? `${handedOff.nurse} to the nurse callback list` : null}
                    {handedOff.nurse && handedOff.message ? ", " : null}
                    {handedOff.message ? `${handedOff.message} to an automatic check-in` : null}.
                    Proposed, not sent.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBelow((v) => !v)}
                  className="w-full border-t border-border px-3 py-2 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-primary"
                >
                  {showBelow ? "Hide them" : `Show the ${allocation.below.length}`}
                </button>
                {showBelow ? (
                  <div className="border-t border-border p-2">
                    {/* Capped. Nobody reads the 191st row, and rendering them
                        all is a stall on the machines this runs on. */}
                    {allocation.below.slice(0, BELOW_PREVIEW).map(({ item, disposition }) => (
                      <div key={item.patient.id} className="opacity-70">
                        <p className="px-3 pt-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                          → {DISPOSITION_LABEL[disposition]}
                        </p>
                        {worklistRow(item)}
                      </div>
                    ))}
                    {allocation.below.length > BELOW_PREVIEW ? (
                      <p className="px-3 py-2 text-[11.5px] text-muted-foreground">
                        …and {allocation.below.length - BELOW_PREVIEW} more, all queued the same
                        way.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* More people are personally blocked on this clinician than the
                day can hold. Absorbing that silently is how a service finds
                out about it a month late. */}
            {tab === "work" && allocation.overCommitted ? (
              <p className="mt-1 rounded-lg border border-critical/40 bg-critical/10 px-3 py-2.5 text-[12px] leading-relaxed text-critical">
                More people are waiting on you personally than one session holds. None of these can
                be handed to a nurse — they are waiting on your decision. This is the number to
                raise with your service lead.
              </p>
            ) : null}

            {tab === "work" && accessReady && !worklist.length ? (
              <p className="px-3 py-6 text-[13px] leading-relaxed text-muted-foreground">
                Nothing needs action right now. No referrals waiting on you, no appointments today,
                and every critical and high-risk patient on your list has been contacted.
              </p>
            ) : null}

            {tab === "mine" &&
              pageRows.map((row) => {
                const { risk, patient } = row;
                const done = contacted.has(patient.id);
                return (
                  <div
                    key={patient.id}
                    className={
                      (wide
                        ? "mb-0.5 flex items-center gap-3 rounded-lg pr-3 "
                        : "mb-1 rounded-lg ") +
                      "border-l-[3px] transition-colors " +
                      (patient.id === selected
                        ? "border-primary bg-primary/12 ring-1 ring-inset ring-primary/25"
                        : "border-transparent hover:bg-surface")
                    }
                  >
                    <button
                      onClick={() => setSelected(patient.id)}
                      className={
                        (wide
                          ? "min-w-0 flex-1 px-3 py-2 text-left "
                          : "w-full px-3 pt-2.5 text-left ") + (done ? "opacity-55" : "")
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13.5px] font-semibold">
                          {patient.full_name}
                        </span>
                        <span className="mono-num shrink-0 text-[13px] font-semibold">
                          Risk {risk.score}
                          <span className="text-[11px] font-normal text-muted-foreground">
                            /100
                          </span>
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                        <span className="font-medium text-foreground/70">{patient.mrn}</span> ·{" "}
                        {patient.age}
                        {patient.sex} · {patient.parish}, {patient.island_code} · {risk.trend}
                      </p>
                      {wide ? null : (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Pill className={bandClasses(risk.band)}>{risk.band}</Pill>
                          <Pill className={BASIS_TONE[row.decision.basis]}>
                            {BASIS_LABEL[row.decision.basis]}
                          </Pill>
                        </div>
                      )}
                    </button>
                    <div className={wide ? "hidden" : "px-3 pb-2 pt-1.5"}>
                      <button
                        type="button"
                        onClick={() => setContacted.mutate({ patientId: patient.id, done: !done })}
                        disabled={setContacted.isPending}
                        className={
                          "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11.5px] font-medium transition-colors disabled:opacity-60 " +
                          (done
                            ? "border-low/40 bg-low/10 text-low"
                            : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary")
                        }
                      >
                        <Check className="h-3 w-3" />
                        {done ? "Contacted today" : "Mark contacted"}
                      </button>
                    </div>
                    {/* Wide rows carry the same information on one line, so a
                        screenful is thirty patients rather than seven. */}
                    {wide ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Pill className={bandClasses(risk.band)}>{risk.band}</Pill>
                        <Pill className={BASIS_TONE[row.decision.basis]}>
                          {BASIS_LABEL[row.decision.basis]}
                        </Pill>
                        <button
                          type="button"
                          onClick={() =>
                            setContacted.mutate({ patientId: patient.id, done: !done })
                          }
                          disabled={setContacted.isPending}
                          title={done ? "Contacted today" : "Mark contacted"}
                          className={
                            "grid h-6 w-6 shrink-0 place-items-center rounded-md border transition-colors disabled:opacity-60 " +
                            (done
                              ? "border-low/40 bg-low/10 text-low"
                              : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary")
                          }
                        >
                          <Check className="h-3 w-3" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            {tab === "find" &&
              indexRows.map((p) => {
                const d = accessReady ? access.decide(p.id) : null;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p.id)}
                    className={
                      "mb-1 w-full rounded-lg border-l-[3px] px-3 py-2.5 text-left transition-colors " +
                      (p.id === selected
                        ? "border-primary bg-primary/12 ring-1 ring-inset ring-primary/25"
                        : "border-transparent hover:bg-surface")
                    }
                  >
                    <span className="block truncate text-[13.5px] font-semibold">
                      {p.full_name}
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
                      <span className="font-medium text-foreground/70">{p.mrn}</span> · {p.age}
                      {p.sex} · {p.parish}, {p.island_code} · speaks {p.language}
                    </span>
                    {d?.allowed ? (
                      <Pill className={"mt-1.5 " + BASIS_TONE[d.basis]}>
                        {BASIS_LABEL[d.basis]}
                      </Pill>
                    ) : (
                      <Pill className="mt-1.5 border-border bg-background text-muted-foreground">
                        <Lock className="h-3 w-3" />
                        sealed
                      </Pill>
                    )}
                  </button>
                );
              })}

            {tab === "mine" && accessReady && !queue.length ? (
              <p className="px-3 py-6 text-[13px] text-muted-foreground">
                {query.trim() || bandFilter !== "all"
                  ? "Nobody on your list matches that. The All patients tab searches the whole Grid."
                  : "No patients on your list. A referral you accept, an episode at your facility, or a consent grant from the patient will place someone here."}
              </p>
            ) : null}
            {tab === "find" && !indexRows.length ? (
              <p className="px-3 py-6 text-[13px] leading-relaxed text-muted-foreground">
                {isAggregateOnly
                  ? "Your role is aggregate and de-identified only, so the patient directory is not available to it."
                  : `Nobody on the Grid matches “${query.trim()}”.`}
              </p>
            ) : null}
          </div>
          {activeTotal ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5">
              <p className="text-[12px] text-muted-foreground">
                Showing{" "}
                <span className="font-semibold text-foreground">
                  {(activePage - 1) * size + 1}–{Math.min(activePage * size, activeTotal)}
                </span>{" "}
                of <span className="font-semibold text-foreground">{activeTotal}</span>
              </p>
              {activePageCount > 1 ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Previous page"
                    disabled={activePage === 1}
                    onClick={() => setPage(activePage - 1)}
                    className="grid h-7 w-7 place-items-center rounded-md border border-border text-muted-foreground hover:bg-surface hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="px-1 text-[12px] text-muted-foreground">
                    {activePage} / {activePageCount}
                  </span>
                  <button
                    type="button"
                    aria-label="Next page"
                    disabled={activePage === activePageCount}
                    onClick={() => setPage(activePage + 1)}
                    className="grid h-7 w-7 place-items-center rounded-md border border-border text-muted-foreground hover:bg-surface hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          {restricted > 0 ? (
            <div className="flex items-start gap-2 border-t border-border px-4 py-3 text-[12px] text-muted-foreground">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <strong className="font-semibold text-foreground">{restricted}</strong> further
                scored {restricted === 1 ? "patient" : "patients"} in the region sit outside your
                lawful access. Accept a referral, record an episode, or request the patient's
                consent to see who they are.
              </span>
            </div>
          ) : null}
        </Panel>

        {wide ? null : (
          <div className="space-y-4">
            {decision && !decision.allowed ? (
              <NoBasisPanel
                patientId={selected!}
                patientName={selectedPatient?.full_name}
                patientMrn={selectedPatient?.mrn}
                decision={decision}
              />
            ) : !b ? (
              <Panel>
                <Loading label="Assembling the longitudinal record…" />
              </Panel>
            ) : (
              <>
                {brief && (
                  <AgentBrief
                    run={brief}
                    decision={briefDecision}
                    onAccept={() => {
                      setBriefDecision("accepted");
                      void supabase.from("workflow_events").insert({
                        patient_id: b.patient.id,
                        actor_name: profile?.full_name ?? "Clinician",
                        action: "agent_brief_accepted",
                        label: "Pre-consult brief accepted",
                        detail: JSON.stringify({
                          engine: brief.model,
                          findings: brief.findings.length,
                          confidence: brief.confidence,
                        }),
                      });
                      toast.success("Brief accepted — recorded against this episode");
                    }}
                    onDismiss={() => {
                      setBriefDecision("dismissed");
                      void supabase.from("workflow_events").insert({
                        patient_id: b.patient.id,
                        actor_name: profile?.full_name ?? "Clinician",
                        action: "agent_brief_dismissed",
                        label: "Pre-consult brief dismissed",
                        detail: JSON.stringify({ engine: brief.model }),
                      });
                      toast("Brief dismissed — nothing written to the record");
                    }}
                  />
                )}
                <PatientChart
                  bundle={b}
                  decision={decision}
                  providers={providers.data ?? []}
                  onAcceptReferral={(id) => acceptConsult.mutate(id)}
                  headerActions={
                    <button
                      type="button"
                      onClick={() => {
                        setBriefFor(selected);
                        setBriefDecision(null);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-[12.5px] font-medium text-primary transition-colors hover:bg-primary/20"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {briefFor === selected ? "Re-run brief" : "Prepare consult brief"}
                    </button>
                  }
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
