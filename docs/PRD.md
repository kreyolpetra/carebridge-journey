# CareBridge Journey — Product Requirements

**Version** 0.1 (draft) · **Updated** 30 August 2026 · **Status** Working prototype
**Context** Caribbean health buildathon · **Team** 2 builders · **Codebase** Island Health Connect

The front door to healthcare in the Caribbean. One patient identity, one longitudinal record,
one triage brain, and one capacity-aware routing engine — delivered over WhatsApp, governed by
a consent model built for cross-border care.

---

## Contents

1. [The problem](#1-the-problem)
2. [Product thesis](#2-product-thesis)
3. [Goals and non-goals](#3-goals-and-non-goals)
4. [Users and roles](#4-users-and-roles)
5. [The core loop](#5-the-core-loop)
6. [Surfaces and requirements](#6-surfaces-and-requirements)
7. [Triage and routing](#7-triage-and-routing)
8. [Access control and consent](#8-access-control-and-consent)
9. [Data model](#9-data-model)
10. [Architecture](#10-architecture)
11. [Coverage against the brief](#11-coverage-against-the-brief)
12. [Build status](#12-build-status)
13. [Success metrics](#13-success-metrics)
14. [Risks and open questions](#14-risks-and-open-questions)
15. [Out of scope](#15-out-of-scope)

---

## 1. The problem

Between 70% and 80% of deaths in the Caribbean come from non-communicable diseases —
principally diabetes, hypertension, and their cardiovascular and renal complications. The
regional health systems managing that burden are structurally fragmented in five specific ways:

- **Care is reactive.** Patients present in crisis rather than being monitored toward stability.
- **Specialist access is uneven.** A cardiologist may sit idle on one island while a patient two hours away by plane waits six weeks.
- **Records are fragmented or on paper.** A patient's history is scattered across clinics, hospitals, and jurisdictions that do not exchange data.
- **Early detection is largely absent.** Deterioration is visible in the data months before it is visible in a clinic.
- **Patients leave the region.** Care that could be delivered in-region is exported to Miami or London, taking its economic value with it.

The binding constraint is not clinical capability. It is **coordination**: there is no layer
connecting detection, access, and treatment across the region.

---

## 2. Product thesis

CareBridge Journey is a coordination layer, not a point tool. Its wager is that the four things
every team builds separately — a chatbot, a triage model, a referral directory, a dashboard —
are only valuable when they are the same system operating on one shared record.

Three commitments distinguish it from a well-built single-island app:

- **Specialist capacity is a scarce regional resource.** Routing scores every clinician in the region against a clinical time window, not a static directory lookup on the patient's own island.
- **The legal blocker is treated as a product surface.** Cross-border record sharing fails on consent and jurisdiction, not on technology. The consent model is a first-class feature with its own specification (§8).
- **WhatsApp is the client.** No app to install, no account to create, no smartphone assumptions beyond a channel patients already use daily.

> **The one-line pitch.** A patient in rural Jamaica sends a voice note in Patois. Ninety
> seconds later she has a cardiology teleconsult booked in Trinidad, her record has legally
> crossed a border with her approval, and a ministry dashboard has ticked one case retained
> in-region.

---

## 3. Goals and non-goals

### Goals

- Demonstrate one unbroken thread from patient message to booked cross-island teleconsult, touching every surface without a seam.
- Make the triage decision **explainable** — every classification shows the data it used and the rule it applied.
- Make the routing decision **auditable** — show why this clinician, what the local wait would have been, and who the runners-up were.
- Make record access **accountable** — every read resolves to exactly one lawful basis and writes an append-only log entry the patient can read.
- Run credibly with degraded infrastructure: no AI gateway, no connectivity, no smartphone.

### Non-goals

- **Not a hospital information system.** No bed management, staff rostering, billing, or theatre scheduling. Facility data enters as a capacity signal, not an operations surface.
- **Not an EHR replacement.** CareBridge reads from and writes to existing systems through an open API; it does not attempt to become the system of record for a hospital.
- **Not a diagnostic tool.** Triage classifies urgency and routes to a level of care. It never diagnoses in a patient-facing message.
- **Not a pharmacy or logistics system.** Stock levels are consumed as signal; replenishment is out of scope.

---

## 4. Users and roles

Five roles, each with a distinct surface set. Role determines navigation, data scope, and what
a given read is allowed to return.

| Role | Demo persona | Primary need | Sees |
|---|---|---|---|
| **Patient** | Marlene Campbell · 58F, rural St. Elizabeth, Jamaica | Get an answer and a plan without travelling or paying | Own record, care line, consent controls, access log |
| **Clinic staff** | Sister Yvette Marshall · nurse, Jamaica Community Clinic | See the whole patient, including care given elsewhere | Facility console, escalation queue, records on-ramp |
| **Clinician** | Dr. Anand Rampersad · cardiologist, Trinidad General | Work a queue ranked by deterioration risk, not arrival time | Clinician console, teleconsults, referrals, prevention, detection |
| **Ministry** | Nadine Joseph · Regional NCD Coordination Unit | See where risk, capacity, and stockouts are concentrating | Coordination dashboard, aggregate population view |
| **Insurer** | Kevon Charles · Caribbean Mutual Health | Price risk from live data instead of actuarial tables | Insurer engine, consent-gated member scope |

> ⚠️ **Known gap in the current build.** The Ministry role can currently open the identified
> clinician console, which contradicts the aggregate-only rule in §8. This is a
> navigation-permission bug, not a design decision — see §12.

---

## 5. The core loop

Every surface in the product exists to serve one loop. A message arrives, it is classified
against the patient's own history, it is routed against real capacity, a legal basis is
established, care is delivered, and the system's aggregate picture updates.

```
01 Intake  →  02 Triage  →  03 Route  →  [ 04 Consent gate ]  →  05 Consult  →  06 Plan back  →  07 Aggregate
```

| Step | What happens |
|---|---|
| 01 Intake | WhatsApp text or voice, in the patient's own language variety |
| 02 Triage | Severity against this patient's trend, with red flags and rationale |
| 03 Route | Scored across the region on time-to-slot, load, and language |
| **04 Consent gate** | Cross-border access resolves to a lawful basis before any read |
| 05 Consult | Clinician opens an assembled longitudinal chart |
| 06 Plan back | Prescription and monitoring cadence return to the care line |
| 07 Aggregate | Risk cohort, capacity, and care-retained figures update |

### Reference journey

The demo thread, and the acceptance test for the whole system:

1. **Marlene, 58, rural Jamaica**, sends a message: headache, blurred vision, out of her pills.
2. The care line reads it against her **30-day blood-pressure trend** and flags a hypertensive-crisis trajectory.
3. Triage classifies **urgent**. No cardiologist is available on-island inside the clinical window.
4. Routing finds an **available cardiologist in Trinidad** and states what the local wait would have been.
5. A **consent request** fires; Marlene approves it in chat, and the grant is scoped and time-bounded.
6. The teleconsult opens on the clinician console with her **timeline already assembled** from three facilities.
7. Plan and prescription **push back to her care line**; monitoring cadence increases automatically.
8. The dashboard ticks: **one case retained in-region**, risk cohort updated, stockout alert raised for her medication in her parish.

---

## 6. Surfaces and requirements

Ten surfaces on one backbone. Status reflects the current build, verified in-browser against
the running prototype.

### 6.1 Patient care line · `/patient` · P0 · ✅ Built

A WhatsApp-faithful thread inside the app, driven by the same message-handler layer a real
webhook would call. This is the patient's entire interface to CareBridge.

- Free-text and quick-action intake: log blood pressure, log glucose, report out of medication, send a voice note
- Structured extraction of vitals, symptoms, and adherence from unstructured text
- Replies written in the patient's language variety — Caribbean English, Jamaican Patois, French-lexicon Creole, Spanish
- Booking confirmations and consent requests arrive in-thread

### 6.2 Triage engine · `lib/triage` · P0 · ⚠️ Degrades without a gateway key

Classifies an inbound message into `emergency`, `urgent`, `routine`, or `self_care` plus a
recommended level of care, weighed against the patient's own baseline rather than population
averages.

- Structured output schema so the UI never parses prose
- Deterministic rule-based fallback when no AI gateway key is present — the system states it is in degraded mode rather than failing
- Conservative by design: island patients may be hours from care, so under-triage is treated as more dangerous than over-triage

### 6.3 Routing engine · `lib/routing` · P0 · ✅ Built

Matches an escalation to real availability across all eight islands. Detailed in §7.

### 6.4 Clinician console · `/clinician` · P0 · ✅ Built

An escalation queue ordered by deterioration risk rather than arrival time, with the patient's
assembled longitudinal record beside it.

- Risk-banded queue with score, trend direction, and parish
- Patient detail: conditions, medications with adherence and days-of-supply, blood-pressure and glucose charts from home readings
- Transparent risk drivers — each contributing factor and its point weight
- Break-glass emergency access with justification capture

### 6.5 Facility console · `/facility` · P1 · ✅ Built

The institutional view: which patients this hospital or clinic has an open episode with, which
records were captured elsewhere, staff postings, and the data-sharing agreements the facility
operates under.

### 6.6 Prevention engine · `/prevention` · P1 · ✅ Built

Turns a cohort rule into an outreach campaign with the patient message pre-drafted — the
mechanism that makes care proactive rather than reactive.

- Cohort rules over condition, risk score, days since last reading, adherence, rurality, and age
- Per-target status tracking: queued, sent, responded, booked, reading captured
- WhatsApp and SMS channels

### 6.7 Early detection · `/detection` · P1 · ✅ Built

Compares each patient's last 10 days against their prior 30 and raises a signal when a metric
moves materially — blood pressure, glucose, medication supply, or adherence — with a narrative
and a recommended action.

### 6.8 Records on-ramp & open API · `/interop` · P1 · ◐ Partial

The answer to "most of the region's records are on paper." A photographed clinic card or faxed
lab report is read into structured, chartable fields that a clerk reviews before they touch the
record.

- Extraction never invents a value; illegible fields stay empty and are keyed manually
- Read-only FHIR endpoints (`Patient`, `Observation`, `metadata`) for EMR bridges
- Scoped API clients with call volumes and last-used timestamps

### 6.9 Coordination dashboard · `/dashboard` · P0 · ✅ Built

The ministry and hospital-network view: chronic disease framed as a supply-and-demand problem
across eight islands.

- Island health grid — average risk, monitored patients, bed occupancy, clinician counts, and named specialty gaps
- Live clinical, supply, and capacity alerts
- Medication days-of-cover by facility
- Demand versus supply by specialty; referrals routed per week
- **Care retained in-region** — a currency figure for care that did not leave

### 6.10 Insurer engine · `/insurer` · P2 · ✅ Built

The sustainability argument: adherence streaks convert to premium credits, and risk recomputes
daily from real vitals rather than an actuarial table written before regional diabetes
prevalence doubled.

---

## 7. Triage and routing

### Triage thresholds

The rule-based path — which is what runs when no AI gateway is configured — encodes conventional
clinical thresholds so the behaviour is inspectable and reproducible:

- Systolic ≥ 180 or diastolic ≥ 120 *with* symptoms (headache, dizziness, visual change, chest pain, breathlessness) → **hypertensive emergency**
- Chest pain, one-sided weakness, slurred speech, or severe breathlessness → **always emergency**
- Glucose > 15 mmol/L with symptoms, or < 3.5 mmol/L → **urgent**
- Running out of antihypertensive or antidiabetic medication on a rising trend → **escalates urgency one level**

### Routing score

Every clinician in the region is scored, then ranked. The chosen match and its three runners-up
are shown with the reasoning attached, so the decision can be challenged.

| Factor | Effect on score | Why it is in the model |
|---|---|---|
| Time to next open slot | Up to +120, −90 if outside the window | Severity sets a clinical window: 4h emergency, 72h urgent, 14d routine |
| Existing booked load | −0.45 per percentage point | Specialist minutes are the scarce regional resource being allocated |
| On-island | +22 | Avoids a cross-border consent step entirely |
| Language match | +14, else −18 | Patois, Kwéyòl, and Spanish speakers should not need an interpreter by default |
| Specialty substitution | −25 | Internal medicine covering an absent specialty is allowed but penalised |

Each routed referral records **wait days avoided** and a **retained value** figure — the cost of
the overseas trip the routing replaced, scaled by specialty. These aggregate into the ministry
and insurer views.

---

## 8. Access control and consent

The real blocker to inter-island record sharing is legal, not technical. This model is the
product's central differentiator and has its own full specification in
[`access-control-spec.md`](./access-control-spec.md); what follows is the summary.

### Five lawful bases

Every read resolves to exactly one basis, recorded on the log row. There is no unlogged read path.

| Basis | Applies to | Patient action |
|---|---|---|
| Treating relationship | Care at a facility with an open episode | None |
| Institutional agreement | Recurring inter-facility pipelines under an executed DSA | None — notified, may opt out |
| Patient consent grant | Ad hoc, discretionary, or cross-border access | Explicit approval |
| Break-glass | Life-threatening emergency with no other basis | Notified after, within one hour |
| Patient self-access | Patient reading their own record | N/A |

> **Why two kinds of permission.** Asking a patient to tap "approve" for every transfer in a
> standing Kingston→Port of Spain cardiology pipeline protects no one — they were clinically
> referred into that pathway, and consent fatigue teaches people to approve everything.
>
> Recurring relationships run on a signed institutional agreement: named purpose, named
> specialties, a hard expiry of at most 24 months, annual review, no onward transfer, and an
> individual opt-out. Genuinely discretionary access stays under the patient's explicit control.

### Bounded treating windows

A treating relationship is an episode-scoped window with an expiry, not a permanent flag. One
A&E visit does not grant a hospital indefinite access. Windows reopen on any genuine return
visit and are capped at 365 days without a new event.

| Facility type | Post-episode window |
|---|---|
| ED / A&E | 7 days after discharge |
| Acute inpatient hospital | 30 days after discharge |
| Outpatient / specialist clinic | 90 days after last visit |
| Primary care / community clinic | 365 days, rolling |
| Pharmacy | 30 days from last fill |
| Lab / imaging | 14 days from result release |

### Sensitive categories

Mental health, HIV status, sexual and reproductive health, substance use, sexual-violence
documentation, genetic risk, and adolescent confidential services are each tagged and gated
independently. An active care relationship is *not* sufficient to open them.

A clinician who cannot see a section is shown that a restricted section exists rather than a
chart that silently looks complete — **redaction, not concealment**. Allergies and active
medications derived from a sensitive record still surface in the general list without their
indication, so prescribing stays safe.

### Patient-facing access log

"Who has looked at my record" is a standalone transparency surface, deliberately not reachable
only through the consent screen — because transparency is not a permission control. It is
append-only with no update or delete path for any role, shows denied attempts alongside
successful reads, and is never filtered by basis.

---

## 9. Data model

Thirty-one tables across six domains. Names below match the schema.

| Domain | Tables |
|---|---|
| Geography & capacity | `islands`, `facilities`, `providers`, `availability_slots`, `stock_items` |
| Clinical record | `patients`, `conditions`, `medications`, `vitals`, `encounters`, `consultations`, `clinical_documents` |
| Coordination | `messages`, `triage_events`, `referrals`, `risk_scores`, `alerts`, `detection_signals` |
| Governance | `consent_grants`, `consent_access_log`, `data_sharing_agreements`, `sensitive_grants`, `care_team_members`, `break_glass_events`, `treating_window_policies` |
| Prevention | `screening_campaigns`, `campaign_targets` |
| Identity & integration | `profiles`, `user_roles`, `facility_staff`, `api_clients` |

### Risk scoring

A transparent, explainable additive model — chosen over a black box because judges and
clinicians will both ask how it works. Six weighted drivers, each capped so no single factor
dominates:

| Driver | Max points |
|---|---|
| Blood pressure, 14-day average | 32 |
| Glucose, 14-day average | 20 |
| Medication adherence | 18 |
| Age | 12 |
| Comorbidity count | 12 |
| Distance to nearest facility | 6 |

Totals band into **low** (<32), **moderate** (32–49), **high** (50–67), and **critical** (68+),
with a rising, stable, or improving trend derived from the prior 14-day window. Every score
renders with its drivers itemised.

---

## 10. Architecture

| Layer | Choice | Note |
|---|---|---|
| Framework | TanStack Start · React 19 · TypeScript | File-based routing, server functions |
| Styling | Tailwind v4 · Radix primitives | All colour as oklch tokens; components never hardcode |
| Charts | Recharts | Vitals trends, capacity, referral volume |
| Data layer | In-memory mock backend | Postgres schema and RLS policies retained as migrations |
| AI | Gateway with structured output | Rule-based fallback when unconfigured |
| Messaging | Provider-interface abstraction | Simulated channel and a real webhook are interchangeable |

> **Current prototype state.** The app runs entirely in the browser against a seeded in-memory
> dataset — 8 islands, ~75 facilities and providers, 123 patients with 90-day vitals histories,
> referrals, consent grants, and campaign history. No database, no API keys, no accounts to
> provision.
>
> The original Postgres schema, row-level-security policies, and Postgres functions remain in
> `supabase/migrations/`. The mock reimplements `compute_risk` and `detect_trend` in TypeScript
> against the same inputs, so restoring a real backend is a client swap rather than a rewrite.

### Resilience requirements

- **Offline-first.** Messages queue locally and sync on reconnect. Hurricane season is a real operating condition, not an edge case.
- **Degraded-mode honesty.** When the AI gateway is unavailable the system says so in the UI and falls back to deterministic rules, rather than silently producing worse output.
- **Low-bandwidth first.** The patient surface must work on a feature phone over SMS as well as on WhatsApp.

---

## 11. Coverage against the brief

The brief lists nine possible modules and separately states that the winning shape is a single
integrated system: WhatsApp intake, AI triage, telemedicine routing, chronic disease management.
Coverage is deliberate rather than exhaustive.

| # | Module | Coverage | Rationale |
|---|---|---|---|
| 01 | Pan-Caribbean telemedicine network | **Core** | Cross-island specialist pool, capacity-aware scheduling, referral routing |
| 02 | AI chronic disease management | **Core** | The primary loop — monitoring, coaching, escalation |
| 03 | Early detection & risk scoring | **Core** | Trend detector plus the population risk model |
| 04 | Triage & routing engine | **Core** | Severity classification into capacity-aware routing |
| 05 | Record interoperability layer | Partial | Longitudinal profiles, consent infrastructure, and read-only FHIR — full cross-island exchange needs real data-sharing agreements |
| 06 | Coordination dashboard | **Core** | Capacity, stockouts, queue depth, trend analytics |
| 07 | Health data cooperative | Excluded | Deliberate. Data resale invites exactly the regulatory scrutiny the consent model exists to withstand |
| 08 | Digital-first insurance engine | Partial | Adherence-linked premium credits built; underwriting is not |
| 09 | Clinical workflow optimisation | Excluded | Hospital-internal operations. A different problem domain from coordination |

---

## 12. Build status

Verified in-browser across all five personas and roughly twenty routes.

### Working

- [x] All five demo personas sign in and land on a role-correct surface
- [x] Patient care line: message → triage → routing → booking, end to end
- [x] Consent approve and revoke, writing through to the access log immediately
- [x] Clinician console with live risk queue, charts, and itemised risk drivers
- [x] Coordination dashboard, insurer engine, prevention, detection, facility console, records on-ramp
- [x] Data persists across reloads; a mock realtime channel drives live updates

### Partial or simulated

- [ ] **AI triage** runs in rule-based degraded mode — no gateway key configured
- [ ] **Access control v2** is fully specified and modelled in the schema, but enforcement is not yet wired end to end
- [ ] **Break-glass** exists as a control and a seeded historical event; the review-queue workflow is not built
- [ ] **Teleconsult** is a convincing consult UI, not real video infrastructure

### Known defects

- [ ] Ministry role can open the identified clinician console, contradicting the aggregate-only rule (§4)
- [ ] Original RLS policies are demo-open (`USING (true)`) — acceptable for a prototype, unacceptable for a pilot
- [ ] A React hydration warning appears on first paint; cosmetic, no functional impact

---

## 13. Success metrics

### Demo

- The reference journey (§5) runs end to end in under four minutes without a reset
- Every screen shown carries live data derived from the seeded dataset, not static mockup content
- The offline scenario demonstrates queue-and-sync with nothing lost

### Pilot

- **Time to specialist** — median days from escalation to consult, against the local-wait baseline
- **Check-in adherence** — proportion of enrolled patients returning a reading each week
- **Care retained in-region** — currency value of consults that did not become overseas trips
- **Detection lead time** — days between first trend signal and clinical contact
- **Access-log integrity** — every identified read carries exactly one lawful basis; zero unlogged reads

---

## 14. Risks and open questions

| Risk | Assessment | Mitigation |
|---|---|---|
| Clinical safety of AI triage | Under-triage causes harm; a hallucinated reassurance is the worst failure mode | Conservative thresholds, deterministic fallback, never diagnose in patient-facing copy, clinician review before any escalation closes |
| Regulatory approval for cross-border sharing | The genuine blocker; no technical fix exists | DSA instrument modelled on standard contractual clauses, bounded and reviewable, designed to be shown to a regulator rather than worked around |
| WhatsApp Business approval | Timeline outside the team's control | Provider-interface abstraction; a real number drops in without touching the message-handler layer |
| Dialect quality | A caricatured Patois reply destroys trust faster than an English one | Language guidance written as "how a local health worker would text"; needs native-speaker review before any pilot |
| Specialist supply-side adoption | Routing is worthless without clinicians who accept cross-island referrals | Open question. Likely requires an institutional agreement and a payment mechanism before a pilot |

### Open questions

- Who is the first paying customer — a ministry, a single insurer, or a regional body such as CARPHA?
- What is the smallest credible pilot: one condition, one parish, ninety days?
- Does the insurer premium-credit mechanism survive contact with an actual underwriter?
- Which jurisdiction's data-protection regime governs a record that exists in three countries at once?

---

## 15. Out of scope

Deliberately excluded. Each is defensible on its own terms, and each would consume days without
changing whether the core loop is convincing.

- **Real WhatsApp Business approval** — timeline is outside the team's control
- **Video calling infrastructure** — a consult UI carries the demo
- **Wearable integrations** — home cuff readings entered by the patient cover the same ground
- **Payment processing** — the revenue model can be argued without a checkout
- **Native mobile** — the entire premise is that patients need no app
- **Hospital operations** (beds, rostering, theatre scheduling) — module 09, a different product

---

*Product requirements v0.1 · draft for team review. Status claims in §12 reflect in-browser
verification of the running prototype. Access-control model summarised from
[`access-control-spec.md`](./access-control-spec.md). All patient data referenced in this
document is synthetic.*
