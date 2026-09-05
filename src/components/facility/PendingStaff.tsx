/**
 * Letting somebody in — the half of the door that was missing.
 *
 * Sign-up already does the right thing: a clinical account has to give its own
 * registration number and name a facility that can vouch for it, and until
 * that happens the person is held at the door. That is the correct direction
 * of travel for a health system. An administrator typing "Dr. Marcia Henry"
 * into a box must never be what opens a patient's chart — the licence has to
 * be asserted by the person who holds it.
 *
 * But nothing in the product could open that door. Anyone who signed up stayed
 * pending forever, which made the whole verification gate a dead end rather
 * than a safeguard.
 *
 * So this is the confirmation step, and it does one more thing worth having:
 * it matches the person against the roster the facility filled in during
 * setup. When somebody was invited on that number, confirming them is a match
 * — the facility already said it was expecting a nurse called Andrea Boodoo.
 * When nobody was expecting them, the panel says so plainly, because that is
 * exactly the case where a human should stop and think rather than click.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserCheck, UserX, ShieldQuestion, BadgeCheck, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { facilityStaffQuery, type FacilityStaff } from "@/lib/org";
import { useAuth } from "@/hooks/useAuth";
import { Panel, PanelHeader, Pill } from "@/components/grid";
import { ROLE_LABEL, type StaffRole } from "@/lib/staff-invite";
import { shortDate } from "@/lib/format";

type PendingProfile = {
  id: string;
  full_name: string;
  facility_id: string | null;
  staff_role: string | null;
  licence_no: string | null;
  verification_status: string | null;
  created_at: string;
};

const pendingQuery = {
  queryKey: ["profiles", "pending"],
  staleTime: 5_000,
  queryFn: async (): Promise<PendingProfile[]> => {
    const { data, error } = await supabase.from("profiles").select("*").limit(2000);
    if (error) throw new Error(error.message);
    return ((data ?? []) as PendingProfile[]).filter((p) => p.verification_status === "pending");
  },
};

/** Loose match: the same person rarely types their name the same way twice. */
function normalise(s: string) {
  return s
    .toLowerCase()
    .replace(/\b(dr|doctor|sister|nurse|mr|mrs|ms|miss)\.?\b/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findExpected(profile: PendingProfile, roster: FacilityStaff[]) {
  const want = normalise(profile.full_name);
  if (!want) return null;
  return (
    roster.find(
      (r) =>
        r.facility_id === profile.facility_id &&
        !r.user_id &&
        normalise(r.full_name ?? "") === want,
    ) ?? null
  );
}

export function PendingStaff({
  facilityId,
  canConfirm = true,
}: {
  facilityId: string | null | undefined;
  /** Confirming grants access to records, so it is the administrator's click. */
  canConfirm?: boolean;
}) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const pending = useQuery(pendingQuery);
  const staff = useQuery(facilityStaffQuery);

  const rows = useMemo(() => {
    const roster = (staff.data ?? []) as FacilityStaff[];
    return (pending.data ?? [])
      .filter((p) => p.facility_id === facilityId && p.id !== profile?.id)
      .map((p) => ({ profile: p, expected: findExpected(p, roster) }));
  }, [pending.data, staff.data, facilityId, profile]);

  const decide = useMutation({
    mutationFn: async ({
      row,
      approve,
    }: {
      row: { profile: PendingProfile; expected: FacilityStaff | null };
      approve: boolean;
    }) => {
      // The job the facility was expecting wins over the one they claimed: the
      // roster is the facility's own record of what it hired.
      const patch: { verification_status: string; staff_role?: string } = {
        verification_status: approve ? "verified" : "rejected",
      };
      if (approve && row.expected?.staff_role) patch.staff_role = row.expected.staff_role;

      const { error } = await supabase
        .from("profiles")
        .update(patch as never)
        .eq("id", row.profile.id);
      if (error) throw new Error(error.message);

      // Tie the person to the roster row they were invited on, so the seat is
      // filled rather than leaving a ghost invitation behind them.
      if (approve && row.expected) {
        /*
         * Who let this person in, and when.
         *
         * The click grants a human the ability to open patient records here.
         * This product logs every read of a record and logged nothing about
         * the granting of the right to read them, which is the one an auditor
         * asks about first. It is written on the seat itself, so it survives
         * as long as the roster does.
         */
        await supabase
          .from("facility_staff")
          .update({
            user_id: row.profile.id,
            confirmed_by: profile?.full_name ?? profile?.id ?? "unknown",
            confirmed_at: new Date().toISOString(),
          })
          .eq("id", row.expected.id);
      } else if (approve && facilityId) {
        /*
         * Confirmed, but never on the roster.
         *
         * Somebody can sign up naming a facility that was not expecting them,
         * and an administrator can still decide they belong. That used to
         * verify the profile and create no seat — so there was no record of who
         * admitted them, and later no seat to withdraw, which would have made
         * them the one person who could never be removed. Give them a seat.
         */
        await supabase.from("facility_staff").insert({
          facility_id: facilityId,
          user_id: row.profile.id,
          full_name: row.profile.full_name,
          staff_role: (row.profile.staff_role ?? "doctor") as never,
          confirmed_by: profile?.full_name ?? profile?.id ?? "unknown",
          confirmed_at: new Date().toISOString(),
        });
      }
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ["profiles", "pending"] });
      void qc.invalidateQueries({ queryKey: ["facility_staff"] });
      toast(vars.approve ? "Confirmed" : "Declined", {
        description: vars.approve
          ? `${vars.row.profile.full_name} can now open records at this facility.`
          : `${vars.row.profile.full_name} stays locked out.`,
      });
    },
    onError: (e: Error) => toast("Could not update", { description: e.message }),
  });

  if (!rows.length) return null;

  /*
   * Visible without being actionable.
   *
   * Hiding the queue from a clinician who cannot approve it would leave them
   * wondering why a colleague still has no access. Showing it read-only tells
   * them what is happening and who has to act.
   */
  if (!canConfirm) {
    return (
      <Panel className="mb-4 border-border">
        <PanelHeader
          title="Waiting to be let in"
          subtitle={`${rows.length} ${rows.length === 1 ? "person has" : "people have"} signed up naming this facility. Confirming someone grants them access to records here, so it is your administrator's decision — ask them to review it.`}
          right={
            <Pill className="border-border bg-surface text-muted-foreground">
              <ShieldQuestion className="h-3 w-3" />
              {rows.length} waiting
            </Pill>
          }
        />
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.profile.id} className="px-5 py-3 text-[13px]">
              <p className="font-semibold">{r.profile.full_name}</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {r.expected ? "Named on the roster" : "Not on the roster"}
              </p>
            </li>
          ))}
        </ul>
      </Panel>
    );
  }

  return (
    <Panel className="mb-4 border-high/40">
      <PanelHeader
        title="Waiting to be let in"
        subtitle="People who signed up naming this facility. Nobody sees a record until you confirm them."
        right={
          <Pill className="border-high/40 bg-high/10 text-high">
            <ShieldQuestion className="h-3 w-3" />
            {rows.length} waiting
          </Pill>
        }
      />
      <div className="divide-y divide-border">
        {rows.map((row) => (
          <div
            key={row.profile.id}
            className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5"
          >
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold">
                {row.profile.full_name}
                {row.expected ? (
                  <Pill className="border-low/40 bg-low/10 text-low">
                    <BadgeCheck className="h-3 w-3" />
                    expected
                  </Pill>
                ) : (
                  <Pill className="border-high/40 bg-high/10 text-high">
                    <AlertTriangle className="h-3 w-3" />
                    not on your roster
                  </Pill>
                )}
              </p>
              <p className="mono-num mt-0.5 text-[11.5px] text-muted-foreground">
                {row.profile.licence_no ?? "no registration number given"} · claims{" "}
                {ROLE_LABEL[row.profile.staff_role as StaffRole] ??
                  row.profile.staff_role ??
                  "clinical role"}{" "}
                · signed up {shortDate(row.profile.created_at)}
              </p>
              <p className="mt-1 max-w-[62ch] text-[12.5px] leading-relaxed text-muted-foreground">
                {row.expected ? (
                  <>
                    You invited {row.expected.full_name} as{" "}
                    <span className="font-medium text-foreground">
                      {ROLE_LABEL[row.expected.staff_role as StaffRole] ?? row.expected.staff_role}
                    </span>
                    . The registration number is theirs to prove — check it against the register
                    before you confirm.
                  </>
                ) : (
                  <>
                    Nobody by this name was invited during setup. Confirming grants access to
                    patient records here, so check who they are before you do.
                  </>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => decide.mutate({ row, approve: false })}
                disabled={decide.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[12px] font-semibold text-muted-foreground transition-colors hover:border-critical/40 hover:text-critical disabled:opacity-60"
              >
                <UserX className="h-3.5 w-3.5" />
                Decline
              </button>
              <button
                type="button"
                onClick={() => decide.mutate({ row, approve: true })}
                disabled={decide.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-[12px] font-semibold text-primary-foreground disabled:opacity-60"
              >
                <UserCheck className="h-3.5 w-3.5" />
                Confirm
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="border-t border-border px-5 py-3 text-[12px] leading-relaxed text-muted-foreground">
        Adding somebody to the roster does not give them access. They get in by registering with
        their own licence number and being confirmed here — so no one can hand out a chart by typing
        a name.
      </p>
    </Panel>
  );
}
