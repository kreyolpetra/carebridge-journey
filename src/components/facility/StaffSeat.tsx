/**
 * A seat on a facility's roster, and the way out of it.
 *
 * Adding somebody was gated and nothing else was. There was no way to remove a
 * person at all — a clinician who resigned, moved island or was suspended kept
 * the ability to open records at a building they no longer worked in, for as
 * long as the account existed. Dormant credentials are the ordinary way health
 * records leak, and the ordinary reason is that somebody built the joining half
 * of the lifecycle and stopped.
 *
 * Removing does not delete. The seat stays on the roster with the date it was
 * vacated, because "who could see records here in August" is a question an
 * investigation has to be able to answer, and deleting the row destroys the
 * only evidence of it. What removal does is separate the person from the seat
 * and lock the account out of every clinical surface.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserMinus, ShieldOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Pill } from "@/components/grid";
import { STAFF_ROLE_LABEL } from "@/lib/org";
import { timeAgo } from "@/lib/format";

export type Seat = {
  id: string;
  full_name: string | null;
  title: string | null;
  staff_role: string;
  user_id: string | null;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
  removed_at?: string | null;
};

export function StaffSeat({
  seat,
  displayName,
  canRemove,
  isSelf,
}: {
  seat: Seat;
  displayName: string;
  canRemove: boolean;
  isSelf: boolean;
}) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const remove = useMutation({
    mutationFn: async () => {
      /*
       * Read the seat again before acting on it.
       *
       * The first version trusted the user_id on the row this component was
       * handed, which comes from a cached list. When that cache was a moment
       * stale the id was still null, the profile update was skipped, and the
       * seat was marked vacated while the account stayed live — a removal that
       * removed nothing, reported as success. Caught by signing the removed
       * person back in: they were still let through the door.
       *
       * A security-critical write does not get to trust a prop.
       */
      const { data: fresh, error: readErr } = await supabase
        .from("facility_staff")
        .select("user_id")
        .eq("id", seat.id)
        .maybeSingle();
      if (readErr) throw new Error(readErr.message);
      const userId = (fresh as { user_id: string | null } | null)?.user_id ?? seat.user_id;

      if (userId) {
        // Locked out of every clinical surface, and no longer attached to the
        // building. The account survives so the person can be re-admitted.
        const { error } = await supabase
          .from("profiles")
          .update({ verification_status: "revoked", facility_id: null } as never)
          .eq("id", userId);
        if (error) throw new Error(error.message);
      }
      const { error } = await supabase
        .from("facility_staff")
        .update({ user_id: null, removed_at: new Date().toISOString() })
        .eq("id", seat.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["facility_staff"] });
      void qc.invalidateQueries({ queryKey: ["profiles", "pending"] });
      toast("Access withdrawn", {
        description: `${displayName} can no longer open records at this facility. The seat stays on the roster with today's date.`,
      });
      setConfirming(false);
    },
    onError: (e: Error) => toast("Could not withdraw access", { description: e.message }),
  });

  const provenance = seat.removed_at
    ? `Left ${timeAgo(seat.removed_at)}`
    : !seat.user_id
      ? "Invited — has not joined"
      : seat.confirmed_by
        ? `Confirmed by ${seat.confirmed_by}`
        : seat.confirmed_at
          ? "Self-attested at setup — nobody confirmed this account"
          : "Joined before confirmations were recorded";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold">
          {displayName}
          {seat.removed_at ? (
            <span className="ml-2 text-[12px] font-normal text-muted-foreground">· removed</span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
          {provenance}
        </span>
      </span>

      <Pill className="border-border bg-surface text-muted-foreground">
        {STAFF_ROLE_LABEL[seat.staff_role] ?? seat.staff_role}
      </Pill>

      {canRemove && seat.user_id && !seat.removed_at ? (
        confirming ? (
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-critical px-2.5 py-1.5 text-[12px] font-semibold text-critical-foreground disabled:opacity-60"
            >
              <ShieldOff className="h-3.5 w-3.5" />
              {remove.isPending ? "Withdrawing…" : "Withdraw access"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
            >
              Keep
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-semibold text-muted-foreground hover:border-critical/40 hover:text-critical"
          >
            <UserMinus className="h-3.5 w-3.5" />
            Remove
          </button>
        )
      ) : isSelf && !seat.removed_at ? (
        /* An administrator removing themselves could leave a facility with
           nobody able to admit anyone. */
        <span className="text-[11.5px] text-muted-foreground">You</span>
      ) : null}
    </div>
  );
}
