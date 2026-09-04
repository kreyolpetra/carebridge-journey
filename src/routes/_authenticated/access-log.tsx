import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Kept as a redirect, not deleted.
 *
 * The access history now lives as the second half of /consent, but this path
 * is linked from the chart, from notifications and from anything a patient may
 * have bookmarked. A dead link on the screen that proves the product respects
 * you would be a poor thing to ship.
 */
export const Route = createFileRoute("/_authenticated/access-log")({
  beforeLoad: () => {
    throw redirect({ to: "/consent", search: { view: "access" } });
  },
});
