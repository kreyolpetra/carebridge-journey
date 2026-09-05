/**
 * Access rules, under test.
 *
 * These are the rules that decide whether a person may see a record or let
 * somebody else see one. They were being asserted in comments and enforced by
 * whether a tab rendered, which is not enforcement — a tab is a suggestion and
 * a URL is not.
 *
 * The staff-confirmation cases exist because that click grants a human the
 * ability to open patient records, and it was available to every doctor. The
 * rule now says administrator, with two exceptions that stop a real clinic
 * being unable to add its own nurse — and exceptions are exactly the part that
 * needs cases, because they are how a tightened rule quietly becomes no rule.
 */
import type { EvalCase } from "./eval-harness";
import { mayConfirmStaff } from "@/lib/access";

const may = (tier: Parameters<typeof mayConfirmStaff>[0], joinedAdmin: boolean) =>
  mayConfirmStaff(tier, joinedAdmin);

export const accessCases: EvalCase[] = [
  {
    family: "permission",
    name: "an administrator may confirm a colleague",
    run: async () => (may("org_admin", true) ? null : "administrator was refused"),
  },
  {
    family: "permission",
    name: "a doctor may not, where an administrator exists",
    run: async () =>
      may("attending", true) ? "a doctor could grant record access with an admin present" : null,
  },
  {
    family: "permission",
    name: "a doctor may, where the facility has no administrator",
    run: async () =>
      may("attending", false) ? null : "a clinic with no admin cannot add its own nurse",
  },
  {
    family: "permission",
    name: "a nurse never may",
    run: async () => (may("nursing", false) ? "a nurse could grant record access" : null),
  },
  {
    family: "permission",
    name: "front desk never may",
    run: async () => (may("front_desk", false) ? "reception could grant record access" : null),
  },
  {
    family: "permission",
    name: "a consulting specialist never may",
    run: async () =>
      may("consulting", false) ? "a visiting specialist could grant record access" : null,
  },
  {
    family: "permission",
    name: "somebody with no tier at all never may",
    run: async () => (may(null, false) ? "an untyped account could grant record access" : null),
  },
  {
    family: "permission",
    name: "the administrator exception does not widen with no admin present",
    run: async () => {
      const wrong = (["nursing", "front_desk", "consulting", null] as const).filter((t) =>
        may(t, false),
      );
      return wrong.length ? `also allowed: ${wrong.join(", ")}` : null;
    },
  },
];
