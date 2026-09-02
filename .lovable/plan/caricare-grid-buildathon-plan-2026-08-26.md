# CariCare Grid — Buildathon Plan

**The front door to healthcare in the Caribbean.** One patient identity → one longitudinal record → one triage brain → one capacity-aware routing engine. Four surfaces on one backbone.

Scope: ~1 week, 2 builders, simulated WhatsApp (provider-agnostic so a real number can drop in at the end).

## Why this wins

Most teams will ship one isolated tool: a chatbot, or a dashboard. The brief explicitly says build the integrated system. We build the coordination layer and prove it with a single unbroken demo thread that touches all four surfaces.

Differentiators other teams almost certainly won't have:

- **Offline-first + SMS/USSD fallback path** — queued store-and-forward that syncs on reconnect. Hurricane season is real; this signals regional literacy.
- **Cross-border consent ledger** — every record access scoped, time-limited, patient-approved, and auditable. The real blocker to inter-island data sharing is legal, not technical.
- **Capacity-aware routing** — specialist minutes modeled as a scarce regional resource, load-balanced across islands, not a static directory lookup.
- **"Regional care retained" metric** — a live dollar figure for care that would have flown to Miami or London.
- **Rising-risk worklists** — risk scores don't just display, they generate a daily per-clinic outreach queue with the patient nudge pre-drafted.
- **Insurer incentive loop** — adherence streaks convert to premium credits. Business model, not grant project.
- **Multilingual + voice** — Caribbean English, Jamaican Patois, Spanish, Haitian Creole; voice notes for low-literacy and elderly patients.

## The four surfaces

### 1. Patient line (WhatsApp-style)
Pixel-accurate WhatsApp UI inside the app. Symptom intake, daily BP/glucose/medication logging, AI coaching on diet and adherence, refill reminders, streaks. Voice-note input. Everything a real WhatsApp session would do, driven by the same message-handler layer a real webhook would call.

### 2. Triage & routing engine
Intake → AI severity classification (emergency / urgent / routine / self-care) → routed to the right level of care against **real availability**: community nurse, local GP, island specialist, cross-island teleconsult. Shows why it routed there and what the wait would have been otherwise.

### 3. Clinician console
Escalation queue ranked by risk, not arrival time. Patient's longitudinal timeline assembled from fragmented sources. One-click teleconsult, cross-island referral, prescription back to the patient line. Consent status visible on every record pull.

### 4. Coordination dashboard (ministry / insurer)
Regional risk heatmap by island and parish, hospital and clinic capacity, medication stockout alerts, telemedicine queue depth, NCD trend analytics, and the regional-care-retained figure.

## Demo script (4 minutes, one thread)

1. Marlene, 58, rural Jamaica, sends a voice note in Patois: dizzy, headache, out of her pills.
2. Patient line transcribes, pulls her 30-day BP trend, flags a hypertensive-crisis pattern.
3. Triage classifies urgent. No cardiologist available on-island for 6 weeks.
4. Routing finds an available cardiologist in Trinidad. Consent request fires; Marlene approves in chat.
5. Teleconsult opens on the clinician console with her full timeline already assembled.
6. Plan and prescription push back to her chat; daily monitoring cadence increases automatically.
7. Dashboard ticks: one case retained in-region, risk cohort updated, stockout alert raised for her medication in her parish.
8. Cut to the offline scenario: connectivity drops, message queues, syncs on reconnect, nothing lost.

## Build order

**Days 1–2 — Backbone.** Enable Lovable Cloud. Schema: patients, vitals readings, conditions, medications, providers, facilities, specialist availability slots, consultations, referrals, consent grants, consent access log, alerts, messages, risk scores. RLS from the start with a separate roles table (patient / clinician / admin / insurer). Seed a realistic multi-island dataset via migration: ~8 islands, ~40 providers, ~300 patients with 90 days of vitals history so the analytics look alive.

**Day 3 — Patient line.** WhatsApp-style chat surface, message handler abstraction, AI conversation with structured extraction (vitals, symptoms, adherence) from free text and transcribed voice.

**Day 4 — Triage + routing.** Severity classifier, capacity-aware routing algorithm over the availability table, referral creation, consent request/grant flow.

**Day 5 — Clinician console.** Risk-ranked queue, longitudinal patient timeline, teleconsult view, referral accept/decline, prescribe-back-to-chat.

**Day 6 — Dashboard + risk engine.** Population risk scoring, heatmap, capacity and stockout panels, trend charts, care-retained metric, rising-risk worklist generation.

**Day 7 — The unfair extras + polish.** Offline queue and sync indicator, insurer incentive view, multilingual toggle, consent audit trail view, demo reset button, seeded "demo mode" that replays the script cleanly. Rehearse the demo end to end at least five times.

## Split between the two of you

- **Builder A:** backbone, patient line, triage and routing engine, AI layer.
- **Builder B:** clinician console, coordination dashboard, risk scoring, offline/consent/insurer extras.

Shared contract agreed on Day 1: the database schema and the shape of the triage result object. After that you can work in parallel without blocking each other.

## Technical notes

- Lovable Cloud for database, auth, and storage. Roles in a dedicated `user_roles` table with a security-definer check function — never on the profile row.
- AI via Lovable AI Gateway: triage classification, coaching replies, risk narrative summaries, all with structured output schemas so the UI never has to parse prose.
- Message layer written against a provider interface, so the simulated channel and a real WhatsApp/Twilio webhook are interchangeable.
- Risk scoring is a transparent, explainable model over vitals trend, adherence, age, comorbidities and access distance — judges will ask how it works, and "explainable" beats "black box" in a health context.
- Consent enforced in the data layer, not just the UI, so the audit log is real.

## Things to deliberately skip

Real WhatsApp Business approval, video calling infrastructure (use a convincing consult UI), wearable integrations, payment processing, and native mobile. None of them change whether you win; all of them can eat two days.
