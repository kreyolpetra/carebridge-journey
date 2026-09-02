# CariCare Grid — Access Control Specification v2

Scope: cross-border clinical record access between Jamaican and Trinidadian
facilities on the Grid. Supersedes the v1 model ("consent grant OR treating
facility, indefinite, facility-wide").

v1 had four defects: one lawful basis doing two jobs, an unbounded treating
relationship, no sensitive-category segmentation, and audit visibility that
was a side effect of the consent ledger rather than a patient right.

---

## 1. Lawful bases for access

Five bases. Every read resolves to exactly one, recorded on the access log row.

| Basis | Code | Applies to | Patient action |
|---|---|---|---|
| Treating relationship | `treating` | Care at a facility with an open episode | None |
| Institutional agreement | `institutional` | Recurring inter-facility pipelines under an executed DSA | None (notified, opt-out) |
| Patient consent grant | `consent` | Ad hoc, one-off cross-border access | Explicit approval |
| Break-glass | `break_glass` | Life-threatening emergency, no other basis | Notified after |
| Patient self-access | `self` | Patient reading own record | N/A |

### 1.1 Institutional vs. per-patient consent — which pattern goes where

The distinction is **structural vs. ad hoc**, not domestic vs. cross-border.

Falls under an **institutional data-sharing agreement (DSA)**:
- Standing referral pipelines (Kingston Public → Trinidad General cardiology).
- Regional specialty hubs serving multiple islands (single oncology or
  nephrology centre of excellence).
- Teleconsult rosters where a named provider set covers a named facility set.
- Continuity-of-care follow-up: discharging facility reads outcomes back from
  the receiving facility for the same episode.
- Ministry-level de-identified surveillance extracts (aggregate only, never
  identified chart reads).

Requires a **per-patient consent grant**:
- A single specialist requesting a second opinion outside any DSA.
- Any read by a facility with no open episode and no DSA covering the pattern.
- Research, insurance underwriting, employer, or legal-proceeding access.
- Any access to a **sensitive category** (§3), regardless of DSA or episode.
- Any cross-border access initiated by the receiving side before the patient
  has presented there (pre-referral record pull).

### 1.2 DSA object model

A DSA is a first-class record, not a config flag. Modeled on EU standard
contractual clauses / binding corporate rules, adapted to CARICOM bilateral
practice.

```
data_sharing_agreements
  id
  name                     -- "KPH ↔ TTGH Cardiology Referral Pipeline"
  origin_facility_id       -- exporter
  partner_facility_id      -- importer
  origin_jurisdiction      -- 'JM'
  partner_jurisdiction     -- 'TT'
  purpose                  -- narrow, enumerated; not "care"
  clinical_scope           -- specialty codes the pipeline covers
  data_scope               -- array of resource categories permitted
  sensitive_categories_permitted  -- default '{}' (see §3)
  role_tiers_permitted     -- which tiers at the partner may read (§4)
  onward_transfer_allowed  -- boolean, default false
  retention_days           -- partner must purge after
  patient_optout_allowed   -- boolean, default true
  signatory_origin, signatory_partner, executed_on
  effective_from, effective_to     -- MUST be bounded; max 24 months
  status                   -- draft | active | suspended | expired
  review_due_on            -- annual attestation
```

Enforcement rules:
- A DSA read is permitted only if patient, specialty, resource category, and
  reader role tier all fall inside the agreement's declared scope.
- Every DSA-based read writes `basis='institutional'` plus the `agreement_id`
  to the access log, so a patient can see the agreement's name and purpose.
- Patients may opt out of a DSA (`patient_dsa_optouts`); opting out downgrades
  that pipeline to per-patient consent for them, it does not block care.
- Expired or suspended DSA → reads fall through to consent, not to `treating`.

**Regulator framing.** Requiring a patient tap for every routine referral in a
standing Kingston→Port of Spain cardiology pipeline produces consent fatigue and
no real protection: the patient is approving a transfer they were clinically
referred into. The institutional agreement moves the scrutiny to where it is
effective — a signed, time-bounded, purpose-limited, auditable instrument
between two named institutions with an annual review and an individual
opt-out — while per-patient consent is preserved for the genuinely
discretionary case where a clinician outside any established relationship wants
to look.

---

## 2. "Treating facility" — precise definition and time bound

### 2.1 Qualifying events (open access)

Access opens at the moment one of these is recorded, and only for the facility
where it occurs:

| Event | Opens on |
|---|---|
| ED / A&E intake | Triage registration |
| Inpatient admission | Admission record created |
| Scheduled appointment | 24h before the slot start |
| Walk-in clinic visit | Check-in |
| Accepted referral | Receiving facility accepts |
| Active teleconsult | Consultation booked |
| Dispensing / pharmacy fill | Prescription presented (medications scope only) |
| Lab / imaging order | Order received (order + result scope only) |

An episode that never materialises (no-show, cancelled, declined referral)
closes the window immediately.

### 2.2 Closing events and default windows

Access is an **episode-scoped window**, not a permanent flag. Default
post-episode tail by facility type:

| Facility type | Post-episode window | Rationale |
|---|---|---|
| ED / A&E | 7 days after discharge | Short handover and re-presentation window |
| Acute inpatient hospital | 30 days after discharge | Discharge summary, readmission, complications |
| Outpatient / specialist clinic | 90 days after last visit | Follow-up cycle |
| Primary care / community clinic | 365 days, rolling | Continuous longitudinal relationship |
| Pharmacy | 30 days from last fill | Refill window |
| Lab / imaging | 14 days from result release | Result review |

Rules:
- Any new qualifying event **reopens and resets** the window.
- Windows are configurable per facility (`facilities.access_window_days`),
  with the table above as the type default. Configured value may shorten
  freely; lengthening beyond the default requires an org-admin action that is
  itself logged and shown to the ministry reviewer surface.
- On expiry the record is not deleted from the facility's care-network view;
  the facility still appears in the patient's care history, but reads return
  "window closed — request consent or record a new episode."
- A hard cap: no `treating` window may exceed 365 days without a new event.

```
record_access_windows
  id, patient_id, facility_id
  opened_by_event_id, event_kind
  opened_at, expires_at
  closed_at, closed_reason   -- expired | cancelled | patient_revoked | admin
```

**Regulator framing.** In v1, one A&E visit in 2019 gave a hospital permanent
read access. That is not a treating relationship, it is an unbounded grant with
a clinical excuse. Tying access to an episode with an explicit expiry, and
reopening it whenever the patient genuinely returns, means the record is open
exactly as long as there is care to deliver.

---

## 3. Sensitive categories

Certain data is carved out of blanket treating-facility access because the harm
from inappropriate disclosure is social and legal, not just clinical — a
material concern in Jamaica and Trinidad and Tobago where several of these
categories carry criminal-law or severe stigma exposure.

### 3.1 Categories

| Category | Code | Default gate |
|---|---|---|
| Mental health / psychiatric notes | `mental_health` | Explicit consent, or attending + treating psychiatrist |
| HIV status, testing, ART | `hiv` | Explicit consent; break-glass permitted with mandatory review |
| Sexual & reproductive health, incl. termination | `srh` | Explicit consent |
| Substance use / addiction treatment | `substance_use` | Explicit consent, or attending only |
| Sexual assault / IPV documentation | `gbv` | Explicit consent; never visible to admin tier |
| Genetic and familial risk data | `genetic` | Explicit consent |
| Adolescent confidential services (12–17) | `adolescent` | Minor's own consent; withheld from guardian portal |

### 3.2 Schema segmentation

Every clinical row carries a category tag; sensitive rows additionally live
behind their own policy path.

```
-- on every clinical table (encounters, notes, vitals, conditions,
-- medications, labs, documents):
sensitivity      text NOT NULL DEFAULT 'general'   -- 'general' | category code
authoring_facility_id uuid NOT NULL

sensitive_category_grants
  id, patient_id, category, grantee_facility_id, grantee_provider_id,
  role_tiers_permitted, granted_at, expires_at, status
```

Access resolution for a sensitive row requires **all** of:
1. an active basis for the chart at all (§1/§2), **and**
2. a matching `sensitive_category_grant`, or the reader being the authoring
   provider or the named treating specialist for that category, **and**
3. a reader role tier permitted for that category (§4).

Failure mode is a **redaction, not an error**: the chart renders with a
"restricted section — request access" placeholder so clinicians know
information exists without seeing it. Denied attempts are logged with
`allowed=false` and are visible to the patient.

Clinical-safety exception: allergy, adverse-reaction, and active-medication
entries derived from a sensitive record are surfaced in the general medication
list without their indication, so a clinician can prescribe safely without
learning the diagnosis.

**Regulator framing.** A cardiologist treating hypertension does not need the
patient's HIV status or a psychiatric note to do their job, and in this region
that disclosure can cost the patient a job, a family, or their safety. We
segment by category rather than by document so the carve-out survives the chart
being reassembled from six facilities, and we redact rather than hide so no
clinician is misled into thinking the chart is complete.

---

## 4. Role tiers within a treating facility

"Treating facility access" means the relevant care team, not the institution.

| Tier | Code | Chart access | Sensitive categories |
|---|---|---|---|
| Attending clinician | `attending` | Full general chart for the episode + longitudinal history | Only with grant or as author/named specialist |
| Consulting specialist | `consulting` | Referral question + clinically relevant sections for their specialty, current episode window | Only with grant |
| Nursing staff | `nursing` | Current episode: vitals, medications, care plan, allergies, orders; prior episodes summary-level | Never by tier; grant only |
| Allied health (pharmacy, lab, imaging, physio) | `allied` | Only their own order/result/dispense stream + allergies + active meds | Never |
| Front desk / registration | `front_desk` | Demographics, insurance, appointments, encounter existence. No clinical content | Never; sensitive encounters render as "clinical appointment" |
| Facility / org admin | `org_admin` | No clinical content by default. Staff, capacity, billing metadata | Never; may not self-grant |
| Ministry / public health | `ministry` | Aggregate and de-identified only | Never identified |
| Insurer | `insurer` | Claims-relevant, patient-authorised scope only | Never |

Additional constraints:
- Care-team membership is explicit: a staff member is on the team if they are
  the assigned attending, an accepted consult, rostered to the ward or clinic
  for the episode, or fulfilling an order. Facility employment alone is not
  membership.
- Any read outside one's own care-team assignment but inside one's facility is
  permitted only as break-glass (§5) — it is not silently allowed.
- `org_admin` cannot grant itself clinical access; elevation requires a second
  approver and writes to the patient's log.

---

## 5. Break-glass

Unchanged in intent, tightened in governance.

**Who may trigger:** licensed clinicians only — tiers `attending` and
`consulting`, plus registered nurses at charge level or above, and only from
within a facility with an *open or same-day* qualifying event. Front desk,
admin, ministry, and insurer roles can never trigger it. The triggering user's
licence number is captured at the moment of override.

**Trigger requirements:** free-text clinical justification (minimum
substantive entry, no canned reasons), selection of a declared emergency
category, and on-screen acknowledgement that the patient will be notified and
the access reviewed.

**Grant:** immediate, full general chart. Sensitive categories are included
only for `hiv`, `substance_use`, and `mental_health` where clinically
necessary for emergency care; `srh`, `gbv`, `genetic`, and `adolescent`
require a second clinician's co-sign at the moment of override.

**Expiry:** 24 hours, non-renewable without a new override. It never converts
into a `treating` window; a real episode must be recorded to do that.

**Notification:** patient notified within 1 hour via their care line, naming
the facility, the clinician, the time, and the stated reason.

**Review:** every break-glass event enters a mandatory review queue for the
facility's clinical governance lead and the patient-safety/privacy officer,
with a 72-hour SLA. Outcome recorded as justified / unjustified / referred.
Unjustified outcomes are reported to the ministry surface in the monthly
compliance extract. Three unjustified events for one user suspends their
override capability pending investigation.

```
break_glass_events
  id, patient_id, facility_id, user_id, licence_no
  category, justification, co_signer_user_id
  sensitive_categories_included
  started_at, expires_at
  patient_notified_at
  review_status, reviewed_by, reviewed_at, review_notes
```

---

## 6. Patient-facing access log

A standalone transparency feature — "Who has looked at my record" — separate
from the consent gate at "Who can see my record". Transparency is not a
permission control and must not be reachable only through the consent screen.

**Contents.** Every read of identified clinical data, regardless of basis,
including denied attempts and the patient's own reads. Each entry shows: date
and time, facility, clinician name and role tier, what was opened in plain
language ("your blood pressure history", not `vitals`), the basis in plain
language, and — for DSA reads — the agreement name and purpose.

**Guarantees.**
- Append-only. No update or delete path exists for any role, including admin.
- Never filtered by basis: `treating` and `institutional` reads appear
  alongside consent reads.
- Retained for the life of the record, minimum 7 years.
- Exportable by the patient (PDF/CSV) without staff involvement.
- Push notification, opt-out per class: always for break-glass, default-on for
  first read by a new facility and for any sensitive-category read.
- Each entry offers "I don't recognise this" → files a privacy complaint to the
  facility's privacy officer and the ministry surface, with a response SLA.

**Regulator framing.** Consent controls what may happen; the log tells the
patient what did happen. Most access on the Grid will be lawful without a tap —
treating relationships and institutional agreements — which makes visibility
after the fact the patient's primary safeguard, not an audit by-product. Making
it append-only and unfilterable is what makes it evidence rather than a report.

---

## 7. Resolution order

```
1. self                → allow
2. sensitive row?      → require category grant / author / named specialist
                          AND permitted role tier; else redact + log denial
3. active break-glass  → allow (logged, 24h, review queued)
4. open access window at reader's facility
                       → allow within reader's role tier
5. active DSA covering (patient, specialty, resource, tier)
                       → allow, log agreement_id
6. active consent grant covering (provider/facility, scope)
                       → allow
7. otherwise           → deny, log denial, offer "request access"
```

Every branch writes an access-log row. There is no unlogged read path.
