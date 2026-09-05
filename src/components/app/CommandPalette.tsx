import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { navFor } from "@/lib/nav";
import {
  alertsQuery,
  islandsQuery,
  patientsQuery,
  providersQuery,
  referralsQuery,
  riskScoresQuery,
  stockQuery,
} from "@/lib/api";
import { askGrid, ASK_EXAMPLES } from "@/lib/agents/ask";
import { useAuth } from "@/hooks/useAuth";
import { useScope } from "@/hooks/useScope";
import { useAccessIndex } from "@/lib/access-basis";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { staffRole, isAggregateOnly } = useScope();
  const isPatient = role === "patient";
  const enabled = open && !isPatient;

  const patients = useQuery({ ...patientsQuery, enabled });
  const { index: access, ready: accessReady } = useAccessIndex();
  const risks = useQuery({ ...riskScoresQuery, enabled });
  const islands = useQuery({ ...islandsQuery, enabled });
  const providers = useQuery({ ...providersQuery, enabled });
  const referrals = useQuery({ ...referralsQuery, enabled });
  const stock = useQuery({ ...stockQuery, enabled });
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const scoreOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of risks.data ?? []) if (!m.has(r.patient_id)) m.set(r.patient_id, r.score);
    return m;
  }, [risks.data]);

  // Search spans the whole index — a clinician has to be able to find the
  // person in front of them — but a row for someone outside the reader's panel
  // shows identity only. This used to render every patient's risk score to any
  // non-patient role, which is clinical data about someone whose chart the
  // console would refuse to open two clicks later.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || isPatient || isAggregateOnly || !accessReady) return [];
    return (patients.data ?? [])
      .filter((p) => p.full_name.toLowerCase().includes(q) || p.parish.toLowerCase().includes(q))
      .map((p) => ({ patient: p, allowed: access.decide(p.id).allowed }))
      .sort((a, b) => Number(b.allowed) - Number(a.allowed))
      .slice(0, 6);
  }, [patients.data, query, isPatient, isAggregateOnly, access, accessReady]);

  /**
   * Navigation targets matching what has been typed. Every word has to appear
   * somewhere in the label or its keywords, so "consent log" finds the privacy
   * screen and a whole typed question finds nothing rather than everything.
   */
  const surfaces = useMemo(() => {
    const items = navFor(role, staffRole);
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return items;
    return items.filter((item) => {
      const hay = `${item.label} ${item.keywords}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [role, staffRole, query]);

  // Answers questions over live data instead of only filtering a list. Runs on
  // deterministic intent matching, not a language model — the footer says so.
  /**
   * Runs through the model adapter, so it is asynchronous whichever adapter is
   * live — a seam that only worked with the synchronous one would not be a
   * seam. Keyed on the query so a stale answer cannot outlive its question.
   */
  const askQuery = useQuery({
    queryKey: ["ask", query, Boolean(islands.data), Boolean(patients.data)],
    enabled: Boolean(query.trim()) && !isPatient && Boolean(islands.data && patients.data),
    staleTime: 30_000,
    queryFn: () =>
      askGrid(query, {
        islands: islands.data ?? [],
        patients: patients.data ?? [],
        risks: risks.data ?? [],
        providers: providers.data ?? [],
        referrals: referrals.data ?? [],
        stock: stock.data ?? [],
      }),
  });
  const ask = askQuery.data ?? null;

  const close = () => {
    onOpenChange(false);
    setQuery("");
  };
  const go = (to: string) => {
    close();
    void navigate({ to });
  };
  const goPatient = (id: string) => {
    close();
    void navigate({ to: "/patients/$patientId", params: { patientId: id } as never });
  };

  return (
    /**
     * cmdk's own filter is off.
     *
     * It scores every item against the raw text and hides the ones that do not
     * match, which is right for a list you are searching and exactly wrong for
     * a question you are asking: "where is there no cardiology" matched none of
     * the answer rows, so the whole Ask group was filtered away and the palette
     * said "Nothing matched that search" over a perfectly good answer. Patients
     * were already filtered in `matches`, so the only group that depended on
     * cmdk was "Go to", which is filtered just below.
     */
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        placeholder={isPatient ? "Search…" : "Ask a question, or search patients and surfaces…"}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {query.trim() && !ask && !surfaces.length && !matches.length ? (
          <CommandEmpty>Nothing matched that search.</CommandEmpty>
        ) : null}

        {ask && (
          <>
            <CommandGroup
              heading={
                <span className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  {ask.intent}
                </span>
              }
            >
              <div className="px-2 pb-2 pt-1">
                <p className="text-[12.5px] leading-relaxed text-foreground">{ask.answer}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Computed from {ask.basis}</p>
              </div>
              {ask.rows.map((row) => (
                <CommandItem
                  key={row.id}
                  value={`ask-${row.id}-${row.label}`}
                  onSelect={() => {
                    if (row.patientId) goPatient(row.patientId);
                    else if (row.to) go(row.to);
                    else close();
                  }}
                >
                  <span className="truncate">{row.label}</span>
                  <span className="ml-auto shrink-0 pl-3 text-[11px] text-muted-foreground">
                    {row.sub}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {!query.trim() && !isPatient && (
          <>
            <CommandGroup heading="Try asking">
              {ASK_EXAMPLES.map((ex) => (
                <CommandItem key={ex} value={`example-${ex}`} onSelect={() => setQuery(ex)}>
                  <Sparkles className="mr-2 h-3.5 w-3.5 text-primary" />
                  <span className="text-muted-foreground">{ex}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {surfaces.length ? (
          <CommandGroup heading="Go to">
            {surfaces.map((item) => (
              <CommandItem
                key={item.to}
                value={`${item.label} ${item.keywords}`}
                onSelect={() => go(item.to)}
              >
                <item.icon className="mr-2 h-4 w-4" />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {matches.length ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Patients">
              {matches.map(({ patient: p, allowed }) => (
                <CommandItem
                  key={p.id}
                  value={`patient-${p.full_name}-${p.id}`}
                  onSelect={() => goPatient(p.id)}
                >
                  <span className="truncate">{p.full_name}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {p.parish}, {p.island_code} ·{" "}
                    {allowed ? `risk ${scoreOf.get(p.id) ?? "—"}` : "sealed"}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>

      {!isPatient && (
        <div className="border-t border-border px-3 py-2">
          <p className="text-[11px] text-muted-foreground">
            Answers come from deterministic rules over live CareBridge data — no language model, so
            the same question always returns the same answer.
          </p>
        </div>
      )}
    </CommandDialog>
  );
}
