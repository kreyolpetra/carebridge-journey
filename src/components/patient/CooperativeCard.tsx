/**
 * The member's side of the data cooperative.
 *
 * The governance console is where releases are approved; this is where the
 * person whose data it is decides whether to be in the pool at all, and sees
 * what that has been worth. Without this the "cooperative" is a ministry
 * database with a friendly name — consent has to be exercisable by the
 * consenting party, on their own record, in one click.
 *
 * The withdrawal copy is deliberately not reassuring about extracts already
 * released. Telling someone their data can be recalled when it cannot would be
 * the one lie that matters here.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Landmark, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cooperativeMembersQuery, dataRequestsQuery } from "@/lib/api";
import { Panel, PanelHeader } from "@/components/grid";
import { usd, shortDate } from "@/lib/format";

const MEMBER_SHARE = 0.6;

export function CooperativeCard({ patientId }: { patientId: string }) {
  const members = useQuery(cooperativeMembersQuery);
  const requests = useQuery(dataRequestsQuery);
  const qc = useQueryClient();

  const mine = (members.data ?? []).find((m) => m.patient_id === patientId) ?? null;
  const isMember = mine?.status === "active";

  const activeCount = (members.data ?? []).filter((m) => m.status === "active").length;
  const revenue = (requests.data ?? [])
    .filter((r) => r.status === "approved")
    .reduce((a, r) => a + r.fee_usd, 0);
  // An equal share of the member fund. Contribution is membership, not volume:
  // a patient with more readings is not worth more than one with fewer.
  const myShare = activeCount ? Math.round((revenue * MEMBER_SHARE) / activeCount) : 0;
  const studies = (requests.data ?? []).filter((r) => r.status === "approved").length;

  const toggle = useMutation({
    mutationFn: async (join: boolean) => {
      if (mine) {
        const { error } = await supabase
          .from("cooperative_members")
          .update({
            status: join ? "active" : "withdrawn",
            withdrawn_at: join ? null : new Date().toISOString(),
          })
          .eq("id", mine.id);
        if (error) throw new Error(error.message);
        return;
      }
      const { error } = await supabase.from("cooperative_members").insert({
        patient_id: patientId,
        status: "active",
        scope: ["vitals", "conditions", "medications", "outcomes"],
        joined_at: new Date().toISOString(),
        withdrawn_at: null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, join) => {
      toast.success(
        join
          ? "You have joined the cooperative"
          : "You have left. Nothing new will include your record.",
      );
      void qc.invalidateQueries({ queryKey: ["cooperative_members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Panel>
      <PanelHeader
        title="Health Data Cooperative"
        subtitle="Your record, with your name removed, helping Caribbean research — only if you say so"
      />
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-xl">
            <p className="text-[13.5px] leading-relaxed">
              {isMember ? (
                <>
                  You are a member, since{" "}
                  <strong className="font-semibold">{shortDate(mine!.joined_at)}</strong>. Your
                  readings, conditions and medications go into regional research with your name,
                  phone number and parish removed. {studies} studies have used the pool.
                </>
              ) : (
                <>
                  You are not a member. Your record is used for your care only, and is never part of
                  a research release. You can join now and leave whenever you want.
                </>
              )}
            </p>
            {isMember ? (
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
                If you leave, nothing released after that will include you — but studies that
                already have the data cannot give it back. That is why the choice is worth making
                deliberately.
              </p>
            ) : null}
          </div>

          {isMember ? (
            <div className="shrink-0 rounded-xl border border-low/30 bg-low/8 px-4 py-3 text-right">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Your share so far
              </div>
              <div className="mono-num mt-0.5 text-[20px] font-bold text-low">{usd(myShare)}</div>
              <div className="text-[11px] text-muted-foreground">credited to your health fund</div>
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={toggle.isPending}
            onClick={() => toggle.mutate(!isMember)}
            className={
              isMember
                ? "rounded-lg border border-border px-3.5 py-2 text-[13px] font-semibold hover:bg-surface disabled:opacity-60"
                : "inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-60"
            }
          >
            {isMember ? null : <Check className="h-3.5 w-3.5" />}
            {toggle.isPending ? "Saving…" : isMember ? "Leave the cooperative" : "Join"}
          </button>
          <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Landmark className="h-3.5 w-3.5" />
            {activeCount.toLocaleString()} members across the region
          </span>
        </div>
      </div>
    </Panel>
  );
}
