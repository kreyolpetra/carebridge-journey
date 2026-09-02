import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Eye, ShieldAlert, Building2, Clock } from "lucide-react";
import { accessLogQuery, facilitiesQuery, patientsQuery, providersQuery } from "@/lib/api";
import { encountersQuery } from "@/lib/org";
import {
  BASIS_BLURB,
  BASIS_LABEL,
  BASIS_TONE,
  SENSITIVE_LABEL,
  TIER_LABEL,
  breakGlassQuery,
  resolveTreatingWindows,
  treatingWindowsQuery,
  type AccessBasis,
} from "@/lib/access";
import { Panel, PanelHeader, Pill, SectionTitle, Stat } from "@/components/grid";
import { timeAgo } from "@/lib/format";
import { useScope } from "@/hooks/useScope";

export const Route = createFileRoute("/_authenticated/access-log")({
  head: () => ({
    meta: [
      { title: "Who Has Looked at My Record — Access Transparency | CariCare Grid" },
      {
        name: "description",
        content:
          "A patient-facing log of every read of your health record — who opened it, when, from which facility, and the lawful basis they used.",
      },
      { property: "og:title", content: "Who Has Looked at My Record" },
      {
        property: "og:description",
        content: "Transparency, not permission: every access is shown, consented or not.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AccessLog,
});

const BASES: AccessBasis[] = ["treating", "institutional", "consent", "break_glass"];

function AccessLog() {
  const { isPatient, patientId } = useScope();
  const log = useQuery(accessLogQuery);
  const patients = useQuery(patientsQuery);
  const providers = useQuery(providersQuery);
  const facilities = useQuery(facilitiesQuery);
  const encounters = useQuery(encountersQuery(patientId ?? undefined));
  const policies = useQuery(treatingWindowsQuery);
  const breakGlass = useQuery(breakGlassQuery(patientId));
  const [filter, setFilter] = useState<"all" | AccessBasis>("all");

  const pname = (id: string) => patients.data?.find((p) => p.id === id)?.full_name ?? "Patient";
  const provname = (id: string | null) => providers.data?.find((p) => p.id === id)?.full_name ?? null;
  const facname = (id: string | null) => facilities.data?.find((f) => f.id === id)?.name ?? null;

  const rows = useMemo(() => {
    const scoped = (log.data ?? []).filter((r) => (patientId ? r.patient_id === patientId : true));
    return filter === "all" ? scoped : scoped.filter((r) => (r.basis as AccessBasis) === filter);
  }, [log.data, patientId, filter]);

  const scopedAll = (log.data ?? []).filter((r) => (patientId ? r.patient_id === patientId : true));
  const count = (b: AccessBasis) => scopedAll.filter((r) => r.basis === b).length;

  const windows = useMemo(
    () => resolveTreatingWindows(encounters.data ?? [], facilities.data ?? [], policies.data ?? []),
    [encounters.data, facilities.data, policies.data],
  );
  const openWindows = windows.filter((w) => w.open);

  const last30 = scopedAll.filter(
    (r) => Date.now() - new Date(r.accessed_at).getTime() < 30 * 86_400_000,
  ).length;

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-8">
      <SectionTitle
        eyebrow="Transparency"
        title={isPatient ? "Who has looked at my record" : "Record access transparency"}
        blurb={
          isPatient
            ? "This is not a permission screen — it is the receipt. Every read of your record is listed here, whether you approved it, a facility treating you took it, two hospitals exchanged it under a signed agreement, or someone broke the glass in an emergency."
            : "Every read of every chart, with the lawful basis it was taken under. Patients see their own copy of this list in full."
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Reads logged" value={scopedAll.length} hint={`${last30} in the last 30 days`} tone="signal" />
        <Stat label="Facilities treating you" value={openWindows.length} hint="Open access windows" />
        <Stat label="You approved" value={count("consent")} hint="Consent grants used" tone="low" />
        <Stat
          label="Emergency overrides"
          value={(breakGlass.data ?? []).length}
          hint="Break-glass, all reviewed"
          tone={(breakGlass.data ?? []).length ? "critical" : "default"}
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", ...BASES] as const).map((b) => (
          <button
            key={b}
            onClick={() => setFilter(b)}
            className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold ${
              filter === b ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {b === "all" ? `All (${scopedAll.length})` : `${BASIS_LABEL[b]} (${count(b)})`}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Panel>
          <PanelHeader
            title="Access history"
            subtitle="Newest first · each entry names the person, the facility, the data and the basis"
          />
          <div className="max-h-[720px] divide-y divide-border overflow-y-auto">
            {rows.map((row) => {
              const basis = (row.basis as AccessBasis) ?? "treating";
              return (
                <div key={row.id} className="flex items-start justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold">
                      {row.actor_name ?? provname(row.provider_id) ?? "Care team member"}
                      {row.tier ? (
                        <span className="ml-2 text-[11.5px] font-normal text-muted-foreground">
                          {TIER_LABEL[row.tier as keyof typeof TIER_LABEL] ?? row.tier}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[12px] text-muted-foreground">
                      {facname(row.facility_id) ?? "Facility not recorded"} · {row.resource}
                      {isPatient ? "" : ` · ${pname(row.patient_id)}`}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Pill className={BASIS_TONE[basis]}>{BASIS_LABEL[basis]}</Pill>
                      {row.sensitive_category ? (
                        <Pill className="border-high/40 bg-high/10 text-high">
                          {SENSITIVE_LABEL[row.sensitive_category] ?? row.sensitive_category}
                        </Pill>
                      ) : null}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={row.allowed ? "text-[11.5px] text-low" : "text-[11.5px] text-critical"}>
                      {row.allowed ? "allowed" : "blocked"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{timeAgo(row.accessed_at)}</div>
                  </div>
                </div>
              );
            })}
            {!rows.length ? (
              <p className="p-5 text-[13px] text-muted-foreground">Nothing logged under this basis yet.</p>
            ) : null}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Facilities that can read your chart right now" subtitle="Treating access is time-bound and closes on its own" />
            <div className="divide-y divide-border">
              {windows.slice(0, 6).map((w) => (
                <div key={w.facilityId} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[13px] font-semibold">{w.facilityName}</div>
                    <Pill className={w.open ? "border-low/40 bg-low/10 text-low" : "border-border bg-surface text-muted-foreground"}>
                      {w.open ? "open" : "closed"}
                    </Pill>
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                    <Building2 className="mr-1 inline h-3 w-3" />
                    {w.islandCode} · {w.policyLabel} · {w.days}-day window
                  </div>
                  <div className="text-[11.5px] text-muted-foreground">
                    <Clock className="mr-1 inline h-3 w-3" />
                    last visit {timeAgo(w.lastEventAt)} · {w.open ? "closes" : "closed"}{" "}
                    {new Date(w.closesAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
              {!windows.length ? (
                <p className="p-5 text-[13px] text-muted-foreground">No treating relationships on record.</p>
              ) : null}
            </div>
          </Panel>

          {(breakGlass.data ?? []).length ? (
            <Panel>
              <PanelHeader title="Emergency overrides" subtitle="Taken without approval · you were notified · reviewed by governance" />
              <div className="divide-y divide-border">
                {(breakGlass.data ?? []).map((b) => (
                  <div key={b.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[13px] font-semibold">
                        <ShieldAlert className="mr-1 inline h-3.5 w-3.5 text-critical" />
                        {b.actor_name || "Clinician"}
                      </div>
                      <Pill
                        className={
                          b.review_status === "cleared"
                            ? "border-low/40 bg-low/10 text-low"
                            : "border-high/40 bg-high/10 text-high"
                        }
                      >
                        {b.review_status}
                      </Pill>
                    </div>
                    <p className="mt-1 text-[12px] text-muted-foreground">{b.reason}</p>
                    <p className="mt-1 text-[11.5px] text-muted-foreground">
                      {facname(b.facility_id) ?? "Facility"} · {timeAgo(b.started_at)} · access expired{" "}
                      {new Date(b.expires_at).toLocaleString()} ·{" "}
                      {b.patient_notified_at ? "you were notified" : "notification pending"}
                    </p>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}

          <Panel>
            <PanelHeader title="What the labels mean" subtitle="Five lawful bases, plainly stated" />
            <div className="divide-y divide-border">
              {BASES.map((b) => (
                <div key={b} className="px-5 py-3">
                  <Pill className={BASIS_TONE[b]}>
                    <Eye className="h-3 w-3" />
                    {BASIS_LABEL[b]}
                  </Pill>
                  <p className="mt-1.5 text-[12px] text-muted-foreground">{BASIS_BLURB[b]}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
