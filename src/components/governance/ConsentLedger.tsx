/**
 * Who can see this record: grants, agreements and the rules behind them.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck, ShieldX, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { accessLogQuery, consentGrantsQuery, patientsQuery, providersQuery } from "@/lib/api";
import { Panel, PanelHeader, Pill, Stat, SectionTitle } from "@/components/grid";
import { GovernanceSections } from "@/components/GovernanceSections";
import { timeAgo } from "@/lib/format";
import { useScope } from "@/hooks/useScope";

export function Consent() {
  const { isPatient, patientId } = useScope();
  const grants = useQuery(consentGrantsQuery);
  const log = useQuery(accessLogQuery);
  const patients = useQuery(patientsQuery);
  const providers = useQuery(providersQuery);
  const qc = useQueryClient();

  const pname = (id: string) => patients.data?.find((p) => p.id === id)?.full_name ?? "Patient";
  const provname = (id: string | null) =>
    providers.data?.find((p) => p.id === id)?.full_name ?? "Care team";
  const provisland = (id: string | null) =>
    providers.data?.find((p) => p.id === id)?.island_code ?? "—";

  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "revoked" | "denied" }) => {
      const grant = grants.data?.find((g) => g.id === id);
      const { error } = await supabase
        .from("consent_grants")
        .update({
          status,
          granted_at: status === "active" ? new Date().toISOString() : null,
          expires_at:
            status === "active" ? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() : null,
        })
        .eq("id", id);
      if (error) throw new Error(error.message);
      if (grant) {
        await supabase.from("consent_access_log").insert({
          patient_id: grant.patient_id,
          provider_id: grant.provider_id,
          grant_id: grant.id,
          resource: grant.scope.join(", "),
          allowed: status === "active",
        });
      }
    },
    onSuccess: () => {
      toast.success("Consent ledger updated — the change applies immediately");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const all = (grants.data ?? []).filter((g) => (patientId ? g.patient_id === patientId : true));
  const accessLog = (log.data ?? []).filter((r) => (patientId ? r.patient_id === patientId : true));
  const pending = all.filter((g) => g.status === "pending");
  const active = all.filter((g) => g.status === "active");
  const revoked = all.filter((g) => g.status === "revoked" || g.status === "denied");
  const careTeamReads = accessLog.filter((r) => !r.grant_id).length;

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-8">
      <SectionTitle
        eyebrow={isPatient ? "Your privacy" : "Interoperability"}
        title={isPatient ? "Sharing & permissions" : "Consent ledger"}
        blurb={
          isPatient
            ? 'Four ways your record can move: a facility treating you, two facilities under a signed agreement, a one-off request you approve, or an emergency override. Set your permissions here — the receipts live in "Who has looked at my record".'
            : "Records only move when the patient says so. Each grant names the clinician, the island, the exact data scope, the clinical purpose and an expiry — and every read is written to an immutable access log the patient can see."
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat
          label={isPatient ? "Awaiting your approval" : "Awaiting patient"}
          value={pending.length}
          hint="Cross-island requests"
          tone="critical"
        />
        <Stat
          label="Active grants"
          value={active.length}
          hint="Scoped and time-limited"
          tone="low"
        />
        <Stat label="Revoked / denied" value={revoked.length} hint="Access closed immediately" />
        <Stat
          label="Logged accesses"
          value={accessLog.length}
          hint={`${careTeamReads} treating-facility reads · ${accessLog.length - careTeamReads} by consent`}
          tone="signal"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Panel>
          <PanelHeader
            title="Grants"
            subtitle={
              isPatient
                ? "Requests to view your record"
                : "Patient-controlled sharing across borders"
            }
          />
          <div className="max-h-[640px] divide-y divide-border overflow-y-auto">
            {all.map((g) => (
              <div key={g.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[14px] font-semibold">
                      {isPatient
                        ? provname(g.provider_id)
                        : `${pname(g.patient_id)} → ${provname(g.provider_id)}`}
                    </div>
                    <div className="text-[12px] text-muted-foreground">
                      {provisland(g.provider_id)} · {g.purpose} · requested {timeAgo(g.created_at)}
                    </div>
                  </div>
                  <Pill
                    className={
                      g.status === "active"
                        ? "border-low/40 bg-low/10 text-low"
                        : g.status === "pending"
                          ? "border-high/40 bg-high/10 text-high"
                          : "border-border bg-surface text-muted-foreground"
                    }
                  >
                    {g.status === "active" ? (
                      <ShieldCheck className="h-3 w-3" />
                    ) : g.status === "pending" ? (
                      <Clock className="h-3 w-3" />
                    ) : (
                      <ShieldX className="h-3 w-3" />
                    )}
                    {g.status}
                  </Pill>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {g.scope.map((s) => (
                    <span
                      key={s}
                      className="rounded-md border border-border bg-surface px-2 py-0.5 text-[11.5px] text-muted-foreground"
                    >
                      {s}
                    </span>
                  ))}
                  {g.expires_at ? (
                    <span className="rounded-md border border-border bg-surface px-2 py-0.5 text-[11.5px] text-muted-foreground">
                      expires {new Date(g.expires_at).toLocaleDateString()}
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 flex gap-2">
                  {g.status !== "active" ? (
                    <button
                      onClick={() => decide.mutate({ id: g.id, status: "active" })}
                      className="rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground"
                    >
                      {isPatient ? "Approve" : "Patient approves"}
                    </button>
                  ) : null}
                  {g.status !== "revoked" ? (
                    <button
                      onClick={() => decide.mutate({ id: g.id, status: "revoked" })}
                      className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Revoke
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            {!all.length ? (
              <p className="p-5 text-[13px] text-muted-foreground">
                No grants yet — trigger a cross-island referral from messages and it will appear
                here.
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel className="h-fit">
          <PanelHeader
            title="Access log"
            subtitle={
              isPatient
                ? "Every time your file was opened — by consent, or by a facility treating you"
                : "Every read, whether granted by the patient or taken under a treating relationship"
            }
          />
          <div className="max-h-[640px] divide-y divide-border overflow-y-auto">
            {accessLog.map((row) => (
              <div key={row.id} className="flex items-start justify-between gap-3 px-5 py-3">
                <div>
                  <div className="text-[13px] font-medium">{provname(row.provider_id)}</div>
                  <div className="text-[11.5px] text-muted-foreground">
                    {row.resource}
                    {isPatient ? "" : ` · ${pname(row.patient_id)}`}
                  </div>
                  <div className="mt-1">
                    <Pill
                      className={
                        row.grant_id
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-border bg-surface text-muted-foreground"
                      }
                    >
                      {row.grant_id ? "you approved this" : "treating facility"}
                    </Pill>
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={
                      row.allowed ? "text-[11.5px] text-low" : "text-[11.5px] text-critical"
                    }
                  >
                    {row.allowed ? "allowed" : "blocked"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {timeAgo(row.accessed_at)}
                  </div>
                </div>
              </div>
            ))}
            {!accessLog.length ? (
              <p className="p-5 text-[13px] text-muted-foreground">No accesses recorded yet.</p>
            ) : null}
          </div>
        </Panel>
      </div>

      <GovernanceSections isPatient={isPatient} patientId={patientId} />
    </div>
  );
}
