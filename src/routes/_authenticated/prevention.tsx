import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Send, Users, CheckCircle2, CalendarCheck, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { patientsQuery, riskScoresQuery, islandsQuery } from "@/lib/api";
import {
  allConditionsQuery,
  allMedicationsQuery,
  buildCohort,
  campaignTargetsQuery,
  campaignsQuery,
  renderTemplate,
  ruleSummary,
  type CohortRule,
} from "@/lib/prevention";
import { Panel, PanelHeader, Pill, Stat, Loading } from "@/components/grid";
import { timeAgo } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/prevention")({
  head: () => ({
    meta: [
      { title: "Prevention Engine — Find Patients Before They Crash | CariCare Grid" },
      {
        name: "description",
        content:
          "Build a cohort in seconds, message every patient in it on WhatsApp or SMS, and track who replied, who sent a reading and who got booked in — prevention delivered, not just displayed.",
      },
      { property: "og:title", content: "Prevention Engine — CariCare Grid" },
      {
        property: "og:description",
        content: "Screening campaigns and automated outreach for Caribbean chronic disease care.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Prevention,
});

const STATUS_TONE: Record<string, string> = {
  running: "border-primary/40 bg-primary/10 text-primary",
  draft: "border-border bg-muted text-muted-foreground",
  complete: "border-low/40 bg-low/10 text-low",
};

export function Prevention() {
  const qc = useQueryClient();
  const campaigns = useQuery(campaignsQuery);
  const targets = useQuery(campaignTargetsQuery);
  const patients = useQuery(patientsQuery);
  const risks = useQuery(riskScoresQuery);
  const conditions = useQuery(allConditionsQuery);
  const meds = useQuery(allMedicationsQuery);
  const islands = useQuery(islandsQuery);

  const [selected, setSelected] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [draft, setDraft] = useState<{ name: string; rule: CohortRule; template: string; channel: string }>({
    name: "",
    rule: { condition: "Hypertension", riskMin: 45 },
    template:
      "Hi {name}, this is your CariCare care team. Please reply with your latest blood pressure reading, or type CHECK for a free check nearby.",
    channel: "whatsapp",
  });

  const patientById = useMemo(
    () => new Map((patients.data ?? []).map((p) => [p.id, p])),
    [patients.data],
  );

  const preview = useMemo(() => {
    if (!patients.data || !risks.data || !conditions.data || !meds.data) return [];
    return buildCohort(draft.rule, {
      patients: patients.data,
      risks: risks.data,
      conditions: conditions.data,
      medications: meds.data,
    });
  }, [draft.rule, patients.data, risks.data, conditions.data, meds.data]);

  const byCampaign = useMemo(() => {
    const m = new Map<string, { total: number; sent: number; responded: number; booked: number; readings: number }>();
    for (const t of targets.data ?? []) {
      const cur = m.get(t.campaign_id) ?? { total: 0, sent: 0, responded: 0, booked: 0, readings: 0 };
      cur.total += 1;
      if (t.status !== "queued") cur.sent += 1;
      if (t.status === "responded" || t.status === "booked") cur.responded += 1;
      if (t.status === "booked") cur.booked += 1;
      if (t.reading_captured) cur.readings += 1;
      m.set(t.campaign_id, cur);
    }
    return m;
  }, [targets.data]);

  const totals = useMemo(() => {
    const all = targets.data ?? [];
    return {
      reached: all.filter((t) => t.status !== "queued").length,
      responded: all.filter((t) => t.status === "responded" || t.status === "booked").length,
      readings: all.filter((t) => t.reading_captured).length,
      booked: all.filter((t) => t.status === "booked").length,
    };
  }, [targets.data]);

  const launch = useMutation({
    mutationFn: async () => {
      const matches = preview.slice(0, 200);
      if (matches.length === 0) throw new Error("No patients match this cohort.");
      const { data: campaign, error } = await supabase
        .from("screening_campaigns")
        .insert({
          name: draft.name || "Untitled campaign",
          description: `Cohort: ${ruleSummary(draft.rule)}`,
          condition_focus: draft.rule.condition ?? "screening",
          island_code: draft.rule.island ?? null,
          cohort_rule: JSON.parse(JSON.stringify(draft.rule)),
          message_template: draft.template,
          channel: draft.channel,
          status: "running",
        })
        .select("id")
        .single();
      if (error) throw error;

      const rows = matches.map((m) => ({
        campaign_id: campaign.id,
        patient_id: m.patient.id,
        status: "sent",
        reason: m.reason,
        sent_at: new Date().toISOString(),
      }));
      const { error: tErr } = await supabase.from("campaign_targets").insert(rows);
      if (tErr) throw tErr;

      // Deliver the first wave down the care line so patients actually see it.
      const wave = matches.slice(0, 40).map((m) => ({
        patient_id: m.patient.id,
        direction: "out",
        body: renderTemplate(draft.template, m.patient),
        kind: "outreach",
        language: m.patient.language,
        channel: draft.channel,
        queued_offline: false,
        delivered_at: new Date().toISOString(),
      }));
      await supabase.from("messages").insert(wave);
      return { id: campaign.id, count: matches.length };
    },
    onSuccess: (r) => {
      toast.success(`Campaign launched to ${r.count} patients`);
      setShowBuilder(false);
      setSelected(r.id);
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      void qc.invalidateQueries({ queryKey: ["campaign_targets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeCampaign = (campaigns.data ?? []).find((c) => c.id === selected) ?? campaigns.data?.[0] ?? null;
  const activeTargets = (targets.data ?? [])
    .filter((t) => t.campaign_id === activeCampaign?.id)
    .sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? ""))
    .slice(0, 40);

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Prevention</p>
        <h1 className="font-display text-[26px] font-semibold tracking-tight">Reach patients before they crash</h1>
        <p className="mt-1 max-w-3xl text-[13.5px] text-muted-foreground">
          Risk scores are only useful if something happens. Build a cohort from the region's live data, send it down the
          care line in the patient's own language, and watch replies, readings and bookings come back.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Patients reached" value={totals.reached} hint="Across all running campaigns" tone="signal" />
        <Stat label="Replied" value={totals.responded} hint="Two-way conversations opened" />
        <Stat label="Readings captured" value={totals.readings} hint="New data with no clinic visit" tone="low" />
        <Stat label="Booked into care" value={totals.booked} hint="Escalated to a consult" tone="critical" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
        <Panel>
          <PanelHeader
            title="Campaigns"
            subtitle="Each one is a standing rule, not a one-off blast"
            right={
              <button
                onClick={() => setShowBuilder((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground"
              >
                <Plus className="h-3.5 w-3.5" /> New campaign
              </button>
            }
          />
          {campaigns.isLoading ? (
            <Loading />
          ) : (
            <div className="divide-y divide-border">
              {(campaigns.data ?? []).map((c) => {
                const s = byCampaign.get(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelected(c.id)}
                    className={`w-full px-5 py-4 text-left transition-colors hover:bg-muted/60 ${
                      activeCampaign?.id === c.id ? "bg-muted/70" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex items-center gap-2 text-[13.5px] font-semibold">
                        <Megaphone className="h-4 w-4 text-primary" /> {c.name}
                      </span>
                      <Pill className={STATUS_TONE[c.status] ?? STATUS_TONE["draft"]!}>{c.status}</Pill>
                    </div>
                    <p className="mt-1 text-[12.5px] text-muted-foreground">{c.description}</p>
                    <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                      {ruleSummary(c.cohort_rule)} · {c.channel}
                    </p>
                    {s ? (
                      <div className="mt-2 flex flex-wrap gap-3 text-[11.5px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" /> {s.total} targeted
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Send className="h-3.5 w-3.5" /> {s.sent} sent
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-low" /> {s.responded} replied
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarCheck className="h-3.5 w-3.5 text-primary" /> {s.booked} booked
                        </span>
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          {showBuilder ? (
            <Panel>
              <PanelHeader
                title="Cohort builder"
                subtitle="Every filter runs against live regional data"
                right={<Pill className="border-primary/40 bg-primary/10 text-primary">{preview.length} match</Pill>}
              />
              <div className="space-y-3 px-5 py-4">
                <label className="block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Campaign name
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="e.g. St. Elizabeth glucose sweep"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13.5px] font-normal normal-case tracking-normal text-foreground"
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Condition
                    <select
                      value={draft.rule.condition ?? ""}
                      onChange={(e) => setDraft({ ...draft, rule: { ...draft.rule, condition: e.target.value || undefined } })}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13.5px] font-normal normal-case tracking-normal text-foreground"
                    >
                      <option value="">Any</option>
                      <option>Hypertension</option>
                      <option>Diabetes</option>
                      <option>Chronic kidney disease</option>
                      <option>Obesity</option>
                    </select>
                  </label>
                  <label className="block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Island
                    <select
                      value={draft.rule.island ?? ""}
                      onChange={(e) => setDraft({ ...draft, rule: { ...draft.rule, island: e.target.value || undefined } })}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13.5px] font-normal normal-case tracking-normal text-foreground"
                    >
                      <option value="">All islands</option>
                      {(islands.data ?? []).map((i) => (
                        <option key={i.code} value={i.code}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <NumberField
                    label="Risk ≥"
                    value={draft.rule.riskMin}
                    onChange={(v) => setDraft({ ...draft, rule: { ...draft.rule, riskMin: v } })}
                  />
                  <NumberField
                    label="Supply ≤ days"
                    value={draft.rule.daysSupplyMax}
                    onChange={(v) => setDraft({ ...draft, rule: { ...draft.rule, daysSupplyMax: v } })}
                  />
                  <NumberField
                    label="Adherence ≤ %"
                    value={draft.rule.adherenceMax}
                    onChange={(v) => setDraft({ ...draft, rule: { ...draft.rule, adherenceMax: v } })}
                  />
                </div>

                <label className="flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.rule.ruralOnly)}
                    onChange={(e) => setDraft({ ...draft, rule: { ...draft.rule, ruralOnly: e.target.checked } })}
                  />
                  Rural patients only
                </label>

                <label className="block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Message ({"{name}"} is replaced per patient)
                  <textarea
                    value={draft.template}
                    onChange={(e) => setDraft({ ...draft, template: e.target.value })}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13.5px] font-normal normal-case tracking-normal text-foreground"
                  />
                </label>

                {preview.length > 0 ? (
                  <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-[12px] text-muted-foreground">
                    First match: <strong className="text-foreground">{preview[0]!.patient.full_name}</strong> —{" "}
                    {preview[0]!.reason}
                  </div>
                ) : null}

                <button
                  disabled={launch.isPending || preview.length === 0}
                  onClick={() => launch.mutate()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[13.5px] font-semibold text-primary-foreground disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  {launch.isPending ? "Sending…" : `Launch to ${Math.min(preview.length, 200)} patients`}
                </button>
              </div>
            </Panel>
          ) : null}

          <Panel>
            <PanelHeader
              title={activeCampaign ? activeCampaign.name : "Campaign detail"}
              subtitle="Who was reached and what came back"
              right={
                activeCampaign ? (
                  <Pill className="border-border bg-muted text-muted-foreground">{activeTargets.length} shown</Pill>
                ) : null
              }
            />
            {activeCampaign ? (
              <>
                <div className="border-b border-border bg-muted/40 px-5 py-3 text-[12.5px] italic text-muted-foreground">
                  “{activeCampaign.message_template}”
                </div>
                <div className="max-h-[420px] divide-y divide-border overflow-y-auto">
                  {activeTargets.map((t) => {
                    const p = patientById.get(t.patient_id);
                    return (
                      <div key={t.id} className="flex items-start justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold">{p?.full_name ?? "Patient"}</p>
                          <p className="text-[12px] text-muted-foreground">{t.reason}</p>
                          {t.outcome ? <p className="text-[12px] text-primary">{t.outcome}</p> : null}
                        </div>
                        <div className="shrink-0 text-right">
                          <Pill
                            className={
                              t.status === "booked"
                                ? "border-primary/40 bg-primary/10 text-primary"
                                : t.status === "responded"
                                  ? "border-low/40 bg-low/10 text-low"
                                  : "border-border bg-muted text-muted-foreground"
                            }
                          >
                            {t.status}
                          </Pill>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {t.sent_at ? timeAgo(t.sent_at) : "not sent"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <Loading />
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <label className="block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        placeholder="—"
        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13.5px] font-normal normal-case tracking-normal text-foreground"
      />
    </label>
  );
}
