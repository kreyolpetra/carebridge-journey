import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  alertsQuery,
  facilitiesQuery,
  islandsQuery,
  patientsQuery,
  providersQuery,
  referralsQuery,
  riskScoresQuery,
  stockQuery,
} from "@/lib/api";
import { Panel, PanelHeader, Pill, Stat, SectionTitle } from "@/components/grid";
import { severityClasses, timeAgo, usd, TIER_LABEL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Coordination Dashboard — Regional NCD Operations | CariCare Grid" },
      {
        name: "description",
        content:
          "Live regional view of chronic disease risk, hospital capacity, specialist scarcity, medication stockouts and the value of care retained in the Caribbean.",
      },
      { property: "og:title", content: "Coordination Dashboard — Regional NCD Operations" },
      {
        property: "og:description",
        content: "Ministries and hospital networks see the whole region on one screen, in real time.",
      },
    ],
  }),
  component: Dashboard,
});

const SPECIALTIES = ["Cardiology", "Endocrinology", "Nephrology", "Internal Medicine", "Ophthalmology", "Psychiatry"];

function Dashboard() {
  const islands = useQuery(islandsQuery);
  const patients = useQuery(patientsQuery);
  const risks = useQuery(riskScoresQuery);
  const providers = useQuery(providersQuery);
  const facilities = useQuery(facilitiesQuery);
  const referrals = useQuery(referralsQuery);
  const alerts = useQuery(alertsQuery);
  const stock = useQuery(stockQuery);

  const latestRisk = useMemo(() => {
    const m = new Map<string, { score: number; band: string; at: string }>();
    for (const r of risks.data ?? []) {
      const prev = m.get(r.patient_id);
      if (!prev || new Date(r.computed_at) > new Date(prev.at))
        m.set(r.patient_id, { score: r.score, band: r.band, at: r.computed_at });
    }
    return m;
  }, [risks.data]);

  const byIsland = useMemo(() => {
    const pmap = patients.data ?? [];
    return (islands.data ?? []).map((island) => {
      const rows = pmap.filter((p) => p.island_code === island.code);
      const scores = rows.map((p) => latestRisk.get(p.id)?.score ?? 0).filter(Boolean);
      const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      const critical = rows.filter((p) => {
        const band = latestRisk.get(p.id)?.band;
        return band === "critical" || band === "high";
      }).length;
      const beds = (facilities.data ?? []).filter((f) => f.island_code === island.code);
      const bedsTotal = beds.reduce((a, f) => a + f.beds_total, 0);
      const bedsOcc = beds.reduce((a, f) => a + f.beds_occupied, 0);
      const specialists = (providers.data ?? []).filter((p) => p.island_code === island.code);
      const gaps = SPECIALTIES.filter((s) => !specialists.some((p) => p.specialty === s));
      return {
        island,
        patients: rows.length,
        avg,
        critical,
        occupancy: bedsTotal ? Math.round((bedsOcc / bedsTotal) * 100) : 0,
        bedsTotal,
        specialists: specialists.length,
        gaps,
      };
    });
  }, [islands.data, patients.data, facilities.data, providers.data, latestRisk]);

  const refs = referrals.data ?? [];
  const retained = refs.reduce((a, r) => a + r.retained_value_usd, 0);
  const crossIsland = refs.filter((r) => r.cross_island);
  // Averaged only over referrals that had a real local alternative. Cases with
  // no local clinician at all would otherwise dominate this figure and make
  // routing look far more effective than it is.
  const comparable = refs.filter((r) => r.wait_days_local < 120);
  const avgSaved = comparable.length
    ? Math.round(comparable.reduce((a, r) => a + (r.wait_days_local - r.wait_days_routed), 0) / comparable.length)
    : 0;

  // Aggregate throughput hides distribution: the region can look healthy while
  // the countries with the least capacity are served last, or not at all. This
  // groups outcomes by resource tier so the gap is visible rather than averaged
  // away — the number a ministry should be judged on.
  const equityByTier = useMemo(() => {
    const islandTier = new Map((islands.data ?? []).map((i) => [i.code, i.tier]));
    const tiers = ["under_resourced", "middle", "clinician_rich", "well_resourced"];
    return tiers
      .map((tier) => {
        const tierIslands = (islands.data ?? []).filter((i) => i.tier === tier);
        const tierRefs = refs.filter((r) => islandTier.get(r.patient_island) === tier);
        const tierPatients = (patients.data ?? []).filter((p) => islandTier.get(p.island_code) === tier);
        const waits = tierRefs.map((r) => r.wait_days_routed);
        const medianWait = waits.length
          ? waits.slice().sort((a, b) => a - b)[Math.floor(waits.length / 2)]
          : null;
        return {
          tier,
          islands: tierIslands.map((i) => i.code),
          patients: tierPatients.length,
          referrals: tierRefs.length,
          // Referrals per 100 monitored patients — the access rate, which is
          // what a raw referral count obscures.
          accessRate: tierPatients.length ? (tierRefs.length / tierPatients.length) * 100 : 0,
          medianWait,
          onNeed: tierRefs.filter((r) => r.prioritised_on_need).length,
        };
      })
      .filter((row) => row.islands.length > 0);
  }, [islands.data, patients.data, refs]);

  const accessGap = useMemo(() => {
    const under = equityByTier.find((r) => r.tier === "under_resourced");
    const well = equityByTier.find((r) => r.tier === "well_resourced");
    if (!under || !well || well.accessRate === 0) return null;
    return under.accessRate / well.accessRate;
  }, [equityByTier]);

  const specialtyDemand = useMemo(
    () =>
      SPECIALTIES.map((s) => ({
        specialty: s.replace("Internal Medicine", "Int. Med"),
        referrals: refs.filter((r) => r.specialty === s).length,
        clinicians: (providers.data ?? []).filter((p) => p.specialty === s).length,
      })),
    [refs, providers.data],
  );

  const weekly = useMemo(() => {
    const buckets = new Map<string, { week: string; routed: number; retained: number }>();
    for (const r of refs) {
      const d = new Date(r.created_at);
      const key = `${d.getMonth() + 1}/${Math.ceil(d.getDate() / 7)}`;
      const cur = buckets.get(key) ?? { week: key, routed: 0, retained: 0 };
      cur.routed += 1;
      cur.retained += r.retained_value_usd;
      buckets.set(key, cur);
    }
    return [...buckets.values()].slice(-10);
  }, [refs]);

  const stockouts = (stock.data ?? []).filter((s) => s.status !== "ok").slice(0, 12);
  const facilityName = (id: string) => facilities.data?.find((f) => f.id === id)?.name ?? "Facility";

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-8">
      <SectionTitle
        eyebrow="Ministry & hospital network view"
        title="Regional coordination"
        blurb="Chronic disease is a supply-and-demand problem. This is the live picture: where risk is concentrating, where specialist capacity actually exists, which pharmacies are about to run dry, and how much care the region is keeping instead of exporting."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat
          label="Monitored patients"
          value={(patients.data?.length ?? 0).toLocaleString()}
          hint={`Across ${islands.data?.length ?? 0} countries`}
        />
        <Stat label="Cross-island referrals" value={crossIsland.length} hint="Capacity shared regionally" tone="signal" />
        <Stat
          label="Wait days avoided"
          value={`${avgSaved}d`}
          hint="Where a local option existed"
          tone="low"
        />
        <Stat label="Care retained in-region" value={usd(retained)} hint="Instead of overseas transfer" tone="low" />
        <Stat label="Open alerts" value={alerts.data?.length ?? 0} hint="Clinical, supply, capacity" tone="critical" />
      </div>

      <Panel className="mb-4">
        <PanelHeader
          title="Access equity by resource tier"
          subtitle="Whether the countries with the least capacity are actually being reached — not just regional totals"
        />
        <div className="p-5">
          {accessGap !== null && (
            <p className="mb-4 text-[13.5px] leading-relaxed text-muted-foreground">
              At equal clinical risk, patients in under-resourced countries have historically reached a
              specialist at{" "}
              <strong className={accessGap < 0.8 ? "text-critical" : "text-foreground"}>
                {Math.round(accessGap * 100)}%
              </strong>{" "}
              the rate of those in well-resourced ones. Parity is 100%. This is the region as it stands, not a
              result the Grid has produced — the <strong className="text-foreground">on need</strong> column is
              the correction now being applied.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Tier</th>
                  <th className="pb-2 pr-3 font-medium">Countries</th>
                  <th className="pb-2 pr-3 text-right font-medium">Patients</th>
                  <th className="pb-2 pr-3 text-right font-medium">Referrals</th>
                  <th className="pb-2 pr-3 text-right font-medium">Access rate</th>
                  <th className="pb-2 pr-3 text-right font-medium">Median wait</th>
                  <th className="pb-2 text-right font-medium">On need</th>
                </tr>
              </thead>
              <tbody>
                {equityByTier.map((row) => (
                  <tr key={row.tier} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 pr-3 font-medium text-foreground">{TIER_LABEL[row.tier] ?? row.tier}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground">{row.islands.join(", ")}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{row.patients}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{row.referrals}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{row.accessRate.toFixed(1)}%</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {row.medianWait === null ? "—" : `${row.medianWait}d`}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{row.onNeed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
            <strong className="text-foreground">On need</strong> counts referrals the router moved up because the
            patient's country has no clinician in that specialty at all. Those are the cases a pure
            soonest-slot algorithm would have placed last.
          </p>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Panel>
          <PanelHeader title="Island health grid" subtitle="Risk load, bed occupancy and specialist gaps" />
          <div className="grid gap-3 p-5 md:grid-cols-2">
            {byIsland.map((row) => (
              <div key={row.island.code} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-display text-[14px] font-semibold">{row.island.name}</span>
                      {row.island.tier === "under_resourced" && (
                        <Pill className="bg-critical/15 text-critical border-critical/40">under-resourced</Pill>
                      )}
                      {row.island.tier === "clinician_rich" && (
                        <Pill className="bg-low/15 text-low border-low/40">clinician-rich</Pill>
                      )}
                    </div>
                    <div className="text-[11.5px] text-muted-foreground">
                      {(row.island.population / 1000).toFixed(0)}k people · {row.island.physPer1k} physicians/1,000
                      {row.island.connectivity === "poor" && " · low connectivity"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="mono-num text-[20px] font-semibold">{row.avg}</div>
                    <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">avg risk</div>
                  </div>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-background">
                  <div
                    className="h-full rounded-full bg-critical"
                    style={{ width: `${Math.min(100, row.avg)}%` }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[11.5px]">
                  <div>
                    <div className="mono-num text-[14px] text-foreground">{row.patients}</div>
                    <div className="text-muted-foreground">patients</div>
                  </div>
                  <div>
                    <div className={"mono-num text-[14px] " + (row.occupancy > 88 ? "text-critical" : "text-foreground")}>
                      {row.occupancy}%
                    </div>
                    <div className="text-muted-foreground">{row.bedsTotal} beds</div>
                  </div>
                  <div>
                    <div className="mono-num text-[14px] text-foreground">{row.specialists}</div>
                    <div className="text-muted-foreground">clinicians</div>
                  </div>
                </div>
                {row.gaps.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {row.gaps.map((g) => (
                      <span
                        key={g}
                        className="rounded-md border border-critical/35 bg-critical/10 px-2 py-0.5 text-[11px] text-critical"
                      >
                        no {g.toLowerCase()}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Live alerts" subtitle="Clinical, supply and capacity signals" />
            <div className="max-h-[320px] divide-y divide-border overflow-y-auto">
              {(alerts.data ?? []).slice(0, 25).map((a) => (
                <div key={a.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <Pill className={severityClasses(a.severity)}>{a.kind}</Pill>
                    <span className="text-[11px] text-muted-foreground">{timeAgo(a.created_at)}</span>
                  </div>
                  <div className="mt-1.5 text-[13px] font-medium">{a.title}</div>
                  <p className="text-[12px] text-muted-foreground">{a.detail}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Medication supply risk" subtitle="Days of cover by facility" />
            <div className="max-h-[300px] divide-y divide-border overflow-y-auto">
              {stockouts.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <div>
                    <div className="text-[13px] font-medium">{s.medication_name}</div>
                    <div className="text-[11.5px] text-muted-foreground">{facilityName(s.facility_id)}</div>
                  </div>
                  <div className={"mono-num text-[13px] " + (s.days_cover < 7 ? "text-critical" : "text-high")}>
                    {s.days_cover}d
                  </div>
                </div>
              ))}
              {!stockouts.length ? (
                <p className="p-5 text-[13px] text-muted-foreground">All tracked medications above threshold.</p>
              ) : null}
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Demand vs. supply by specialty" subtitle="Referrals raised against clinicians available" />
          <div className="h-[280px] p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={specialtyDemand}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="specialty" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} width={30} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="referrals" fill="var(--color-critical)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="clinicians" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Referrals routed per week" subtitle="Volume kept inside the region" />
          <div className="h-[280px] p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekly}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} width={30} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="routed" fill="var(--color-low)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </div>
  );
}
