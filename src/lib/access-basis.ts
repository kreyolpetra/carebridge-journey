/**
 * Access-basis resolution — the enforcement half of docs/access-control-spec.md.
 *
 * The spec's object model (lawful bases, care tiers, treating windows, DSAs) has
 * lived in src/lib/access.ts since v2 was written, but only the patient-facing
 * surfaces ever read it. The clinician surfaces asked no question at all: the
 * queue showed every patient in the region and every chart open was logged as
 * `treating` whether or not anyone at the reader's facility was treating anyone.
 *
 * This module answers the question. It implements the resolution order in §7 of
 * the spec, and it is the only thing that decides whether a clinical surface may
 * render a named patient.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  agreementsQuery,
  breakGlassQuery,
  careTeamQuery,
  treatingWindowsQuery,
  STAFF_ROLE_TIER,
  type AccessBasis,
  type BreakGlassEvent,
  type CareTeamMember,
  type CareTier,
  type DataSharingAgreement,
  type TreatingWindowPolicy,
} from "@/lib/access";
import {
  consentGrantsQuery,
  facilitiesQuery,
  referralsQuery,
  type ConsentGrant,
  type Facility,
  type Referral,
} from "@/lib/api";
import { encountersQuery, type Encounter } from "@/lib/org";
import { useAuth } from "@/hooks/useAuth";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type AccessDecision = {
  /** The single basis this read resolves to. `none` means refused. */
  basis: AccessBasis;
  allowed: boolean;
  /** The reader's care tier, which bounds what they see even when allowed. */
  tier: CareTier | null;
  /** One sentence, patient-readable, naming the actual instrument relied on. */
  detail: string;
  /** When this basis lapses on its own, if it does. */
  expiresAt: string | null;
  grantId: string | null;
  agreementId: string | null;
  agreementRef: string | null;
  breakGlassId: string | null;
};

export type AccessActor = {
  role: string;
  providerId: string | null;
  facilityId: string | null;
  staffRole: string | null;
  tier: CareTier | null;
  /** Set only when the reader is themselves a patient. */
  ownPatientId: string | null;
};

export type AccessContext = {
  actor: AccessActor;
  careTeam: CareTeamMember[];
  encounters: Encounter[];
  facilities: Facility[];
  policies: TreatingWindowPolicy[];
  agreements: DataSharingAgreement[];
  grants: ConsentGrant[];
  referrals: Referral[];
  breakGlass: BreakGlassEvent[];
};

const REFUSED: AccessDecision = {
  basis: "none",
  allowed: false,
  tier: null,
  detail: "No treating relationship, agreement or consent covers this record.",
  expiresAt: null,
  grantId: null,
  agreementId: null,
  agreementRef: null,
  breakGlassId: null,
};

/**
 * Referral states that constitute the spec's "accepted referral" qualifying
 * event (§2.1). A referral that is merely routed to a clinician does NOT open
 * the record — accepting it is the act that puts them on the care team, which
 * is what makes "Accept consult" a real decision rather than a label change.
 */
const ACCEPTED_REFERRAL_STATUSES = new Set(["accepted", "in_progress", "scheduled", "completed"]);

const DEFAULT_WINDOW_DAYS = 90;

function isActive(status: string | null | undefined) {
  return status === "active" || status === "granted";
}

function notExpired(iso: string | null | undefined, now: number) {
  return !iso || new Date(iso).getTime() > now;
}

function dayjsish(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* ------------------------------------------------------------------ */
/* The index                                                           */
/* ------------------------------------------------------------------ */

/**
 * Builds the per-patient lookups once, then answers `decide(patientId)` in
 * roughly constant time. The clinician queue calls this for a few hundred
 * patients on every render, so resolution must not rescan the whole region
 * per row.
 */
export function buildAccessIndex(ctx: AccessContext) {
  const now = Date.now();
  const { actor } = ctx;

  const facilityById = new Map(ctx.facilities.map((f) => [f.id, f] as const));
  const policyByKind = new Map(ctx.policies.map((p) => [p.facility_kind, p] as const));

  const windowDaysFor = (facilityId: string | null) => {
    if (!facilityId) return DEFAULT_WINDOW_DAYS;
    const kind = facilityById.get(facilityId)?.kind ?? "clinic";
    return policyByKind.get(kind)?.days ?? DEFAULT_WINDOW_DAYS;
  };

  // --- care-team membership at the reader's own facility ---------------
  // Spec §4: "Facility employment alone is not membership."
  //
  // A row either names a provider — then only that provider is on the team —
  // or names none, in which case it is a team defined by function: the ward's
  // nursing team, the clinic's front desk. Those cover a reader working at that
  // tier and nobody else. Matching every unnamed row to every reader is how a
  // consultant cardiologist ended up on the care team of all 200 patients
  // registered at his hospital, which is precisely the claim §4 rejects.
  const careTeamByPatient = new Map<string, CareTeamMember>();
  for (const m of ctx.careTeam) {
    if (!actor.facilityId || m.facility_id !== actor.facilityId) continue;
    if (!notExpired(m.active_until, now)) continue;
    const named = m.provider_id ? m.provider_id === actor.providerId : m.tier === actor.tier;
    if (!named) continue;
    careTeamByPatient.set(m.patient_id, m);
  }

  // --- accepted referrals routed to this clinician ---------------------
  const acceptedReferralByPatient = new Map<string, Referral>();
  const pendingReferralByPatient = new Map<string, Referral>();
  for (const r of ctx.referrals) {
    if (!actor.providerId || r.to_provider_id !== actor.providerId) continue;
    if (ACCEPTED_REFERRAL_STATUSES.has(r.status)) acceptedReferralByPatient.set(r.patient_id, r);
    else pendingReferralByPatient.set(r.patient_id, r);
  }

  // --- most recent encounter per patient, per facility ------------------
  // Used both for the reader's own treating window and to establish that a DSA
  // counterparty actually holds an episode worth importing.
  const lastEncounterAtMyFacility = new Map<string, Encounter>();
  const encounterFacilitiesByPatient = new Map<string, Set<string>>();
  for (const e of ctx.encounters) {
    let set = encounterFacilitiesByPatient.get(e.patient_id);
    if (!set) encounterFacilitiesByPatient.set(e.patient_id, (set = new Set()));
    set.add(e.facility_id);

    if (!actor.facilityId || e.facility_id !== actor.facilityId) continue;
    const prev = lastEncounterAtMyFacility.get(e.patient_id);
    const at = e.ended_at ?? e.started_at;
    if (!prev || at > (prev.ended_at ?? prev.started_at))
      lastEncounterAtMyFacility.set(e.patient_id, e);
  }

  // --- DSAs that import into the reader's facility ----------------------
  const importingAgreements = ctx.agreements.filter(
    (a) =>
      actor.facilityId &&
      a.to_facility_id === actor.facilityId &&
      isActive(a.status) &&
      notExpired(a.expires_at, now),
  );

  // --- consent grants naming this clinician ------------------------------
  const grantByPatient = new Map<string, ConsentGrant>();
  for (const g of ctx.grants) {
    if (!actor.providerId || g.provider_id !== actor.providerId) continue;
    // The seed writes "granted" and the consent screen writes "active" for the
    // same state. Both mean the patient said yes.
    if (!isActive(g.status) || !notExpired(g.expires_at, now)) continue;
    grantByPatient.set(g.patient_id, g);
  }

  // --- live break-glass overrides taken by this reader --------------------
  const breakGlassByPatient = new Map<string, BreakGlassEvent>();
  for (const ev of ctx.breakGlass) {
    const mine =
      (actor.providerId && ev.provider_id === actor.providerId) ||
      (actor.facilityId && ev.facility_id === actor.facilityId);
    if (!mine || !notExpired(ev.expires_at, now)) continue;
    breakGlassByPatient.set(ev.patient_id, ev);
  }

  function decide(patientId: string): AccessDecision {
    // 1. self
    if (actor.ownPatientId && actor.ownPatientId === patientId) {
      return { ...REFUSED, basis: "self", allowed: true, detail: "You opened your own record." };
    }

    // Ministry and insurer never resolve to an identified basis. Spec §4 puts
    // them at "aggregate and de-identified only" — there is no branch of §7
    // that yields them a named chart, so they are refused here rather than
    // falling through the clinical bases and accidentally matching one.
    if (actor.role === "ministry" || actor.role === "insurer") {
      return {
        ...REFUSED,
        detail:
          actor.role === "ministry"
            ? "Ministry access is aggregate and de-identified only; it never resolves to a named record."
            : "Insurer access is limited to claims scope the patient has authorised.",
      };
    }

    const tier = actor.tier;

    // 3. active break-glass (2 is the sensitive-row gate, handled per-row by
    //    the chart itself; it cannot grant chart-level access on its own)
    const bg = breakGlassByPatient.get(patientId);
    if (bg) {
      return {
        basis: "break_glass",
        allowed: true,
        tier,
        detail: `Emergency override opened ${dayjsish(bg.started_at)} — expires in 24 hours and is under mandatory review.`,
        expiresAt: bg.expires_at,
        grantId: null,
        agreementId: null,
        agreementRef: null,
        breakGlassId: bg.id,
      };
    }

    /**
     * 4. A treating relationship at the reader's own facility.
     *
     * Three ways to have one, and the third is the one that makes this usable
     * in a real hospital: being on the care team, having accepted the referral,
     * or simply working where the patient is currently being treated.
     *
     * That third case used to be excluded, which was stricter than any hospital
     * actually runs. A consultant covering a colleague's ward at two in the
     * morning opens the chart and the audit log is the check — that is the norm
     * everywhere, and blocking it would not have made anyone safer. It would
     * have taught the night staff to break glass for routine work, and an
     * emergency override used routinely stops being an emergency override.
     *
     * So the strictness moves to where it earns its keep: crossing a facility
     * or a border still needs an agreement, a referral or the patient's
     * consent. Inside one building, the people treating you can read your
     * record, and every read is still written down.
     */
    const member = careTeamByPatient.get(patientId);
    const accepted = acceptedReferralByPatient.get(patientId);
    const here = lastEncounterAtMyFacility.get(patientId);
    if (member || accepted || here) {
      const encounter = here;
      const anchor = encounter
        ? new Date(encounter.ended_at ?? encounter.started_at).getTime()
        : accepted
          ? new Date(accepted.created_at).getTime()
          : new Date(member!.active_from).getTime();
      const days = windowDaysFor(actor.facilityId);
      const closesAt = anchor + days * 86_400_000;
      // An open episode (a booked teleconsult that has not happened yet) keeps
      // the window open regardless of the tail, otherwise a future appointment
      // would read as an expired past one.
      const openEpisode = encounter?.status === "open" || anchor > now;

      if (openEpisode || closesAt > now) {
        const memberTier =
          (member?.tier as CareTier | undefined) ?? (accepted ? "consulting" : null);
        return {
          basis: "treating",
          allowed: true,
          tier: memberTier ?? tier,
          detail: accepted
            ? `You accepted the ${accepted.specialty.toLowerCase()} referral raised ${dayjsish(accepted.created_at)}.`
            : member
              ? `You are on the care team at ${facilityById.get(actor.facilityId ?? "")?.name ?? "your facility"} for an episode opened ${dayjsish(member.active_from)}.`
              : `This patient is being treated at ${facilityById.get(actor.facilityId ?? "")?.name ?? "your facility"}, where you work. Clinical staff here can read the record while the episode is open; every read is logged and the patient can see it.`,
          expiresAt: new Date(closesAt).toISOString(),
          grantId: null,
          agreementId: null,
          agreementRef: null,
          breakGlassId: null,
        };
      }
    }

    // 5. active DSA covering the patient's originating facility
    const patientFacilities = encounterFacilitiesByPatient.get(patientId);
    if (patientFacilities) {
      for (const a of importingAgreements) {
        if (!patientFacilities.has(a.from_facility_id)) continue;
        return {
          basis: "institutional",
          allowed: true,
          tier,
          detail: `Covered by ${a.reference} — ${a.purpose}`,
          expiresAt: a.expires_at,
          grantId: null,
          agreementId: a.id,
          agreementRef: a.reference,
          breakGlassId: null,
        };
      }
    }

    // 6. active consent grant
    const grant = grantByPatient.get(patientId);
    if (grant) {
      return {
        basis: "consent",
        allowed: true,
        tier,
        detail: `The patient approved ${grant.scope.join(", ")} for ${grant.purpose} on ${dayjsish(grant.granted_at ?? grant.created_at)}.`,
        expiresAt: grant.expires_at,
        grantId: grant.id,
        agreementId: null,
        agreementRef: null,
        breakGlassId: null,
      };
    }

    // 7. refuse — but say what would fix it, since a pending referral is the
    //    most common reason a clinician is looking at all.
    const pending = pendingReferralByPatient.get(patientId);
    if (pending) {
      return {
        ...REFUSED,
        detail: `A ${pending.specialty.toLowerCase()} referral is waiting on you. Accepting it opens the record; until then there is no basis to read it.`,
      };
    }
    return REFUSED;
  }

  return { decide };
}

export type AccessIndex = ReturnType<typeof buildAccessIndex>;

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

/** Loads every row the resolver needs. Shared cache keys, so it loads once. */
export function useAccessIndex(): { index: AccessIndex; ready: boolean; actor: AccessActor } {
  const { profile, role } = useAuth();

  const careTeam = useQuery(careTeamQuery(null));
  const encounters = useQuery(encountersQuery(null));
  const facilities = useQuery(facilitiesQuery);
  const policies = useQuery(treatingWindowsQuery);
  const agreements = useQuery(agreementsQuery);
  const grants = useQuery(consentGrantsQuery);
  const referrals = useQuery(referralsQuery);
  const breakGlass = useQuery(breakGlassQuery(null));

  const actor = useMemo<AccessActor>(
    () => ({
      role,
      providerId: profile?.provider_id ?? null,
      facilityId: profile?.facility_id ?? null,
      staffRole: profile?.staff_role ?? null,
      tier: profile?.staff_role ? (STAFF_ROLE_TIER[profile.staff_role] ?? null) : null,
      ownPatientId: profile?.patient_id ?? null,
    }),
    [role, profile],
  );

  const ready =
    !careTeam.isLoading &&
    !encounters.isLoading &&
    !facilities.isLoading &&
    !policies.isLoading &&
    !agreements.isLoading &&
    !grants.isLoading &&
    !referrals.isLoading &&
    !breakGlass.isLoading;

  const index = useMemo(
    () =>
      buildAccessIndex({
        actor,
        careTeam: careTeam.data ?? [],
        encounters: encounters.data ?? [],
        facilities: facilities.data ?? [],
        policies: policies.data ?? [],
        agreements: agreements.data ?? [],
        grants: grants.data ?? [],
        referrals: referrals.data ?? [],
        breakGlass: breakGlass.data ?? [],
      }),
    [
      actor,
      careTeam.data,
      encounters.data,
      facilities.data,
      policies.data,
      agreements.data,
      grants.data,
      referrals.data,
      breakGlass.data,
    ],
  );

  return { index, ready, actor };
}

/** The decision for one patient. `null` while the underlying rows are loading. */
export function useAccessDecision(patientId: string | null | undefined): AccessDecision | null {
  const { index, ready } = useAccessIndex();
  return useMemo(
    () => (ready && patientId ? index.decide(patientId) : null),
    [index, ready, patientId],
  );
}
