import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileSignature, Lock, ShieldAlert, Timer, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { facilitiesQuery, providersQuery } from "@/lib/api";
import { encountersQuery } from "@/lib/org";
import {
  SENSITIVE_CATEGORIES,
  TIER_LABEL,
  TIER_SCOPE,
  agreementsQuery,
  breakGlassQuery,
  careTeamQuery,
  resolveTreatingWindows,
  sensitiveGrantsQuery,
  treatingWindowsQuery,
  type CareTier,
} from "@/lib/access";
import { Panel, PanelHeader, Pill } from "@/components/grid";
import { timeAgo } from "@/lib/format";

/**
 * The governance half of the sharing screen: institutional agreements,
 * time-bounded treating windows, sensitive-category gates, care-team role
 * tiers and break-glass review — the parts of the access-control spec that
 * are not a per-patient consent tap.
 */
export function GovernanceSections({
  isPatient,
  patientId,
}: {
  isPatient: boolean;
  patientId: string | null;
}) {
  const qc = useQueryClient();
  const agreements = useQuery(agreementsQuery);
  const policies = useQuery(treatingWindowsQuery);
  const facilities = useQuery(facilitiesQuery);
  const providers = useQuery(providersQuery);
  const encounters = useQuery(encountersQuery(patientId ?? undefined));
  const sensitive = useQuery(sensitiveGrantsQuery(patientId));
  const careTeam = useQuery(careTeamQuery(patientId));
  const breakGlass = useQuery(breakGlassQuery(patientId));

  const facname = (id: string | null) => facilities.data?.find((f) => f.id === id)?.name ?? "Facility";
  const facisland = (id: string | null) => facilities.data?.find((f) => f.id === id)?.island_code ?? "—";
  const provname = (id: string | null) => providers.data?.find((p) => p.id === id)?.full_name ?? null;

  const windows = useMemo(
    () => resolveTreatingWindows(encounters.data ?? [], facilities.data ?? [], policies.data ?? []),
    [encounters.data, facilities.data, policies.data],
  );

  const setSensitive = useMutation({
    mutationFn: async ({ category, allow }: { category: string; allow: boolean }) => {
      if (!patientId) throw new Error("Sign in as a patient to change these settings");
      const existing = (sensitive.data ?? []).find((g) => g.category === category && !g.provider_id);
      const payload = {
        patient_id: patientId,
        category,
        status: allow ? "active" : "revoked",
        purpose: "Care team access to a sensitive section of the chart",
        granted_at: allow ? new Date().toISOString() : null,
        expires_at: allow ? new Date(Date.now() + 180 * 86_400_000).toISOString() : null,
      };
      const { error } = existing
        ? await supabase.from("sensitive_grants").update(payload).eq("id", existing.id)
        : await supabase.from("sensitive_grants").insert(payload);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Sensitive-section setting saved — it applies to the next read");
      void qc.invalidateQueries({ queryKey: ["sensitive_grants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = (category: string) =>
    (sensitive.data ?? []).find((g) => g.category === category && !g.provider_id)?.status ?? "sealed";

  const tiers: CareTier[] = ["attending", "consulting", "nursing", "allied", "front_desk", "org_admin"];

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <Panel>
        <PanelHeader
          title={
            <span className="inline-flex items-center gap-2">
              <FileSignature className="h-4 w-4 text-signal" /> Institutional agreements
            </span>
          }
          subtitle="Recurring facility-to-facility pipelines run under a signed, expiring agreement — not a fresh tap every visit"
        />
        <div className="divide-y divide-border">
          {(agreements.data ?? []).map((a) => (
            <div key={a.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[13.5px] font-semibold">
                  {facname(a.from_facility_id)} <span className="text-muted-foreground">→</span>{" "}
                  {facname(a.to_facility_id)}
                </div>
                <Pill
                  className={
                    a.status === "active"
                      ? "border-low/40 bg-low/10 text-low"
                      : "border-high/40 bg-high/10 text-high"
                  }
                >
                  {a.status}
                </Pill>
              </div>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {a.reference} · {facisland(a.from_facility_id)} → {facisland(a.to_facility_id)} · {a.purpose}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {a.scope.map((s) => (
                  <span key={s} className="rounded-md border border-border bg-surface px-2 py-0.5 text-[11.5px] text-muted-foreground">
                    {s}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[11.5px] text-muted-foreground">
                Executed {new Date(a.executed_on).toLocaleDateString()} · expires{" "}
                {new Date(a.expires_at).toLocaleDateString()} · review due{" "}
                {new Date(a.review_due_on).toLocaleDateString()}
                {a.patient_opt_out_allowed ? " · patients may opt out" : ""}
              </p>
            </div>
          ))}
          {!(agreements.data ?? []).length ? (
            <p className="p-5 text-[13px] text-muted-foreground">No agreements executed yet.</p>
          ) : null}
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Timer className="h-4 w-4 text-primary" /> Treating access windows
            </span>
          }
          subtitle="A visit opens access for a bounded period sized by facility type, then it closes automatically"
        />
        <div className="divide-y divide-border">
          {windows.slice(0, 6).map((w) => (
            <div key={w.facilityId} className="flex items-center justify-between gap-3 px-5 py-3">
              <div>
                <div className="text-[13px] font-semibold">{w.facilityName}</div>
                <div className="text-[11.5px] text-muted-foreground">
                  {w.policyLabel} · {w.days}-day window · last event {timeAgo(w.lastEventAt)}
                </div>
              </div>
              <div className="text-right">
                <Pill className={w.open ? "border-low/40 bg-low/10 text-low" : "border-border bg-surface text-muted-foreground"}>
                  {w.open ? "open" : "closed"}
                </Pill>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {new Date(w.closesAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
          {!windows.length ? (
            <p className="p-5 text-[13px] text-muted-foreground">
              {isPatient ? "No facility currently holds treating access to your record." : "Select a patient to see their windows."}
            </p>
          ) : null}
          <div className="px-5 py-3 text-[11.5px] text-muted-foreground">
            Defaults: A&E 7 days · inpatient 30 · specialist 90 · primary care 365 rolling · pharmacy 30 · lab 14. Configurable per
            facility type, capped at 365 days.
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Lock className="h-4 w-4 text-high" /> Sensitive sections of the chart
            </span>
          }
          subtitle="Sealed by default, even from a facility that is treating you — opened only by your explicit say-so"
        />
        <div className="divide-y divide-border">
          {SENSITIVE_CATEGORIES.map((c) => {
            const s = status(c.code);
            return (
              <div key={c.code} className="flex items-start justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold">{c.label}</div>
                  <div className="text-[11.5px] text-muted-foreground">{c.gate}</div>
                </div>
                <div className="shrink-0 text-right">
                  <Pill
                    className={
                      s === "active"
                        ? "border-low/40 bg-low/10 text-low"
                        : "border-border bg-surface text-muted-foreground"
                    }
                  >
                    {s === "active" ? "shared with care team" : "sealed"}
                  </Pill>
                  {isPatient ? (
                    <button
                      onClick={() => setSensitive.mutate({ category: c.code, allow: s !== "active" })}
                      className="mt-1.5 block w-full rounded-lg border border-border px-2.5 py-1 text-[11.5px] font-semibold text-muted-foreground hover:text-foreground"
                    >
                      {s === "active" ? "Seal again" : "Share"}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="space-y-4">
        <Panel>
          <PanelHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Care team, not the whole institution
              </span>
            }
            subtitle="Treating access is scoped by role tier — nobody sees more of the chart than their job needs"
          />
          <div className="divide-y divide-border">
            {(careTeam.data ?? []).length ? (
              <div className="px-5 py-3">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Named on {isPatient ? "your" : "this"} care team
                </div>
                <div className="mt-1.5 space-y-1">
                  {(careTeam.data ?? []).map((m) => (
                    <div key={m.id} className="text-[12.5px]">
                      {provname(m.provider_id) ?? TIER_LABEL[m.tier as CareTier] ?? m.tier} ·{" "}
                      <span className="text-muted-foreground">
                        {facname(m.facility_id)} · {TIER_LABEL[m.tier as CareTier] ?? m.tier}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {tiers.map((t) => (
              <div key={t} className="px-5 py-3">
                <div className="text-[13px] font-semibold">{TIER_LABEL[t]}</div>
                <div className="text-[11.5px] text-muted-foreground">{TIER_SCOPE[t]}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title={
              <span className="inline-flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-critical" /> Break-glass
              </span>
            }
            subtitle="Life-threatening emergencies only · licensed clinicians · 24-hour expiry · patient notified within the hour · governance review within 72 hours"
          />
          <div className="divide-y divide-border">
            {(breakGlass.data ?? []).map((b) => (
              <div key={b.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[13px] font-semibold">{b.actor_name || "Clinician"}</div>
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
                  {facname(b.facility_id)} · {timeAgo(b.started_at)} ·{" "}
                  {b.patient_notified_at ? "patient notified" : "notification pending"}
                </p>
              </div>
            ))}
            {!(breakGlass.data ?? []).length ? (
              <p className="p-5 text-[13px] text-muted-foreground">No emergency overrides on record.</p>
            ) : null}
            <div className="px-5 py-3 text-[11.5px] text-muted-foreground">
              Every override appears in{" "}
              <Link to="/access-log" className="font-semibold text-primary">
                {isPatient ? "Who has looked at my record" : "the access log"}
              </Link>
              , flagged for mandatory review.
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
