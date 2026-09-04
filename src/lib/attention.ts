/**
 * Attention is the scarce resource, so it gets allocated rather than listed.
 *
 * The worklist answers "who has a reason to be seen today" and stops there,
 * which quietly assumes the answer fits in a day. In the settings this is
 * built for it does not: one doctor covers a parish, the session is three
 * hours long, and a list of forty names ranked by urgency is still a list of
 * forty names. A ranked queue with no bottom is not a plan — everyone below
 * whatever line the clinician draws in their head falls off it silently, and
 * nobody can say afterwards who that was.
 *
 * So this draws the line explicitly. It says how much room there is, puts the
 * people whose outcome most depends on the clinician above it, and — the part
 * that matters — gives everyone below it a named disposition instead of
 * silence. Nobody drops off the list. They move to a different pair of hands.
 *
 * The dispositions are proposals, not actions. Nothing here sends anything;
 * claiming otherwise would be the same lie as a toast that says "patient
 * notified" while sending nothing.
 */
import type { WorklistItem } from "@/hooks/useWorklist";

/**
 * Contacts in one clinic session, as an assumption rather than a fact.
 *
 * Twelve is roughly a three-hour session at fifteen minutes each, and it is
 * stated on screen precisely because it is a guess about someone else's day.
 * A tool that invents a capacity number and hides it is worse than one that
 * shows the number and lets the clinician disagree with it.
 */
export const DEFAULT_SESSION_CAPACITY = 12;

/**
 * Where the number actually comes from now.
 *
 * It began life as the constant above — an assumption about somebody else's
 * day, held in a file they could never reach. A facility states its own during
 * setup, so a solo rural health centre's line is drawn at six and a hospital
 * consultant's at twelve. The constant survives only as the fallback for rows
 * that predate the question being asked.
 */
export function capacityForFacility(f: { session_capacity?: number } | null | undefined) {
  return f?.session_capacity || DEFAULT_SESSION_CAPACITY;
}

/** Who picks this person up, if it is not the clinician looking at the list. */
export type Disposition = "you" | "nurse" | "message";

export type Allocated = {
  item: WorklistItem;
  disposition: Disposition;
};

export type Allocation = {
  capacity: number;
  /** Slots already gone: people this clinician has contacted today. */
  spent: number;
  /** What is left of the session. Never negative. */
  room: number;
  above: WorklistItem[];
  below: Allocated[];
  /**
   * True when more people are blocked on this clinician personally than the
   * session can hold. This is the number worth escalating with, so it is
   * surfaced rather than absorbed by silently truncating the list.
   */
  overCommitted: boolean;
};

/**
 * Where someone goes when the clinician has no room for them.
 *
 * A drifting reading or a critical score needs a human voice, so it goes to
 * the nurse's callback list. A high-but-steady score needs contact, not
 * judgement, so a check-in message is honest work rather than a fob-off.
 * Rank 0 never appears here — see below.
 */
function dispositionFor(rank: number): Disposition {
  return rank <= 3 ? "nurse" : "message";
}

export const DISPOSITION_LABEL: Record<Disposition, string> = {
  you: "You",
  nurse: "Nurse callback list",
  message: "Automatic check-in message",
};

export function allocateAttention(
  items: WorklistItem[],
  { capacity = DEFAULT_SESSION_CAPACITY, spent = 0 }: { capacity?: number; spent?: number } = {},
): Allocation {
  const room = Math.max(0, capacity - spent);

  /**
   * Rank 0 is somebody waiting on this clinician by name — an unanswered
   * referral, a hand-off nobody picked up. Those cannot be delegated to a
   * callback list, because the thing being waited on is this clinician's
   * decision. They take their slots first, and if they alone exceed the
   * session, the honest output is an over-committed day rather than a tidy
   * list that pretends otherwise.
   */
  const blocked = items.filter((i) => i.rank === 0);
  const rest = items.filter((i) => i.rank !== 0);

  const above = [...blocked, ...rest.slice(0, Math.max(0, room - blocked.length))];
  const below = rest
    .slice(Math.max(0, room - blocked.length))
    .map((item) => ({ item, disposition: dispositionFor(item.rank) }));

  return {
    capacity,
    spent,
    room,
    above,
    below,
    overCommitted: blocked.length > room,
  };
}

/** How many go to each pair of hands, for the summary line. */
export function countByDisposition(below: Allocated[]): Record<Disposition, number> {
  const counts: Record<Disposition, number> = { you: 0, nurse: 0, message: 0 };
  for (const b of below) counts[b.disposition] += 1;
  return counts;
}
