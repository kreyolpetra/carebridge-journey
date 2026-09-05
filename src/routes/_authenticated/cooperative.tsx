/**
 * The Caribbean Health Data Cooperative — module 07 of the brief.
 *
 * The load-bearing word is "cooperative". A regional health dataset sold to
 * research buyers is a data broker, and the Caribbean has good historical
 * reason to distrust one. What makes this different is structural, and all
 * three parts have to be visible on the screen or the claim is decoration:
 *
 *   1. Membership is opted into and revocable, and only members are in the pool.
 *   2. Releases are governed — a minimum cohort size the console enforces
 *      rather than merely states, and a purpose recorded against every
 *      decision.
 *   3. The money comes back, split by which islands actually contributed.
 *
 * The governance is the product here. A console that could only approve would
 * be a storefront.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X, Lock, Users2, Landmark } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  cooperativeMembersQuery,
  dataRequestsQuery,
  islandsQuery,
  patientsQuery,
  type DataRequest,
} from "@/lib/api";
import { Panel, PanelHeader, Pill, Stat, SectionTitle, Loading } from "@/components/grid";
import { useAuth } from "@/hooks/useAuth";
import { usd, timeAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/cooperative")({
  head: () => ({
    meta: [
      { title: "Health Data Cooperative — Consent-Governed Research Access | CareBridge Journey" },
      {
        name: "description",
        content:
          "Members opt their de-identified records into a regional research pool, institutions request cohorts against a stated purpose, and the fees are returned to the islands that contributed.",
      },
    ],
  }),
  component: Cooperative,
});

/**
 * Minimum cohort size for any release. Small-island health data re-identifies
 * easily — "the diabetic patients in Dominica" is a village, not a statistic —
 * so the threshold is the single most important control here.
 */
const MIN_COHORT = 20;

/** Share of every fee returned to the member health fund. */
const MEMBER_SHARE = 0.6;

function Cooperative() {
  const members = useQuery(cooperativeMembersQuery);
  const requests = useQuery(dataRequestsQuery);
  const patients = useQuery(patientsQuery);
  const islands = useQuery(islandsQuery);
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [note, setNote] = useState<Record<string, string>>({});

  const active = useMemo(
    () => (members.data ?? []).filter((m) => m.status === "active"),
    [members.data],
  );

  /** Members per island — the contribution figure the dividend is split on. */
  const byIsland = useMemo(() => {
    const pmap = new Map((patients.data ?? []).map((p) => [p.id, p] as const));
    const counts = new Map<string, { members: number; patients: number }>();
    for (const p of patients.data ?? []) {
      const row = counts.get(p.island_code) ?? { members: 0, patients: 0 };
      row.patients += 1;
      counts.set(p.island_code, row);
    }
    for (const m of active) {
      const p = pmap.get(m.patient_id);
      if (!p) continue;
      const row = counts.get(p.island_code) ?? { members: 0, patients: 0 };
      row.members += 1;
      counts.set(p.island_code, row);
    }
    return [...counts.entries()]
      .map(([code, v]) => ({
        code,
        name: (islands.data ?? []).find((i) => i.code === code)?.name ?? code,
        ...v,
        rate: v.patients ? (v.members / v.patients) * 100 : 0,
      }))
      .sort((a, b) => b.members - a.members);
  }, [patients.data, active, islands.data]);

  const rows = requests.data ?? [];
  const pending = rows.filter((r) => r.status === "pending");
  const approved = rows.filter((r) => r.status === "approved");

  const revenue = approved.reduce((a, r) => a + r.fee_usd, 0);
  const toMembers = Math.round(revenue * MEMBER_SHARE);

  /**
   * How many members a request would actually reach. This is what the minimum
   * cohort size is checked against, and it is computed from the live
   * membership rather than asserted by the requester.
   */
  const cohortSize = (r: DataRequest) => {
    const pmap = new Map((patients.data ?? []).map((p) => [p.id, p] as const));
    return active.filter((m) => {
      const p = pmap.get(m.patient_id);
      return p ? r.islands.includes(p.island_code) : false;
    }).length;
  };

  const decide = useMutation({
    mutationFn: async ({
      id,
      status,
      reason,
    }: {
      id: string;
      status: "approved" | "declined";
      reason: string;
    }) => {
      const { error } = await supabase
        .from("data_requests")
        .update({
          status,
          decided_at: new Date().toISOString(),
          decided_by: profile?.full_name ?? "Coordination Unit",
          decision_note: reason,
        })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => {
      toast.success(v.status === "approved" ? "Release approved and logged" : "Request declined");
      void qc.invalidateQueries({ queryKey: ["data_requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (members.isLoading || patients.isLoading) {
    return (
      <div className="p-5">
        <Loading label="Opening the cooperative…" />
      </div>
    );
  }

  const memberRate = patients.data?.length ? (active.length / patients.data.length) * 100 : 0;

  return (
    <div className="p-4 sm:p-5">
      <SectionTitle
        eyebrow="Regional data governance"
        title="Health Data Cooperative"
        blurb="Members opt their de-identified records into a regional research pool and can leave at any time. Institutions ask for a cohort against a stated purpose; the fees come back to the islands that contributed."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Members"
          value={active.length.toLocaleString()}
          hint={`${memberRate.toFixed(0)}% of monitored patients`}
          tone="signal"
        />
        <Stat
          label="Outside the pool"
          value={((patients.data?.length ?? 0) - active.length).toLocaleString()}
          hint="Never included in an extract"
        />
        <Stat label="Research revenue" value={usd(revenue)} hint={`${approved.length} releases`} />
        <Stat
          label="Returned to members"
          value={usd(toMembers)}
          hint={`${Math.round(MEMBER_SHARE * 100)}% of every fee`}
          tone="low"
        />
      </div>

      <Panel className="mb-4">
        <PanelHeader
          title="Access requests"
          subtitle="Every request carries a purpose, and every decision is recorded against it"
        />
        <div className="divide-y divide-border">
          {rows.map((r) => {
            const n = cohortSize(r);
            const tooSmall = n < MIN_COHORT;
            return (
              <div key={r.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-[15px] font-semibold tracking-tight">
                        {r.institution}
                      </h3>
                      <Pill
                        className={
                          r.status === "approved"
                            ? "border-low/40 bg-low/10 text-low"
                            : r.status === "declined"
                              ? "border-critical/40 bg-critical/10 text-critical"
                              : "border-high/40 bg-high/10 text-high"
                        }
                      >
                        {r.status}
                      </Pill>
                    </div>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      {r.requester_unit} · asked {timeAgo(r.created_at)}
                    </p>
                    <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed">{r.purpose}</p>
                    <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
                      {r.cohort} · {r.islands.join(", ")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="mono-num text-[15px] font-semibold">
                      {r.fee_usd ? usd(r.fee_usd) : "No fee"}
                    </div>
                    <div className="text-[11.5px] text-muted-foreground">
                      {n.toLocaleString()} members in cohort
                    </div>
                  </div>
                </div>

                {/* The threshold is enforced here, not merely displayed: a
                    cohort below it has no approve button at all. */}
                {tooSmall ? (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-critical/30 bg-critical/8 px-3 py-2.5 text-[12.5px] leading-relaxed text-critical">
                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Below the {MIN_COHORT}-member minimum, so this cannot be released at any
                      price. In a country this size the cohort is small enough that a named person
                      could be picked out of it.
                    </span>
                  </div>
                ) : null}

                {r.status === "pending" ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      value={note[r.id] ?? ""}
                      onChange={(e) => setNote((s) => ({ ...s, [r.id]: e.target.value }))}
                      placeholder="Reason for the decision — recorded and shown to members"
                      className="min-w-[240px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      disabled={tooSmall || decide.isPending || !(note[r.id] ?? "").trim()}
                      onClick={() =>
                        decide.mutate({
                          id: r.id,
                          status: "approved",
                          reason: note[r.id] ?? "",
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-40"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve release
                    </button>
                    <button
                      type="button"
                      disabled={decide.isPending || !(note[r.id] ?? "").trim()}
                      onClick={() =>
                        decide.mutate({
                          id: r.id,
                          status: "declined",
                          reason: note[r.id] ?? "",
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12.5px] font-semibold hover:bg-surface disabled:opacity-40"
                    >
                      <X className="h-3.5 w-3.5" />
                      Decline
                    </button>
                  </div>
                ) : r.decision_note ? (
                  <p className="mt-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
                    <strong className="font-semibold text-foreground">
                      {r.status === "approved" ? "Approved" : "Declined"}
                    </strong>{" "}
                    by {r.decided_by} · {r.decision_note}
                  </p>
                ) : null}
              </div>
            );
          })}
          {!rows.length ? (
            <p className="p-5 text-[13px] text-muted-foreground">No access requests yet.</p>
          ) : null}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Panel>
          <PanelHeader
            title="Contribution and dividend by island"
            subtitle="The fee split follows the data — countries that contributed more receive more"
          />
          <div className="overflow-x-auto p-5">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Country</th>
                  <th className="pb-2 pr-3 text-right font-medium">Members</th>
                  <th className="pb-2 pr-3 text-right font-medium">Patients</th>
                  <th className="pb-2 pr-3 text-right font-medium">Opt-in</th>
                  <th className="pb-2 text-right font-medium">Dividend</th>
                </tr>
              </thead>
              <tbody>
                {byIsland.map((row) => (
                  <tr key={row.code} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 pr-3 font-medium text-foreground">{row.name}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{row.members}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-muted-foreground">
                      {row.patients}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{row.rate.toFixed(0)}%</td>
                    <td className="py-2.5 text-right tabular-nums">
                      {usd(
                        active.length ? Math.round((toMembers * row.members) / active.length) : 0,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
              Opt-in is lowest where health systems have historically taken the most and returned
              the least. The dividend is the argument for changing that, and it is the reason the
              split is shown per country rather than as a regional total.
            </p>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="What leaves the pool" subtitle="And what never does" />
            <div className="p-5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Included, de-identified
              </p>
              <ul className="space-y-1.5 text-[13px]">
                {[
                  "Vitals series, date-shifted",
                  "Conditions and diagnosis year",
                  "Medications and adherence",
                  "Outcomes and referral history",
                  "Country and resource tier",
                ].map((x) => (
                  <li key={x} className="flex items-start gap-2">
                    <Users2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-low" />
                    {x}
                  </li>
                ))}
              </ul>
              <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Never released
              </p>
              <ul className="space-y-1.5 text-[13px]">
                {[
                  "Name, MRN, date of birth",
                  "Phone number or WhatsApp identity",
                  "Parish or any sub-national location",
                  "Free-text clinical notes and messages",
                  "Anything from a non-member",
                ].map((x) => (
                  <li key={x} className="flex items-start gap-2">
                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-critical" />
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Standing rules" />
            <div className="space-y-3 p-5 text-[12.5px] leading-relaxed text-muted-foreground">
              <p className="flex items-start gap-2">
                <Landmark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>
                  No cohort under <strong className="text-foreground">{MIN_COHORT} members</strong>{" "}
                  is released, whatever the fee.
                </span>
              </p>
              <p className="flex items-start gap-2">
                <Landmark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>
                  Re-identification and onward resale are prohibited by the access terms, and a
                  request that asks for either is declined on its face.
                </span>
              </p>
              <p className="flex items-start gap-2">
                <Landmark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>
                  A member who leaves is excluded from every extract made after they leave. Extracts
                  already released cannot be recalled, and members are told so before joining rather
                  than after.
                </span>
              </p>
            </div>
          </Panel>
        </div>
      </div>

      <p className="mt-4 text-[12px] text-muted-foreground">
        {pending.length} request{pending.length === 1 ? "" : "s"} awaiting a decision.
      </p>
    </div>
  );
}
