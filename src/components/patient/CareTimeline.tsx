/**
 * The longitudinal record — every visit this patient has had anywhere on the
 * Grid, assembled across hospitals, clinics and borders.
 *
 * This is the thing the product leads with and the one thing the clinician's
 * chart did not show. The patient could already see it on their own record
 * (CareNetwork plus VisitDialog); the consultant about to run their teleconsult
 * could not, and had to infer a history from a risk score.
 *
 * How much of each visit is readable follows the care tiers in
 * docs/access-control-spec.md §4. Knowing that a hospital saw someone and
 * reading what its doctor wrote are different disclosures, so they are gated
 * differently: an attending carries the longitudinal history, a consulting
 * specialist works the current episode and sees the rest in summary, and the
 * front desk learns only that an appointment happened.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Hospital, Lock, ShieldAlert, ScanLine, Keyboard } from "lucide-react";
import { facilitiesQuery, islandsQuery, providersQuery, type PatientBundle } from "@/lib/api";
import { encountersQuery, ENCOUNTER_KIND_LABEL, type Encounter } from "@/lib/org";
import { agreementsQuery, SENSITIVE_LABEL, TIER_LABEL, type CareTier } from "@/lib/access";
import type { AccessDecision } from "@/lib/access-basis";
import { useScope } from "@/hooks/useScope";
import { VisitDetailDialog } from "@/components/patient/VisitDetailDialog";
import { DocumentDetailDialog } from "@/components/patient/DocumentDetailDialog";
import { documentsQuery, type ClinicalDocument } from "@/lib/prevention";
import { Panel, PanelHeader, Pill } from "@/components/grid";
import { shortDate, timeAgo } from "@/lib/format";

/** How much of one visit this reader may see. */
type Disclosure = "full" | "summary" | "existence";

/**
 * Spec §4, applied per visit rather than per chart.
 *
 * "Current episode" is read generously as an open episode anywhere, or anything
 * recorded at the reader's own facility — a consulting cardiologist reviewing a
 * referral needs the episode that produced it, wherever it is still running.
 */
function disclosureFor(
  tier: CareTier | null,
  encounter: Encounter,
  actorFacilityId: string | null,
  /** Facilities whose encounter summaries an active agreement lets us import. */
  agreementFacilities: Set<string>,
): Disclosure {
  if (tier === "front_desk" || tier === "org_admin") return "existence";
  if (tier === "attending") return "full";

  const ownFacility = !!actorFacilityId && encounter.facility_id === actorFacilityId;
  const currentEpisode = encounter.status === "open" || ownFacility;
  // Spec §1.2: what a data-sharing agreement covers is set by its declared data
  // scope, not by the reader's tier. An agreement that names "encounter
  // summaries" is the instrument that lets a receiving consultant read the
  // referring hospital's note — without it, a cardiologist taking a referral
  // could not read the A&E workup that caused it, which is the exact handover
  // these pipelines exist to make possible.
  const underAgreement = agreementFacilities.has(encounter.facility_id);

  if (tier === "consulting" || tier === "nursing")
    return currentEpisode || underAgreement ? "full" : "summary";
  // Allied health works its own order stream; a ward round elsewhere is not it.
  if (tier === "allied") return ownFacility ? "full" : "summary";
  return "summary";
}

const DISCLOSURE_NOTE: Record<CareTier, string> = {
  attending: "You hold the longitudinal record: notes from every facility on the Grid.",
  consulting:
    "Current episodes and facilities you hold an agreement with in full; other visits in summary.",
  nursing: "Current episodes in full; earlier visits elsewhere appear in summary.",
  allied: "Your own facility's visits in full; the rest in summary.",
  front_desk: "Appointment history only — no clinical content.",
  org_admin: "Appointment history only — no clinical content.",
};

export function CareTimeline({
  patientId,
  decision,
  grantedCategories,
  bundle,
}: {
  patientId: string;
  decision: AccessDecision | null;
  /** Sensitive categories the patient has granted, from the chart's own gate. */
  grantedCategories: Set<string>;
  /** Already loaded by the chart; used for a visit's readings and referral. */
  bundle: PatientBundle;
}) {
  const [openVisit, setOpenVisit] = useState<Encounter | null>(null);
  const [openDoc, setOpenDoc] = useState<ClinicalDocument | null>(null);
  const { facilityId } = useScope();
  const encounters = useQuery(encountersQuery(patientId));
  const documents = useQuery(documentsQuery);
  const agreements = useQuery(agreementsQuery);
  const facilities = useQuery(facilitiesQuery);
  const islands = useQuery(islandsQuery);
  const providers = useQuery(providersQuery);

  const tier = decision?.tier ?? null;

  const agreementFacilities = useMemo(() => {
    const now = Date.now();
    const set = new Set<string>();
    for (const a of agreements.data ?? []) {
      if (a.to_facility_id !== facilityId) continue;
      if (a.status !== "active") continue;
      if (a.expires_at && new Date(a.expires_at).getTime() <= now) continue;
      if (!a.scope.includes("encounter summaries")) continue;
      set.add(a.from_facility_id);
    }
    return set;
  }, [agreements.data, facilityId]);
  const facilityById = useMemo(
    () => new Map((facilities.data ?? []).map((f) => [f.id, f] as const)),
    [facilities.data],
  );
  const islandName = (code?: string) =>
    (islands.data ?? []).find((i) => i.code === code)?.name ?? code ?? "";
  const providerName = (id: string | null) =>
    (providers.data ?? []).find((p) => p.id === id)?.full_name ?? null;

  /**
   * Visits and paper records in one list, newest first.
   *
   * Keeping them apart split the history by where it came from rather than
   * when it happened, so answering "what do we know about this patient" meant
   * reading two lists and interleaving them by eye.
   *
   * The date a paper record sorts on is the day it was captured, not the day
   * the care in it happened — a clinic card covering 2019-2025 has no single
   * clinical date, and only the capture is a fact we hold. Each such row is
   * therefore labelled "captured", so it never reads as a visit that just
   * occurred.
   */
  const docRows = useMemo(
    () => (documents.data ?? []).filter((d) => d.patient_id === patientId),
    [documents.data, patientId],
  );

  const encounterRows = useMemo(
    () =>
      [...(encounters.data ?? [])].sort(
        (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
      ),
    [encounters.data],
  );

  type Row =
    | { kind: "encounter"; at: string; e: Encounter }
    | { kind: "document"; at: string; d: ClinicalDocument };

  const rows: Row[] = useMemo(() => {
    const merged: Row[] = [
      ...encounterRows.map((e) => ({ kind: "encounter" as const, at: e.started_at, e })),
      ...docRows.map((d) => ({ kind: "document" as const, at: d.created_at, d })),
    ];
    return merged.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [encounterRows, docRows]);

  // Reading a document's contents is a clinical disclosure, so the tiers that
  // only ever learn that an appointment happened do not get to read a card.
  const canReadDocs = tier !== "front_desk" && tier !== "org_admin";

  // Care network: which institutions hold part of this record.
  const network = useMemo(() => {
    const grouped = new Map<string, { count: number; last: string }>();
    for (const e of encounterRows) {
      const g = grouped.get(e.facility_id) ?? { count: 0, last: e.started_at };
      g.count += 1;
      if (new Date(e.started_at) > new Date(g.last)) g.last = e.started_at;
      grouped.set(e.facility_id, g);
    }
    return [...grouped.entries()].sort(
      (a, b) => new Date(b[1].last).getTime() - new Date(a[1].last).getTime(),
    );
  }, [encounterRows]);

  const countries = new Set(
    network.map(([id]) => facilityById.get(id)?.island_code).filter(Boolean),
  );

  if (!rows.length) {
    return (
      <Panel>
        <PanelHeader title="Care history" subtitle="Visits recorded anywhere on the Grid" />
        <p className="px-5 py-6 text-[13px] text-muted-foreground">
          No visits recorded yet. This patient's history begins here.
        </p>
      </Panel>
    );
  }

  return (
    <>
      <Panel>
        <PanelHeader
          title="Care network"
          subtitle={
            countries.size > 1
              ? `${network.length} facilities across ${countries.size} countries hold part of this record — all reading the same one`
              : `${network.length} ${network.length === 1 ? "facility holds" : "facilities hold"} part of this record`
          }
        />
        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {network.map(([id, g]) => {
            const f = facilityById.get(id);
            const mine = id === facilityId;
            return (
              <div
                key={id}
                className={
                  "rounded-lg border p-3 " +
                  (mine ? "border-primary/40 bg-primary/5" : "border-border bg-surface")
                }
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 text-muted-foreground">
                    {f?.kind === "hospital" ? (
                      <Hospital className="h-3.5 w-3.5" />
                    ) : (
                      <Building2 className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold">{f?.name ?? "Facility"}</p>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {islandName(f?.island_code)} · {g.count} {g.count === 1 ? "visit" : "visits"}{" "}
                      · last {timeAgo(g.last)}
                    </p>
                  </div>
                </div>
                {mine ? (
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-primary">
                    Your facility
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="Care history"
          subtitle={
            docRows.length
              ? `${encounterRows.length} ${encounterRows.length === 1 ? "visit" : "visits"} and ${docRows.length} paper ${docRows.length === 1 ? "record" : "records"}, newest first`
              : `${encounterRows.length} visits recorded across the Grid, newest first`
          }
          right={
            tier ? (
              <Pill className="border-border bg-surface text-muted-foreground">
                {TIER_LABEL[tier]}
              </Pill>
            ) : null
          }
        />
        {tier ? (
          <p className="border-b border-border bg-surface px-5 py-2.5 text-[12px] text-muted-foreground">
            {DISCLOSURE_NOTE[tier]}
          </p>
        ) : null}
        <ol className="max-h-[520px] divide-y divide-border overflow-y-auto">
          {rows.map((row) => {
            if (row.kind === "document") {
              const d = row.d;
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => setOpenDoc(d)}
                    className="w-full px-5 py-3.5 text-left transition-colors hover:bg-surface"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                        {d.source === "paper_scan" ? (
                          <ScanLine className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <Keyboard className="h-3.5 w-3.5 text-primary" />
                        )}
                        {d.title}
                      </span>
                      <Pill className="border-border bg-surface text-muted-foreground">
                        paper record
                      </Pill>
                      <Pill
                        className={
                          d.committed
                            ? "border-low/40 bg-low/10 text-low"
                            : "border-high/40 bg-high/10 text-high"
                        }
                      >
                        {d.committed ? "in the chart" : "stored only"}
                      </Pill>
                      {/* "captured", not the date of the care described — see
                          the note on the merged list above. */}
                      <span className="ml-auto text-[11.5px] text-muted-foreground">
                        captured {shortDate(d.created_at)}
                      </span>
                    </div>
                    {canReadDocs ? (
                      <p className="mt-1.5 line-clamp-2 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
                        {d.original_text || "Photograph held, no transcription captured."}
                      </p>
                    ) : (
                      <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-muted-foreground">
                        <Lock className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>Document on file. Its contents sit outside your scope.</span>
                      </p>
                    )}
                    <p className="mt-1 text-[11.5px] text-muted-foreground">
                      {d.source === "paper_scan" ? "Photographed" : "Typed"} by {d.uploaded_by}
                    </p>
                  </button>
                </li>
              );
            }

            const e = row.e;
            const f = facilityById.get(e.facility_id);
            const mine = e.facility_id === facilityId;
            const sensitivity = (e as { sensitivity?: string }).sensitivity;
            const restricted =
              !!sensitivity && sensitivity !== "standard" && !grantedCategories.has(sensitivity);
            const level: Disclosure = restricted
              ? "existence"
              : disclosureFor(tier, e, facilityId, agreementFacilities);
            const clinician = providerName(e.provider_id);

            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setOpenVisit(e)}
                  className="w-full px-5 py-3.5 text-left transition-colors hover:bg-surface"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold">
                      {f?.name ?? "Facility"}
                      {f?.island_code ? (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · {f.island_code}
                        </span>
                      ) : null}
                    </span>
                    {mine ? (
                      <Pill className="border-primary/30 bg-primary/10 text-primary">
                        your facility
                      </Pill>
                    ) : null}
                    <Pill className="border-border bg-surface text-muted-foreground">
                      {ENCOUNTER_KIND_LABEL[e.kind] ?? e.kind}
                    </Pill>
                    {e.status === "open" ? (
                      <Pill className="border-signal/30 bg-signal/10 text-signal">open</Pill>
                    ) : null}
                    <span className="ml-auto text-[11.5px] text-muted-foreground">
                      {shortDate(e.started_at)}
                      {e.ended_at ? ` — ${shortDate(e.ended_at)}` : ""}
                    </span>
                  </div>

                  {level === "existence" ? (
                    <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-muted-foreground">
                      {restricted ? (
                        <>
                          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-high" />
                          <span>
                            Restricted entry —{" "}
                            {SENSITIVE_LABEL[sensitivity ?? ""] ?? "sensitive category"}. The visit
                            is shown so the record does not look complete; its content needs the
                            patient's explicit grant.
                          </span>
                        </>
                      ) : (
                        <span>Clinical appointment.</span>
                      )}
                    </p>
                  ) : (
                    <>
                      <p className="mt-1.5 text-[13px]">{e.reason}</p>
                      {level === "full" ? (
                        <>
                          {e.summary ? (
                            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                              {e.summary}
                            </p>
                          ) : (
                            <p className="mt-1 text-[12.5px] italic text-muted-foreground">
                              No note recorded yet.
                            </p>
                          )}
                          <p className="mt-1 text-[11.5px] text-muted-foreground">
                            {clinician ? `Seen by ${clinician}` : null}
                            {clinician && !mine && agreementFacilities.has(e.facility_id)
                              ? " · "
                              : null}
                            {!mine && agreementFacilities.has(e.facility_id)
                              ? "note shared under a data-sharing agreement"
                              : null}
                          </p>
                        </>
                      ) : (
                        <p className="mt-1 flex items-start gap-1.5 text-[12px] text-muted-foreground">
                          <Lock className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>
                            The note is held at {f?.name ?? "the treating facility"} and sits
                            outside your scope
                            {tier ? ` as ${TIER_LABEL[tier].toLowerCase()}` : ""}. Request it from
                            them, or ask the patient to grant it.
                          </span>
                        </p>
                      )}
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </Panel>

      {openDoc ? (
        <DocumentDetailDialog
          doc={openDoc}
          canRead={canReadDocs}
          onOpenChange={(open) => !open && setOpenDoc(null)}
        />
      ) : null}

      {openVisit
        ? (() => {
            const sensitivity = (openVisit as { sensitivity?: string }).sensitivity;
            const restricted =
              !!sensitivity && sensitivity !== "standard" && !grantedCategories.has(sensitivity);
            return (
              <VisitDetailDialog
                encounter={openVisit}
                onOpenChange={(open) => !open && setOpenVisit(null)}
                facility={facilityById.get(openVisit.facility_id)}
                islandName={islandName(facilityById.get(openVisit.facility_id)?.island_code)}
                clinician={providerName(openVisit.provider_id)}
                // Resolved the same way as the row it was opened from, so a
                // dialog can never show more than the timeline promised.
                disclosure={
                  restricted
                    ? "existence"
                    : disclosureFor(tier, openVisit, facilityId, agreementFacilities)
                }
                restricted={restricted}
                sensitivity={sensitivity}
                tier={tier}
                vitals={bundle.vitals}
                referrals={bundle.referrals}
                consultations={bundle.consultations}
                sharedUnderAgreement={
                  openVisit.facility_id !== facilityId &&
                  agreementFacilities.has(openVisit.facility_id)
                }
              />
            );
          })()
        : null}
    </>
  );
}
