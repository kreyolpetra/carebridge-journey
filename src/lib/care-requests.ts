/**
 * Turning a finding into something somebody can actually do.
 *
 * Two panels in this product identify work and then stop. Safety says a drug
 * has run out; the only button raised a review nobody fulfils. Results on
 * CareBridge says a repeat test would duplicate one CareBridge already holds, and
 * separately that a test is due — with no way to ask for it. Both were advice
 * into a void, which is worse than no advice: it teaches people that the panel
 * is a thing you read rather than a thing you use.
 *
 * A care request is deliberately not a prescription and not a lab order. This
 * is a coordination layer, not a dispensing system, and inventing prescribing
 * here would be claiming an authority the product does not have. What it does
 * is what a clinician actually does in a corridor: ask the person who can do
 * it, and leave a record that the asking happened.
 *
 * So a request names the item, the reason, who asked and when — and stays open,
 * visibly, until somebody closes it. An open request is a promise the service
 * has made to a patient, and the point of writing it down is that an unclosed
 * promise is countable.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { unwrap } from "@/lib/api";

export type CareRequestKind = "refill" | "test" | "review";

export type CareRequest = {
  id: string;
  patient_id: string;
  kind: CareRequestKind;
  /** The drug or the test, named the way a clinician would say it. */
  item: string;
  /** Why it was asked for — carried from the finding that raised it. */
  reason: string;
  requested_by_provider_id: string | null;
  requested_by_name: string;
  requested_at: string;
  /** "open" | "done" | "declined" */
  status: string;
  closed_at: string | null;
  closed_by_name: string;
  /** Why it was declined, when it was. */
  closed_note: string;
  created_at: string;
};

export const careRequestsQuery = queryOptions({
  queryKey: ["care_requests"],
  staleTime: 5_000,
  queryFn: async () =>
    unwrap<CareRequest[]>(
      await supabase
        .from("care_requests")
        .select("*")
        .order("requested_at", { ascending: false })
        .limit(1000),
    ),
});

export const KIND_LABEL: Record<CareRequestKind, string> = {
  refill: "Refill",
  test: "Test",
  review: "Review",
};

/** What the request is asking somebody to do, in the words they would use. */
export const KIND_ACTION: Record<CareRequestKind, string> = {
  refill: "Dispense and confirm",
  test: "Collect and send",
  review: "Look at this",
};

export async function raiseRequest(input: {
  patientId: string;
  kind: CareRequestKind;
  item: string;
  reason: string;
  providerId: string | null;
  providerName: string;
}) {
  const { error } = await supabase.from("care_requests").insert({
    patient_id: input.patientId,
    kind: input.kind,
    item: input.item,
    reason: input.reason,
    requested_by_provider_id: input.providerId,
    requested_by_name: input.providerName,
    requested_at: new Date().toISOString(),
    status: "open",
    closed_at: null,
    closed_by_name: "",
    closed_note: "",
  });
  if (error) throw new Error(error.message);
}

export async function closeRequest(input: {
  id: string;
  status: "done" | "declined";
  by: string;
  note?: string;
}) {
  const { error } = await supabase
    .from("care_requests")
    .update({
      status: input.status,
      closed_at: new Date().toISOString(),
      closed_by_name: input.by,
      closed_note: input.note ?? "",
    })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
}

/**
 * How long it has been open, in days.
 *
 * A refill request that is four days old in a parish 38 km from the pharmacy
 * is not paperwork — it is somebody who has been without their tablets since
 * Tuesday, so the age is shown rather than left to be worked out.
 */
export function ageDays(iso: string, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));
}

/** Open, and older than the service ought to leave it. */
export function isOverdue(r: CareRequest, now = Date.now()) {
  if (r.status !== "open") return false;
  // A refill is the urgent one: the patient has already run out by the time it
  // is raised. A test can reasonably wait a week.
  return ageDays(r.requested_at, now) >= (r.kind === "refill" ? 2 : 7);
}
