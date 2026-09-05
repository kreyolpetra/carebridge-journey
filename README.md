# CareBridge Journey

A shared clinical record for Caribbean health systems: one patient record readable across
11 countries, governed by consent, and built to keep working on the days the system does not —
the storm, the blackout, the closed clinic, the paper card, the language nobody translated.

Built for the FutureCaribbean buildathon.

**[Open the live prototype →](https://claude.ai/code/artifact/35ebaadb-1668-4233-a0d1-a1b594af2257)**
No install, no backend, no sign-up. Pick any of the five demo accounts on the sign-in screen.

---

## Read this part first

The product carries its own page — **What is real** — reachable in one click from the disclaimer
strip on every screen. It lists what runs, what is staged, and what was never built, because a
demo that survives that conversation is worth more than one that avoids it.

The short version:

|               |                                                                                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Real**      | Access control, consent and the access log, the safety engine, referrals, discharge and escorts, consult notes and care requests, paper digitisation from typed text, offline write queueing, on-device dictation, printable reports |
| **Staged**    | All patient data is synthetic. The video consult is a prop. The agents' judgement step is deterministic rules, not a language model. A photographed card is stored, not read.                                                        |
| **Not built** | Four of seven planned agents, prescribing and lab ordering (out of scope on purpose), specialty-scoped chart sections                                                                                                                |

Nobody in this system is real, and no real patient record has ever been in it.

---

## What it does

- **A record that outlives the building.** When a clinic closes, its patients are marked displaced
  and remain treatable anywhere else the same afternoon.
- **Scarce specialist time allocated by need.** The worklist has an explicit session capacity and
  draws a cut line, and says how many people were handed elsewhere rather than hiding them.
- **Six lawful bases** resolve before any record opens — self, treating, institutional agreement,
  consent, break-glass, none. Every read is logged, including the refusals, and the patient can
  read that log.
- **A safety engine across institutions**: allergy conflicts, duplicate therapy, supply gaps and
  monitoring gaps, computed on every chart open and graded into three tiers. A hard stop needs a
  second clinician.
- **Four patient languages** — English, Jamaican Patois, Haitian Kreyòl, Spanish.
- **Survives losing power, not just signal.** Writes are queued as serialisable intents persisted
  to the device, so they outlive a crash or an outage and replay on return. Reads are deliberately
  never served stale.

---

## Running it locally

```sh
npm install
npm run dev          # http://localhost:8080
```

There is no backend to configure. `src/integrations/supabase/client.ts` is swapped to an in-memory
mock (`src/lib/mock/`) that reseeds from `buildSeed()` on load, so the whole product runs standalone.

```sh
npm run build:spa    # single self-contained HTML file in dist-spa/
npm run eval:agents  # 61 checks across 5 suites; non-zero exit on failure
```

`dist-spa/carebridge-journey-artifact.html` is the entire prototype in one file. Download it and
open it in a browser — no server needed.

---

## How it is put together

- **TanStack Start / Router**, React 19, Tailwind v4, shadcn/ui
- **`src/lib/access.ts`** — the lawful bases and care tiers. Access questions are answered here,
  not in components.
- **`src/lib/agents/`** — three agents, each producing a tool trace showing what it read and what
  consent refused. `model.ts` is the seam a hosted model plugs into: a real interface with two
  implementations, and the memory argument written next to the thing that needs the memory.
- **`src/lib/mock/`** — the in-memory Postgres-shaped backend and the seed.
- **`npm run eval:agents`** — evaluation suites for the agents, the paper reader and the access
  rules. They fail the build rather than printing a warning.

---

## Honest limits

The agents are deterministic rules rather than a language model. That is a choice, not an
omission: a reviewer can ask "why did it say that" and get a rule and a data point back, and there
is no GPU and no key that could safely ship inside a static file anyone can open. Swapping in a
model changes one assignment in `src/lib/agents/model.ts` and nothing else — the consent filtering
happens before the judgement, so a model swap changes the quality of the advice and none of the
guarantees around it.

The clinical console is English. Patient-facing surfaces are not.

Reading a photographed record needs a vision model that is not here. Type or paste what the card
says and it is genuinely parsed — conditions with their year, drugs with dose and frequency,
vitals, labs with units, allergies — reviewed by a human before anything touches a chart.
