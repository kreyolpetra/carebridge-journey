/**
 * Privacy, in one place.
 *
 * These were two menu items — a consent ledger and an access log — sitting
 * next to each other and answering two halves of a single question: who *can*
 * read this record, and who actually *has*. Nobody thinks of those as separate
 * errands, so splitting them meant guessing which item held the half you
 * wanted, and often opening both.
 *
 * The switcher below is two buttons rather than a tab component. That is
 * deliberate: the one unexplained main-thread freeze in this app happens on a
 * tab, and a screen that exists to prove the product is trustworthy is the
 * wrong place to carry a known risk.
 */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, Eye } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Consent } from "@/components/governance/ConsentLedger";
import { AccessLog } from "@/components/governance/AccessHistory";

export const Route = createFileRoute("/_authenticated/consent")({
  head: () => ({
    meta: [
      { title: "Privacy — Who Can See This Record, and Who Has | CareBridge Journey" },
      {
        name: "description",
        content:
          "Consent grants, data-sharing agreements and the full access history — every read, its lawful basis, and every emergency override.",
      },
    ],
  }),
  // Optional, so the links that already point at /consent stay valid. Only
  // the redirect from the old access-log path sets it.
  validateSearch: (search: Record<string, unknown>): { view?: "access" } =>
    search["view"] === "access" ? { view: "access" } : {},
  component: Privacy,
});

function Privacy() {
  const { view } = Route.useSearch();
  const { role } = useAuth();
  const isPatient = role === "patient";
  const [tab, setTab] = useState<"permissions" | "access">(
    view === "access" ? "access" : "permissions",
  );

  const tabs = [
    {
      key: "permissions" as const,
      icon: ShieldCheck,
      label: isPatient ? "Who can see it" : "Consent & agreements",
    },
    {
      key: "access" as const,
      icon: Eye,
      label: isPatient ? "Who has looked" : "Access history",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-8">
      <div className="mb-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {isPatient ? "My privacy" : "Consent & access"}
        </h1>
        <p className="mt-1.5 text-[13.5px] text-muted-foreground">
          {isPatient
            ? "Who you have let in, and everyone who has actually opened your record."
            : "The permissions that grant access, and the log of every read taken under them."}
        </p>
      </div>

      <div className="mb-4 flex items-center gap-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
            className={
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors " +
              (tab === t.key
                ? "bg-primary/12 text-primary"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "permissions" ? <Consent /> : <AccessLog />}
    </div>
  );
}
