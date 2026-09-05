import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { patientsQuery, referralsQuery, riskScoresQuery } from "@/lib/api";
import { Panel, PanelHeader, Pill, Stat, SectionTitle } from "@/components/grid";
import { bandClasses, usd } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/insurer")({
  head: () => ({
    meta: [
      { title: "Insurer Engine — Risk-Adjusted NCD Pricing | CareBridge Journey" },
      {
        name: "description",
        content:
          "Adherence and home-monitoring streaks converted into premium credits, with live risk-adjusted pricing replacing decades-old actuarial tables.",
      },
      { property: "og:title", content: "Insurer Engine — Risk-Adjusted NCD Pricing" },
      {
        property: "og:description",
        content:
          "Insurers fund CareBridge because avoided admissions are worth more than the platform costs.",
      },
    ],
  }),
  component: Insurer,
});

type MedRow = { patient_id: string; adherence_pct: number };

function Insurer() {
  const patients = useQuery(patientsQuery);
  const risks = useQuery(riskScoresQuery);
  const referrals = useQuery(referralsQuery);
  const meds = useQuery({
    queryKey: ["med-adherence"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medications")
        .select("patient_id, adherence_pct")
        .limit(2000);
      if (error) throw new Error(error.message);
      return (data ?? []) as MedRow[];
    },
    staleTime: 60_000,
  });

  const rows = useMemo(() => {
    const adherence = new Map<string, number[]>();
    for (const m of meds.data ?? []) {
      const list = adherence.get(m.patient_id) ?? [];
      list.push(m.adherence_pct);
      adherence.set(m.patient_id, list);
    }
    const latest = new Map<string, { score: number; band: string; at: string }>();
    for (const r of risks.data ?? []) {
      const prev = latest.get(r.patient_id);
      if (!prev || new Date(r.computed_at) > new Date(prev.at))
        latest.set(r.patient_id, { score: r.score, band: r.band, at: r.computed_at });
    }
    return (patients.data ?? [])
      .filter((p) => p.insurer)
      .map((p) => {
        const list = adherence.get(p.id) ?? [];
        const adh = list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : 0;
        const risk = latest.get(p.id);
        const engaged = adh >= 85;
        const credit = engaged ? 18 : adh >= 70 ? 9 : 0;
        const basePremium = 96 + Math.round((risk?.score ?? 40) * 1.35);
        return {
          patient: p,
          adherence: adh,
          band: risk?.band ?? "low",
          score: risk?.score ?? 0,
          credit,
          premium: Math.max(60, basePremium - Math.round((basePremium * credit) / 100)),
          basePremium,
        };
      })
      .sort((a, b) => b.credit - a.credit || b.adherence - a.adherence)
      .slice(0, 40);
  }, [patients.data, meds.data, risks.data]);

  const insurers = useMemo(() => {
    const m = new Map<string, { name: string; lives: number; avgRisk: number; scores: number[] }>();
    const latest = new Map<string, number>();
    for (const r of risks.data ?? []) latest.set(r.patient_id, r.score);
    for (const p of patients.data ?? []) {
      if (!p.insurer) continue;
      const cur = m.get(p.insurer) ?? { name: p.insurer, lives: 0, avgRisk: 0, scores: [] };
      cur.lives += 1;
      cur.scores.push(latest.get(p.id) ?? 0);
      m.set(p.insurer, cur);
    }
    return [...m.values()].map((i) => ({
      ...i,
      avgRisk: i.scores.length
        ? Math.round(i.scores.reduce((a, b) => a + b, 0) / i.scores.length)
        : 0,
    }));
  }, [patients.data, risks.data]);

  // Completed only — an unheld appointment has avoided no overseas spend.
  const retained = (referrals.data ?? [])
    .filter((r) => r.status === "completed")
    .reduce((a, r) => a + r.retained_value_usd, 0);
  const avoidedAdmissions = Math.round(
    (referrals.data ?? []).filter((r) => r.status !== "pending").length * 0.34,
  );
  const creditsIssued = rows.reduce((a, r) => a + (r.basePremium - r.premium), 0);

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-8">
      <SectionTitle
        eyebrow="Sustainable funding"
        title="Insurer engine"
        blurb="CareBridge pays for itself before any ministry budget line is touched. Continuous adherence and home-monitoring data turns into premium credits for patients and live risk-adjusted pricing for insurers — replacing actuarial tables written before diabetes prevalence doubled."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat
          label="Overseas spend avoided"
          value={usd(retained)}
          hint="Care delivered in-region"
          tone="low"
        />
        <Stat
          label="Estimated admissions avoided"
          value={avoidedAdmissions}
          hint="Early routing vs. ER arrival"
          tone="signal"
        />
        <Stat
          label="Premium credits issued"
          value={usd(creditsIssued)}
          hint="Monthly, to engaged members"
        />
        <Stat
          label="Insured lives on CareBridge"
          value={rows.length ? insurers.reduce((a, i) => a + i.lives, 0) : 0}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          <PanelHeader
            title="Member engagement ledger"
            subtitle="Adherence converted into monthly premium credit"
          />
          <div className="max-h-[620px] overflow-y-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 bg-card text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 font-semibold">Member</th>
                  <th className="px-3 py-2.5 font-semibold">Risk</th>
                  <th className="px-3 py-2.5 font-semibold">Adherence</th>
                  <th className="px-3 py-2.5 font-semibold">Credit</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Premium / mo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.patient.id} className="hover:bg-surface">
                    <td className="px-5 py-2.5">
                      <div className="font-medium">{r.patient.full_name}</div>
                      <div className="text-[11.5px] text-muted-foreground">
                        {r.patient.insurer} · {r.patient.island_code}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Pill className={bandClasses(r.band)}>{r.score}</Pill>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface">
                          <div
                            className={
                              "h-full rounded-full " + (r.adherence >= 85 ? "bg-low" : "bg-high")
                            }
                            style={{ width: `${r.adherence}%` }}
                          />
                        </div>
                        <span className="mono-num text-[12px]">{r.adherence}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={r.credit ? "text-low" : "text-muted-foreground"}>
                        -{r.credit}%
                      </span>
                    </td>
                    <td className="mono-num px-5 py-2.5 text-right">
                      <span className="text-muted-foreground line-through">${r.basePremium}</span>{" "}
                      <span className="font-semibold">${r.premium}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Book of business" subtitle="Live risk per insurer" />
            <div className="divide-y divide-border">
              {insurers.map((i) => (
                <div key={i.name} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <div className="text-[13.5px] font-semibold">{i.name}</div>
                    <div className="text-[11.5px] text-muted-foreground">
                      {i.lives} lives monitored
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="mono-num text-[16px] font-semibold">{i.avgRisk}</div>
                    <div className="text-[11px] text-muted-foreground">avg risk</div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="p-5">
            <h3 className="font-display text-[15px] font-semibold">Why insurers pay for this</h3>
            <ul className="mt-3 space-y-2 text-[13px] text-muted-foreground">
              <li>• One avoided dialysis start funds thousands of monitored member-months.</li>
              <li>
                • Overseas cardiac transfers cost 6–10× the same teleconsult delivered in-region.
              </li>
              <li>• Adherence data lets pricing follow behaviour instead of age brackets.</li>
              <li>
                • Ministries get the population view for free; insurers carry the platform cost.
              </li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
