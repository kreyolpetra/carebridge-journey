// Ask — natural-language querying in the command palette.
//
// Deterministic intent matching over the Grid's own data. No language model, for
// the reasons set out in ./core.ts, and the UI says so rather than implying one.
//
// The point is not to look clever. It is that a ministry analyst can type "where
// is there no cardiology" and get a real answer out of live data instead of
// clicking through four screens — and can see which records produced it.
//
// Swapping in a model later means replacing `classify()` with a call that
// returns the same Intent, and leaving everything below it untouched.

import type { Island, Patient, Provider, Referral, RiskScore, StockItem } from "@/lib/api";

export interface AskRow {
  id: string;
  label: string;
  sub: string;
  to?: string;
  patientId?: string;
}

export interface AskResult {
  intent: string;
  answer: string;
  rows: AskRow[];
  /** Which records the answer was computed from — shown so it can be checked. */
  basis: string;
}

export interface AskData {
  islands: Island[];
  patients: Patient[];
  risks: RiskScore[];
  providers: Provider[];
  referrals: Referral[];
  stock: StockItem[];
}

const SPECIALTIES = [
  "Cardiology",
  "Endocrinology",
  "Nephrology",
  "Internal Medicine",
  "General Practice",
  "Ophthalmology",
  "Psychiatry",
];

/** "1 is critical" / "3 are critical" — small thing, but it reads as broken otherwise. */
function plural(n: number, singular: string, pluralForm: string) {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

type Intent =
  | { kind: "risk"; island?: string | undefined; band?: string | undefined }
  | { kind: "gap"; specialty?: string | undefined }
  | { kind: "supply"; island?: string | undefined }
  | { kind: "referrals" }
  | { kind: "country"; code: string }
  | { kind: "equity" }
  | { kind: "meds_out" };

/** Resolve a free-text question to an intent. Replaceable by a model call. */
function classify(q: string, islands: Island[]): Intent | null {
  const s = q.toLowerCase().trim();
  if (s.length < 3) return null;

  const island = islands.find(
    (i) => s.includes(i.name.toLowerCase()) || new RegExp(`\\b${i.code.toLowerCase()}\\b`).test(s),
  );
  const specialty = SPECIALTIES.find((sp) => s.includes(sp.toLowerCase()));

  if (/\b(equit|fair|gap|unequal|disparit)/.test(s)) return { kind: "equity" };

  if (/\b(no|without|lack|missing|gap)\b/.test(s) && (specialty || /special/.test(s))) {
    return { kind: "gap", specialty };
  }

  // Plurals matter here: a trailing \b after "shortage" will not match
  // "shortages", which is how people actually phrase this.
  if (/\b(stock|shortages?|supplies|supply|stockouts?|out of stock|running low)\b/.test(s)) {
    return { kind: "supply", island: island?.code };
  }

  if (/\b(run(ning)? out|refill|days? (of )?(supply|medication)|out of medication)\b/.test(s)) {
    return { kind: "meds_out" };
  }

  if (/\b(referral|referred|booked|teleconsult|waiting)\b/.test(s)) return { kind: "referrals" };

  if (/\b(risk|critical|high[- ]risk|sickest|deteriorat|worst)\b/.test(s)) {
    const band = /critical/.test(s) ? "critical" : /high/.test(s) ? "high" : undefined;
    return { kind: "risk", island: island?.code, band };
  }

  if (island && s.split(/\s+/).length <= 4) return { kind: "country", code: island.code };

  return null;
}

export function askGrid(query: string, data: AskData): AskResult | null {
  const intent = classify(query, data.islands);
  if (!intent) return null;

  const latestRisk = new Map<string, RiskScore>();
  for (const r of data.risks) {
    const prev = latestRisk.get(r.patient_id);
    if (!prev || new Date(r.computed_at) > new Date(prev.computed_at)) latestRisk.set(r.patient_id, r);
  }
  const islandName = (code: string) => data.islands.find((i) => i.code === code)?.name ?? code;

  switch (intent.kind) {
    case "risk": {
      let pool = data.patients;
      if (intent.island) pool = pool.filter((p) => p.island_code === intent.island);
      const scored = pool
        .map((p) => ({ p, r: latestRisk.get(p.id) }))
        .filter((x): x is { p: Patient; r: RiskScore } => !!x.r)
        .filter((x) => (intent.band ? x.r.band === intent.band : true))
        .sort((a, b) => b.r.score - a.r.score)
        .slice(0, 8);

      const where = intent.island ? ` in ${islandName(intent.island)}` : " across the region";
      return {
        intent: "Highest-risk patients",
        answer: scored.length
          ? `${scored.length} shown${where}, ranked by composite risk. ${plural(scored.filter((x) => x.r.band === "critical").length, "is", "are")} critical.`
          : `No patients matched${where}.`,
        rows: scored.map((x) => ({
          id: x.p.id,
          label: x.p.full_name,
          sub: `risk ${x.r.score} · ${x.r.band} · ${x.r.trend} · ${x.p.parish}, ${x.p.island_code}`,
          patientId: x.p.id,
        })),
        basis: `${pool.length} patients, ${latestRisk.size} current risk scores`,
      };
    }

    case "gap": {
      const specs = intent.specialty ? [intent.specialty] : SPECIALTIES;
      const rows: AskRow[] = [];
      for (const island of data.islands) {
        const have = new Set(
          data.providers.filter((p) => p.island_code === island.code).map((p) => p.specialty),
        );
        const missing = specs.filter((s) => !have.has(s));
        if (missing.length) {
          const affected = data.patients.filter((p) => p.island_code === island.code).length;
          rows.push({
            id: island.code,
            label: `${island.name} — no ${missing.join(", ")}`,
            sub: `${affected} monitored patients · ${island.physPer1k} physicians/1,000${island.tier === "under_resourced" ? " · under-resourced" : ""}`,
            to: "/dashboard",
          });
        }
      }
      return {
        intent: intent.specialty ? `Countries with no ${intent.specialty}` : "Specialist coverage gaps",
        answer: rows.length
          ? `${rows.length} of ${data.islands.length} countries have a gap. Every referral raised there has to cross a border, which needs a consent grant first.`
          : "No coverage gaps found.",
        rows,
        basis: `${data.providers.length} clinicians across ${data.islands.length} countries`,
      };
    }

    case "supply": {
      let rows = data.stock.filter((s) => s.status !== "ok");
      if (intent.island) {
        const ids = new Set(
          data.providers.filter((p) => p.island_code === intent.island).map((p) => p.facility_id),
        );
        rows = rows.filter((s) => ids.has(s.facility_id));
      }
      rows = rows.sort((a, b) => a.days_cover - b.days_cover).slice(0, 8);
      return {
        intent: "Medicines below safe cover",
        answer: rows.length
          ? `${rows.length} shown, soonest to run out first. ${plural(rows.filter((r) => r.status === "critical").length, "is", "are")} critical.`
          : "No facilities are below safe cover.",
        rows: rows.map((s) => ({
          id: s.id,
          label: s.medication_name,
          sub: `${s.days_cover} days of cover · ${s.on_hand} units · ${s.status}`,
          to: "/dashboard",
        })),
        basis: `${data.stock.length} stock lines`,
      };
    }

    case "meds_out": {
      const scored = data.patients
        .map((p) => ({ p, r: latestRisk.get(p.id) }))
        .filter((x) => x.r && (x.r.band === "critical" || x.r.band === "high"))
        .slice(0, 8);
      return {
        intent: "At-risk patients to contact about refills",
        answer:
          "Ranked by risk band. Supply, not dose, is usually the fixable problem — check refills before escalating treatment.",
        rows: scored.map((x) => ({
          id: x.p.id,
          label: x.p.full_name,
          sub: `risk ${x.r?.score} · ${x.p.parish}, ${x.p.island_code}`,
          patientId: x.p.id,
        })),
        basis: `${data.patients.length} patients with current risk scores`,
      };
    }

    case "referrals": {
      const open = data.referrals.filter((r) => r.status !== "completed").slice(0, 8);
      const onNeed = data.referrals.filter((r) => r.prioritised_on_need).length;
      return {
        intent: "Referral pipeline",
        answer: `${data.referrals.length} referrals total, ${open.length} still open. ${onNeed} were moved up because the patient's country has no clinician in that specialty.`,
        rows: open.map((r) => ({
          id: r.id,
          label: `${r.specialty} · ${r.patient_island}`,
          sub: `${r.cross_island ? "cross-border" : "local"} · routed in ${r.wait_days_routed}d vs ${r.wait_days_local}d locally${r.prioritised_on_need ? " · on need" : ""}`,
          to: "/dashboard",
        })),
        basis: `${data.referrals.length} referrals`,
      };
    }

    case "country": {
      const island = data.islands.find((i) => i.code === intent.code)!;
      const pts = data.patients.filter((p) => p.island_code === island.code);
      const have = new Set(data.providers.filter((p) => p.island_code === island.code).map((p) => p.specialty));
      const missing = SPECIALTIES.filter((s) => !have.has(s));
      const critical = pts.filter((p) => latestRisk.get(p.id)?.band === "critical").length;
      return {
        intent: `${island.name} at a glance`,
        answer: `${(island.population / 1e6).toFixed(1)}M people · ${island.physPer1k} physicians/1,000 · ${island.connectivity} connectivity · care paid ${island.payment.replace("_", " ")}.`,
        rows: [
          { id: "pts", label: `${pts.length} monitored patients`, sub: `${critical} at critical risk`, to: "/clinician" },
          {
            id: "gaps",
            label: missing.length ? `No ${missing.join(", ")}` : "All specialties covered locally",
            sub: missing.length ? "Referrals in these specialties must cross a border" : "No cross-border referral needed",
            to: "/dashboard",
          },
        ],
        basis: `${pts.length} patients, ${data.providers.filter((p) => p.island_code === island.code).length} clinicians`,
      };
    }

    case "equity": {
      const byTier = new Map<string, { patients: number; refs: number }>();
      for (const i of data.islands) if (!byTier.has(i.tier)) byTier.set(i.tier, { patients: 0, refs: 0 });
      const tierOf = new Map(data.islands.map((i) => [i.code, i.tier]));
      for (const p of data.patients) {
        const t = tierOf.get(p.island_code);
        if (t) byTier.get(t)!.patients++;
      }
      for (const r of data.referrals) {
        const t = tierOf.get(r.patient_island);
        if (t) byTier.get(t)!.refs++;
      }
      const rows = [...byTier.entries()].map(([tier, v]) => ({
        id: tier,
        label: tier.replace(/_/g, " "),
        sub: `${v.patients} patients · ${v.refs} referrals · ${v.patients ? ((v.refs / v.patients) * 100).toFixed(1) : "0"}% access rate`,
        to: "/dashboard",
      }));
      const under = byTier.get("under_resourced");
      const well = byTier.get("well_resourced");
      const ratio =
        under && well && well.patients && under.patients && well.refs
          ? (under.refs / under.patients / (well.refs / well.patients)) * 100
          : null;
      return {
        intent: "Access equity by resource tier",
        answer:
          ratio !== null
            ? `Patients in under-resourced countries reach a specialist at ${Math.round(ratio)}% the rate of those in well-resourced ones, at equal clinical risk. Parity is 100%.`
            : "Not enough referral history to compute the gap.",
        rows,
        basis: `${data.patients.length} patients, ${data.referrals.length} referrals`,
      };
    }
  }
}

export const ASK_EXAMPLES = [
  "who is at critical risk in Haiti",
  "which countries have no cardiology",
  "medication shortages",
  "show me the access equity gap",
  "referrals waiting",
];
