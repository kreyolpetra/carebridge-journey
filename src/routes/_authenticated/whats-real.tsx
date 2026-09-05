/**
 * What in here is real, what is a prop, and what was never built.
 *
 * Every screen carries a strip saying this is a prototype on synthetic data.
 * That is the right thing to say and not enough of it: "synthetic data" tells
 * you the patients are invented and nothing about whether the safety engine
 * runs, whether the video call is a video call, or whether the thing you just
 * clicked wrote anything down.
 *
 * With operators and institutions in the room, the useful move is the opposite
 * of a pitch: name precisely what is real, precisely what is staged, and
 * precisely what is missing — before anybody has to ask. A demo that survives
 * that conversation is worth more than one that avoids it, and the list is
 * short enough to read in two minutes.
 *
 * This page is deliberately reachable from the disclaimer itself, so the claim
 * and its detail are one click apart rather than one in the product and one in
 * a slide nobody opens.
 */
import { createFileRoute } from "@tanstack/react-router";
import { Check, CircleDashed, Wrench, ExternalLink } from "lucide-react";
import { Panel, PanelHeader, Pill, SectionTitle } from "@/components/grid";

export const Route = createFileRoute("/_authenticated/whats-real")({ component: WhatsReal });

type Row = { what: string; note: string };

const REAL: Row[] = [
  {
    what: "Access control",
    note: "Six lawful bases resolve before a record opens. Refusals are logged and shown to the patient, break-glass is allowed and recorded loudly, and the console refuses a sealed chart even by direct URL.",
  },
  {
    what: "Consent and the access log",
    note: "Grants can be given and revoked, and every read — including refused attempts — is written down and readable by the patient.",
  },
  {
    what: "Referrals, discharge and escorts",
    note: "Raising, accepting, handing back and chasing all write to the record, and each one messages the patient on the care line in their own language.",
  },
  {
    what: "The safety engine",
    note: "Allergy conflicts, duplicate therapy, supply gaps and monitoring gaps are computed from the record on every chart open, graded into three tiers, and a hard stop needs a second clinician.",
  },
  {
    what: "Consult notes and care requests",
    note: "A visit can be closed with a note that the next clinician reads, and a finding can be turned into a request that stays open, ages, and has to be closed by somebody.",
  },
  {
    what: "The agents and their evidence",
    note: "Three agents run on every use, each producing a tool trace with consent refusals and a confidence figure. 39 evaluation cases run with one command and fail the build.",
  },
  {
    what: "Paper digitisation",
    note: "A photographed or pasted record is read, reviewed and committed by a human, filed under the date on the document rather than the date it was scanned.",
  },
  {
    what: "Reports and printing",
    note: "Every role has a report built from the live record, with a real print stylesheet behind it.",
  },
];

const STAGED: Row[] = [
  {
    what: "All patient data",
    note: "Every patient, clinician, facility, reading, message and referral is generated. Nobody in here is real, and no real record has ever been in this system.",
  },
  {
    what: "The video and voice consult",
    note: "A convincing consult interface with no media layer behind it. There is no call. It is a prop, and the demo says so rather than letting somebody assume otherwise.",
  },
  {
    what: "The agents' judgement step",
    note: "Deterministic rules, not a language model — stated on every trace and in the palette footer. The seam a model would plug into is real code (lib/agents/model.ts); the model is not there because there is no GPU and no key that could safely ship in a static file.",
  },
  {
    what: "Staff invitations",
    note: "Setup writes the roster and prepares invitations. Nothing is sent. Access still requires the person to register with their own licence number and be confirmed.",
  },
  {
    what: "Care requests",
    note: "An ask, not a prescription and not a lab order. This is a coordination layer and does not claim dispensing authority it has not got.",
  },
  {
    what: "The offline queue",
    note: "Genuinely queues and replays the care line and home readings, and the pill counts what is actually waiting. It lives in memory, so a page reload loses it, and reads still fail normally.",
  },
  {
    what: "The hurricane",
    note: "The closed clinic and its displaced patients are a seeded scenario. The behaviour it demonstrates — that a record survives the building — is real.",
  },
  {
    what: "CSV export inside a shared link",
    note: "Downloads work when the app is run locally. The artifact viewer never grants a page download permission, so those buttons do nothing for anyone opening the shared link.",
  },
];

const MISSING: Row[] = [
  {
    what: "Four of the seven planned agents",
    note: "Nursing copilot, evidence retrieval, follow-up and privacy are named in the plan and not built. Three are.",
  },
  {
    what: "Prescribing and lab ordering",
    note: "Out of scope on purpose — the product raises a request for somebody who can, rather than pretending to an authority it does not have.",
  },
  {
    what: "Specialty-scoped chart sections",
    note: "A consulting specialist should see the sections relevant to their specialty. Encounters carry no specialty, so the tier gate is coarser than the spec asks for.",
  },
  {
    what: "Agreement scope enforcement",
    note: "A data-sharing agreement declares a specialty, resource and tier scope. The resolver honours the agreement but not yet the narrower scope inside it.",
  },
  {
    what: "Translated clinical screens",
    note: "The patient's own screens are in their language. The clinical console is English, which is a deliberate stopping point rather than an oversight.",
  },
];

function List({
  title,
  subtitle,
  rows,
  tone,
  icon: Icon,
}: {
  title: string;
  subtitle: string;
  rows: Row[];
  tone: string;
  icon: typeof Check;
}) {
  return (
    <Panel className="mb-4">
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            <Icon className={"h-4 w-4 " + tone} />
            {title}
          </span>
        }
        subtitle={subtitle}
        right={
          <Pill className="border-border bg-surface text-muted-foreground">{rows.length}</Pill>
        }
      />
      <div className="divide-y divide-border">
        {rows.map((r) => (
          <div key={r.what} className="px-5 py-3">
            <p className="text-[13.5px] font-semibold">{r.what}</p>
            <p className="mt-1 max-w-[78ch] text-[12.5px] leading-relaxed text-muted-foreground">
              {r.note}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function WhatsReal() {
  return (
    <div className="mx-auto w-full max-w-[1000px] px-5 py-8">
      <SectionTitle
        eyebrow="Before you ask"
        title="What is real, what is staged, and what is missing"
        blurb="The strip at the top of every screen says this is a prototype on synthetic data. That is true and not detailed enough to be useful, so here is the whole of it."
      />

      <div className="mb-5 rounded-xl border border-accent/40 bg-accent/8 px-4 py-3 text-[13px] leading-relaxed">
        Nothing on this page is a disclaimer in the legal sense. It is the list we would want if we
        were the ones being sold to — and a demo that survives this conversation is worth more than
        one that avoids it.
      </div>

      <List
        title="Real — it runs, and it writes to the record"
        subtitle="Click it and something happens that the next person can see"
        rows={REAL}
        tone="text-low"
        icon={Check}
      />
      <List
        title="Staged — it is there to show the shape of the thing"
        subtitle="Working interface, no production system behind it"
        rows={STAGED}
        tone="text-high"
        icon={CircleDashed}
      />
      <List
        title="Not built — named here rather than discovered later"
        subtitle="Some of it deliberately out of scope, some of it simply unfinished"
        rows={MISSING}
        tone="text-muted-foreground"
        icon={Wrench}
      />

      <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-muted-foreground">
        <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Everything above was checked against the source rather than remembered. Where a claim and
        the code disagreed while this page was being written, the code won and the claim changed.
      </p>
    </div>
  );
}
