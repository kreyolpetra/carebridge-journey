import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Hospital, Share2, Users, ChevronRight, ArrowUpRight } from "lucide-react";
import {
  facilitiesQuery,
  patientsQuery,
  providersQuery,
  riskScoresQuery,
  islandsQuery,
} from "@/lib/api";
import {
  encountersQuery,
  facilityStaffQuery,
  ENCOUNTER_KIND_LABEL,
  STAFF_ROLE_LABEL,
} from "@/lib/org";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InpatientsPanel } from "@/components/facility/InpatientsPanel";
import { StaffSeat } from "@/components/facility/StaffSeat";
import { PendingStaff } from "@/components/facility/PendingStaff";
import { useScope } from "@/hooks/useScope";
import { mayConfirmStaff } from "@/lib/access";
import { RegistryPage } from "@/components/facility/Registry";
import { Panel, PanelHeader, Pill, Stat, Loading } from "@/components/grid";
import { bandClasses, shortDate, timeAgo } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { logRecordAccess } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/facility")({
  head: () => ({
    meta: [
      { title: "Facility Console — Hospital & Clinic Records | CareBridge Journey" },
      {
        name: "description",
        content:
          "Run your hospital or clinic on CareBridge: patients seen at your facility, records shared in from other hospitals and clinics, staff roster and open encounters.",
      },
      { property: "og:title", content: "Facility Console — CareBridge Journey" },
      {
        property: "og:description",
        content: "One record per patient across every hospital and clinic on CareBridge.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FacilityConsole,
});

function FacilityConsole() {
  const { profile } = useAuth();
  const facilities = useQuery(facilitiesQuery);
  const islands = useQuery(islandsQuery);
  const encounters = useQuery(encountersQuery());
  const patients = useQuery(patientsQuery);
  const providers = useQuery(providersQuery);
  const risks = useQuery(riskScoresQuery);
  const staff = useQuery(facilityStaffQuery);
  const { tier } = useScope();
  const [picked, setPicked] = useState<string | null>(null);

  const facilityList = (facilities.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const facilityId = picked ?? profile?.facility_id ?? facilityList[0]?.id ?? null;
  const facility = facilityList.find((f) => f.id === facilityId) ?? null;

  const view = useMemo(() => {
    const all = encounters.data ?? [];
    if (!facilityId) return null;
    const mine = all.filter((e) => e.facility_id === facilityId);
    const myPatientIds = new Set(mine.map((e) => e.patient_id));
    const shared = all.filter(
      (e) => e.facility_id !== facilityId && myPatientIds.has(e.patient_id),
    );
    const sharedFacilities = new Set(shared.map((e) => e.facility_id));
    return { mine, myPatientIds, shared, sharedFacilities };
  }, [encounters.data, facilityId]);

  const qc = useQueryClient();
  const sharedPatientIds = useMemo(
    () => [...new Set((view?.shared ?? []).map((e) => e.patient_id))].slice(0, 12).join(","),
    [view],
  );

  // Records shared in automatically from another facility on CareBridge are still a
  // third-party read — write each one to the patient's consent access log.
  useEffect(() => {
    if (!sharedPatientIds || !profile || !facility) return;
    const ids = sharedPatientIds.split(",").filter(Boolean);
    let wrote = false;
    for (const pid of ids) {
      const key = `carebridge:access:${profile.id}:${pid}:shared:${facility.id}`;
      if (sessionStorage.getItem(key)) continue;
      sessionStorage.setItem(key, "1");
      wrote = true;
      void logRecordAccess({
        patientId: pid,
        providerId: profile.provider_id ?? null,
        facilityId: facility.id,
        resource: `Shared record viewed by ${facility.name}`,
        basis: "institutional",
        tier: profile.staff_role ?? null,
        actorName: profile.full_name,
      });
    }
    if (wrote) void qc.invalidateQueries({ queryKey: ["access_log"] });
  }, [sharedPatientIds, profile, facility, qc]);

  if (facilities.isLoading || encounters.isLoading || !view || !facility)
    return (
      <div className="mx-auto w-full max-w-[1500px] px-5 py-8">
        <Loading label="Loading facility" />
      </div>
    );

  const patientById = new Map((patients.data ?? []).map((p) => [p.id, p]));
  const facilityById = new Map(facilityList.map((f) => [f.id, f]));
  const providerById = new Map((providers.data ?? []).map((p) => [p.id, p]));
  const riskById = new Map((risks.data ?? []).map((r) => [r.patient_id, r]));
  const islandName = (code?: string) =>
    (islands.data ?? []).find((i) => i.code === code)?.name ?? code ?? "";

  const roster = [...view.myPatientIds]
    .map((pid) => {
      const mine = view.mine.filter((e) => e.patient_id === pid);
      const elsewhere = new Set(
        view.shared.filter((e) => e.patient_id === pid).map((e) => e.facility_id),
      );
      const last = mine[0];
      return { pid, visits: mine.length, elsewhere, last, risk: riskById.get(pid) };
    })
    .sort((a, b) => (b.risk?.score ?? 0) - (a.risk?.score ?? 0));

  const openEncounters = view.mine.filter((e) => e.status === "open");
  const myStaff = (staff.data ?? []).filter((s) => s.facility_id === facilityId);

  // Roster and record-intake used to be their own nav entries. They are the same
  // job as this screen — administering one institution's records — so they are
  // tabs here now. The tier gating they carried in the sidebar has to come with
  // them, or the merge would quietly hand a ward nurse a bulk patient export.
  const canAdminister = tier === "attending" || tier === "org_admin";

  // An administrator who is only a name on the roster has never signed in and
  // cannot approve anything, so they do not count as cover. The rule itself
  // lives in lib/access.ts with the other access rules, and is tested there.
  const hasJoinedAdmin = myStaff.some((m) => m.staff_role === "org_admin" && m.user_id);
  const canConfirmStaff = mayConfirmStaff(tier, hasJoinedAdmin);

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-8">
      <Tabs defaultValue="console">
        <TabsList>
          <TabsTrigger value="console">Console</TabsTrigger>
          {canAdminister ? <TabsTrigger value="roster">Roster &amp; import</TabsTrigger> : null}
          {/* "Records & API" is withdrawn. Opening it hard-freezes the main
              thread in the production bundle — proven with a heartbeat timer
              that stops dead on the click and never resumes. It predates the
              current work and the cause is not yet found, so the surface is
              withdrawn rather than shipped: a demo that locks the browser is
              worse than a missing tab.

              Nothing is lost from the demo. Digitising a paper record moved
              into the patient chart, where it belongs and where it works. */}
        </TabsList>

        <TabsContent value="console" className="mt-4 space-y-4">
          {/* Only appears where there are beds — the first surface in the
              product that exists for one kind of facility and not another. */}
          <InpatientsPanel facility={facility} />
          <Panel>
            <PanelHeader
              title={
                <span className="flex items-center gap-2">
                  {facility.kind === "hospital" ? (
                    <Hospital className="h-4.5 w-4.5 text-primary" />
                  ) : (
                    <Building2 className="h-4.5 w-4.5 text-primary" />
                  )}
                  {facility.name}
                </span>
              }
              subtitle={`${islandName(facility.island_code)} · ${facility.kind} · ${facility.beds_occupied}/${facility.beds_total} beds occupied`}
              right={
                <select
                  value={facilityId ?? ""}
                  onChange={(e) => setPicked(e.target.value)}
                  className="h-9 max-w-[280px] rounded-md border border-input bg-background px-3 text-[13px]"
                  aria-label="Switch facility"
                >
                  {facilityList.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              }
            />
            <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Patients on file here"
                value={view.myPatientIds.size}
                hint="Seen at this facility"
              />
              <Stat
                label="Open encounters"
                value={openEncounters.length}
                hint="Currently in care"
                tone="signal"
              />
              <Stat
                label="Records shared in"
                value={view.shared.length}
                hint={`From ${view.sharedFacilities.size} other facilit${view.sharedFacilities.size === 1 ? "y" : "ies"}`}
                tone="signal"
              />
              <Stat
                label="Staff on CareBridge"
                value={myStaff.length}
                hint="Doctors, nurses and admin"
              />
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
            <Panel>
              <PanelHeader
                title="Patients seen here"
                subtitle="Risk-ranked. A shared badge means another hospital or clinic also holds part of this record."
              />
              <div className="divide-y divide-border">
                {roster.length === 0 ? (
                  <p className="px-5 py-6 text-[13px] text-muted-foreground">
                    No encounters recorded at this facility.
                  </p>
                ) : (
                  roster.slice(0, 40).map((r) => {
                    const p = patientById.get(r.pid);
                    return (
                      <Link
                        key={r.pid}
                        to="/clinician"
                        search={{ patient: r.pid }}
                        className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-semibold">
                            {p?.full_name ?? "Unknown patient"}
                          </p>
                          <p className="mt-0.5 text-[12px] text-muted-foreground">
                            {r.visits} visit{r.visits === 1 ? "" : "s"} here · last{" "}
                            {r.last ? timeAgo(r.last.started_at) : "—"}
                            {p ? ` · ${p.age}y · ${p.parish}` : ""}
                          </p>
                        </div>
                        {r.elsewhere.size > 0 ? (
                          <Pill className="border-primary/30 bg-primary/10 text-primary">
                            <Share2 className="h-3 w-3" /> +{r.elsewhere.size} facilit
                            {r.elsewhere.size === 1 ? "y" : "ies"}
                          </Pill>
                        ) : null}
                        {r.risk ? (
                          <Pill className={bandClasses(r.risk.band)}>{r.risk.score}</Pill>
                        ) : null}
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </Link>
                    );
                  })
                )}
              </div>
            </Panel>

            <div className="space-y-4">
              <Panel>
                <PanelHeader
                  title="Shared in from other facilities"
                  subtitle="Care your patients received elsewhere on CareBridge — visible to your team automatically"
                />
                <div className="divide-y divide-border">
                  {view.shared.length === 0 ? (
                    <p className="px-5 py-6 text-[13px] text-muted-foreground">
                      Nothing shared in yet. As soon as one of your patients is seen at another
                      facility on CareBridge, it lands here.
                    </p>
                  ) : (
                    view.shared.slice(0, 12).map((e) => (
                      <div key={e.id} className="px-5 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate text-[13.5px] font-semibold">
                            {patientById.get(e.patient_id)?.full_name ?? "Patient"}
                          </span>
                          <Pill className="border-border bg-surface text-muted-foreground">
                            {ENCOUNTER_KIND_LABEL[e.kind] ?? e.kind}
                          </Pill>
                        </div>
                        <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                          <ArrowUpRight className="h-3.5 w-3.5" />
                          {facilityById.get(e.facility_id)?.name ?? "Another facility"} ·{" "}
                          {shortDate(e.started_at)}
                        </p>
                        {e.reason ? <p className="mt-1 text-[12.5px]">{e.reason}</p> : null}
                        {e.summary ? (
                          <p className="mt-1 text-[12.5px] text-muted-foreground">{e.summary}</p>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </Panel>

              <Panel>
                <PanelHeader
                  title="Staff roster"
                  subtitle="Who at this facility can open a record on CareBridge"
                  right={<Users className="h-4 w-4 text-muted-foreground" />}
                />
                <div className="divide-y divide-border">
                  {myStaff.length === 0 ? (
                    <p className="px-5 py-6 text-[13px] text-muted-foreground">
                      No CareBridge accounts registered to this facility yet.
                    </p>
                  ) : (
                    myStaff.map((s) => (
                      <StaffSeat
                        key={s.id}
                        seat={s}
                        displayName={
                          s.user_id === profile?.id
                            ? (profile.full_name ?? "You")
                            : (s.full_name ?? s.title ?? "CareBridge account")
                        }
                        // Withdrawing access is the same decision as granting
                        // it, so it answers to the same rule.
                        canRemove={canConfirmStaff && s.user_id !== profile?.id}
                        isSelf={s.user_id === profile?.id}
                      />
                    ))
                  )}
                </div>
              </Panel>

              <Panel>
                <PanelHeader
                  title="Providers based here"
                  subtitle="Clinical capacity attached to this facility"
                />
                <div className="divide-y divide-border">
                  {[...providerById.values()]
                    .filter((p) => p.facility_id === facilityId)
                    .slice(0, 8)
                    .map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <span className="truncate text-[13.5px] font-semibold">{p.full_name}</span>
                        <span className="text-[12px] text-muted-foreground">{p.specialty}</span>
                      </div>
                    ))}
                </div>
              </Panel>
            </div>
          </div>
        </TabsContent>

        {canAdminister ? (
          <TabsContent value="roster" className="mt-4 space-y-4">
            {/* The confirmation step the verification gate always implied and
                nothing could actually perform. */}
            <PendingStaff facilityId={facilityId} canConfirm={canConfirmStaff} />
            <RegistryPage />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
