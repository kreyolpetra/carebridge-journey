export interface RoutableProvider {
  id: string;
  full_name: string;
  specialty: string;
  island_code: string;
  languages: string[];
  teleconsult_rate_usd: number;
  next_local_wait_days: number;
  facility_id: string | null;
}

export interface RoutableSlot {
  id: string;
  provider_id: string;
  starts_at: string;
  minutes: number;
  status: string;
}

export interface RoutingCandidate {
  provider: RoutableProvider;
  slot: RoutableSlot | null;
  hoursToSlot: number;
  crossIsland: boolean;
  languageMatch: boolean;
  loadPct: number;
  score: number;
  reasons: string[];
}

export interface IslandProfile {
  code: string;
  tier: string;
  physPer1k: number;
  connectivity: string;
  payment: string;
}

export interface RoutingDecision {
  chosen: RoutingCandidate | null;
  runnersUp: RoutingCandidate[];
  localWaitDays: number;
  specialty: string;
  noLocalCapacity: boolean;
  /** 0–100: how much worse off this patient is if they get no regional slot. */
  needScore: number;
  needReasons: string[];
  /** True when need, not fit, is what moved this patient up the queue. */
  prioritisedOnNeed: boolean;
}

const CLINICAL_WINDOW_HOURS: Record<string, number> = {
  emergency: 4,
  urgent: 72,
  routine: 336,
  self_care: 720,
};

/**
 * How much worse off is this patient if the region gives the slot to someone
 * else? That question — not "who fits best" — is what stops a shared pool of
 * specialist minutes flowing to the islands that need it least.
 *
 * A Barbadian patient turned away waits eleven days for a local cardiologist.
 * A Haitian patient turned away gets no cardiology at all; there is none in the
 * country. Score only on fit and those two refusals look identical, so an
 * efficiency optimiser settles, quietly and repeatedly, in favour of the
 * patient who had somewhere else to go.
 *
 * This is the reasoning clinical triage already uses elsewhere: allocate
 * against counterfactual harm, not throughput.
 */
export function computeNeed(args: {
  noLocalCapacity: boolean;
  localWaitDays: number;
  windowHours: number;
  profile?: IslandProfile | undefined;
}): { score: number; reasons: string[] } {
  const { noLocalCapacity, localWaitDays, windowHours, profile } = args;
  const reasons: string[] = [];
  let score = 0;

  if (noLocalCapacity) {
    score += 55;
    reasons.push("No clinician in this specialty anywhere in the patient's country");
  } else {
    const windowDays = windowHours / 24;
    const overrun = localWaitDays - windowDays;
    if (overrun > 0) {
      score += Math.min(40, Math.round((overrun / Math.max(windowDays, 1)) * 18));
      reasons.push(
        `Local wait of ${localWaitDays} days overshoots the clinical window by ${Math.round(overrun)} days`,
      );
    }
  }

  if (profile?.tier === "under_resourced") {
    score += 20;
    reasons.push(
      `${profile.code}: ${profile.physPer1k} physicians per 1,000 — the region's thinnest workforce`,
    );
  } else if (profile?.tier === "clinician_rich") {
    // Deep clinical bench; the binding constraint here is medicine supply, not
    // access to a clinician, so a referral out is rarely what is short.
    score -= 10;
    reasons.push(`${profile.code}: deep local clinical capacity (${profile.physPer1k}/1,000)`);
  }

  if (profile?.payment === "out_of_pocket") {
    score += 12;
    reasons.push("Care is paid out of pocket — an overseas referral is not a real alternative");
  }

  if (profile?.connectivity === "poor") {
    score += 6;
    reasons.push("Low-connectivity setting — a missed booking is hard to re-establish");
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

/**
 * Capacity-aware routing. Specialist minutes are treated as a scarce regional
 * resource: we score every provider in the region on how soon they can actually
 * see this patient, how loaded they already are, whether they speak the
 * patient's language, and whether staying on-island is even possible.
 */
export function routePatient(args: {
  specialty: string;
  severity: string;
  patientIsland: string;
  patientLanguage: string;
  providers: RoutableProvider[];
  slots: RoutableSlot[];
  patientIslandProfile?: IslandProfile | undefined;
}): RoutingDecision {
  const {
    specialty,
    severity,
    patientIsland,
    patientLanguage,
    providers,
    slots,
    patientIslandProfile,
  } = args;
  const windowHours = CLINICAL_WINDOW_HOURS[severity] ?? 336;
  const now = Date.now();

  const pool = providers.filter((p) => p.specialty === specialty);
  const fallbackPool = pool.length
    ? pool
    : providers.filter((p) => p.specialty === "Internal Medicine");
  const effective = fallbackPool.length ? fallbackPool : providers;

  // Local capacity is judged against the requested specialty, not the fallback
  // pool — an internist standing in for absent cardiology is a substitution,
  // not evidence that the country has cardiology.
  const localProviders = providers.filter(
    (p) => p.island_code === patientIsland && p.specialty === specialty,
  );
  const localWaitDays = localProviders.length
    ? Math.min(...localProviders.map((p) => p.next_local_wait_days))
    : 45;
  const noLocalCapacity = localProviders.length === 0;

  const need = computeNeed({
    noLocalCapacity,
    localWaitDays,
    windowHours,
    profile: patientIslandProfile,
  });

  const candidates: RoutingCandidate[] = effective.map((provider) => {
    const own = slots.filter((s) => s.provider_id === provider.id);
    const open = own
      .filter((s) => s.status === "open" && new Date(s.starts_at).getTime() > now)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    const slot = open[0] ?? null;
    const hoursToSlot = slot
      ? Math.max(0, (new Date(slot.starts_at).getTime() - now) / 3_600_000)
      : provider.next_local_wait_days * 24;
    const booked = own.filter((s) => s.status === "booked").length;
    const loadPct = own.length ? Math.round((booked / own.length) * 100) : 100;
    const crossIsland = provider.island_code !== patientIsland;
    // Previously this counted `patientLanguage === "en"` as an automatic match,
    // which exempted English speakers from the mismatch penalty while charging
    // it to every Kreyòl, Kwéyòl and Spanish speaker. A match now means the
    // clinician actually speaks the patient's language.
    const languageMatch = provider.languages.includes(patientLanguage);

    const reasons: string[] = [];
    let score = 100;

    const timeliness = Math.max(0, 1 - hoursToSlot / windowHours);
    score += timeliness * 120;
    if (hoursToSlot <= windowHours) {
      reasons.push(
        `Available in ${formatHours(hoursToSlot)} — inside the ${formatHours(windowHours)} clinical window`,
      );
    } else {
      // A slot outside the window is still the only care on offer when there is
      // no local alternative, so the penalty is softened in proportion to need.
      // Otherwise the highest-need patients are the ones the window rejects.
      const penalty = Math.round(90 * (1 - need.score / 200));
      score -= penalty;
      reasons.push(
        need.score >= 40
          ? `Next opening in ${formatHours(hoursToSlot)} — outside the window, but it is the only access this patient has`
          : `Next opening in ${formatHours(hoursToSlot)} — outside the clinical window`,
      );
    }

    score -= loadPct * 0.45;
    reasons.push(`${loadPct}% of their regional capacity already booked`);

    if (!crossIsland) {
      score += 22;
      reasons.push("On-island — no cross-border consent needed");
    } else {
      // Charging a cross-border penalty to a patient whose country has no such
      // clinician penalises them for their government's capacity. Waive it.
      if (noLocalCapacity) {
        reasons.push(
          `Cross-island from ${provider.island_code} — unavoidable, no local option exists`,
        );
      } else {
        score -= 8;
        reasons.push(`Cross-island from ${provider.island_code} — consent grant required`);
      }
    }

    if (languageMatch) {
      score += 14;
      reasons.push("Speaks the patient's language");
    } else {
      score -= 18;
      reasons.push("Language mismatch — interpreter needed");
    }

    if (provider.specialty !== specialty) {
      score -= 25;
      reasons.push(`${provider.specialty} covering for absent ${specialty}`);
    }

    return { provider, slot, hoursToSlot, crossIsland, languageMatch, loadPct, score, reasons };
  });

  candidates.sort((a, b) => b.score - a.score);

  return {
    chosen: candidates[0] ?? null,
    runnersUp: candidates.slice(1, 4),
    localWaitDays,
    specialty,
    noLocalCapacity,
    needScore: need.score,
    needReasons: need.reasons,
    prioritisedOnNeed: need.score >= 40,
  };
}

export function formatHours(hours: number) {
  if (hours < 1) return "<1 hr";
  if (hours < 48) return `${Math.round(hours)} hrs`;
  return `${Math.round(hours / 24)} days`;
}

/** Value retained in-region: what an overseas trip for this specialty would cost. */
export function retainedValueUsd(specialty: string, crossIsland: boolean) {
  const base: Record<string, number> = {
    Cardiology: 11200,
    Nephrology: 9400,
    Endocrinology: 6800,
    Ophthalmology: 5200,
    "Internal Medicine": 4100,
    Psychiatry: 3600,
    "General Practice": 1800,
  };
  const value = base[specialty] ?? 4000;
  return crossIsland ? value : Math.round(value * 0.65);
}
