-- =========================================================
-- Prevention engine
-- =========================================================
CREATE TABLE public.screening_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  condition_focus text NOT NULL DEFAULT 'hypertension',
  island_code text REFERENCES public.islands(code),
  facility_id uuid REFERENCES public.facilities(id),
  cohort_rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  message_template text NOT NULL DEFAULT '',
  channel text NOT NULL DEFAULT 'whatsapp',
  status text NOT NULL DEFAULT 'draft',
  starts_on date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.screening_campaigns TO authenticated;
GRANT SELECT ON public.screening_campaigns TO anon;
GRANT ALL ON public.screening_campaigns TO service_role;
ALTER TABLE public.screening_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo read campaigns" ON public.screening_campaigns FOR SELECT USING (true);
CREATE POLICY "demo write campaigns" ON public.screening_campaigns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "demo update campaigns" ON public.screening_campaigns FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "demo delete campaigns" ON public.screening_campaigns FOR DELETE TO authenticated USING (true);
CREATE TRIGGER screening_campaigns_touch BEFORE UPDATE ON public.screening_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.campaign_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.screening_campaigns(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued',
  reason text NOT NULL DEFAULT '',
  sent_at timestamptz,
  responded_at timestamptz,
  reading_captured boolean NOT NULL DEFAULT false,
  outcome text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, patient_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_targets TO authenticated;
GRANT SELECT ON public.campaign_targets TO anon;
GRANT ALL ON public.campaign_targets TO service_role;
ALTER TABLE public.campaign_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo read targets" ON public.campaign_targets FOR SELECT USING (true);
CREATE POLICY "demo write targets" ON public.campaign_targets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "demo update targets" ON public.campaign_targets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "demo delete targets" ON public.campaign_targets FOR DELETE TO authenticated USING (true);

-- =========================================================
-- Early detection
-- =========================================================
ALTER TABLE public.vitals
  ADD COLUMN IF NOT EXISTS device text,
  ADD COLUMN IF NOT EXISTS reported_by text NOT NULL DEFAULT 'clinic';

CREATE TABLE public.detection_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  facility_id uuid REFERENCES public.facilities(id),
  kind text NOT NULL,
  metric text NOT NULL,
  current_value numeric,
  baseline_value numeric,
  delta_pct numeric,
  severity text NOT NULL DEFAULT 'watch',
  narrative text NOT NULL DEFAULT '',
  recommended_action text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  detected_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_by text,
  acknowledged_at timestamptz,
  campaign_id uuid REFERENCES public.screening_campaigns(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.detection_signals TO authenticated;
GRANT SELECT ON public.detection_signals TO anon;
GRANT ALL ON public.detection_signals TO service_role;
ALTER TABLE public.detection_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo read signals" ON public.detection_signals FOR SELECT USING (true);
CREATE POLICY "demo write signals" ON public.detection_signals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "demo update signals" ON public.detection_signals FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "demo delete signals" ON public.detection_signals FOR DELETE TO authenticated USING (true);

CREATE INDEX detection_signals_patient_idx ON public.detection_signals (patient_id, detected_at DESC);

-- Trend detector: compares last 10 days against the prior 30
CREATE OR REPLACE FUNCTION public.detect_trend(p_patient uuid)
RETURNS TABLE(metric text, current_value numeric, baseline_value numeric, delta_pct numeric, severity text, narrative text, recommended_action text)
LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $$
DECLARE
  c_sys numeric; b_sys numeric; c_glu numeric; b_glu numeric; v_supply int; v_adh numeric;
BEGIN
  SELECT avg(systolic) INTO c_sys FROM vitals WHERE patient_id = p_patient AND measured_at > now() - interval '10 days';
  SELECT avg(systolic) INTO b_sys FROM vitals WHERE patient_id = p_patient AND measured_at BETWEEN now() - interval '40 days' AND now() - interval '10 days';
  SELECT avg(glucose_mmol) INTO c_glu FROM vitals WHERE patient_id = p_patient AND measured_at > now() - interval '10 days';
  SELECT avg(glucose_mmol) INTO b_glu FROM vitals WHERE patient_id = p_patient AND measured_at BETWEEN now() - interval '40 days' AND now() - interval '10 days';
  SELECT min(days_supply_left), avg(adherence_pct) INTO v_supply, v_adh FROM medications WHERE patient_id = p_patient;

  IF c_sys IS NOT NULL AND b_sys IS NOT NULL AND c_sys - b_sys > 6 THEN
    RETURN QUERY SELECT 'systolic_bp', round(c_sys), round(b_sys), round((c_sys - b_sys) / b_sys * 100, 1),
      CASE WHEN c_sys >= 160 THEN 'urgent' WHEN c_sys >= 145 THEN 'elevated' ELSE 'watch' END,
      'Blood pressure has climbed from ' || round(b_sys) || ' to ' || round(c_sys) || ' mmHg over the last 10 days.',
      CASE WHEN c_sys >= 160 THEN 'Call today; consider same-week teleconsult and medication review.'
           ELSE 'Send a home-reading request and review adherence.' END;
  END IF;

  IF c_glu IS NOT NULL AND b_glu IS NOT NULL AND c_glu - b_glu > 0.7 THEN
    RETURN QUERY SELECT 'glucose', round(c_glu, 1), round(b_glu, 1), round((c_glu - b_glu) / b_glu * 100, 1),
      CASE WHEN c_glu >= 11 THEN 'urgent' WHEN c_glu >= 8.5 THEN 'elevated' ELSE 'watch' END,
      'Average glucose has risen from ' || round(b_glu, 1) || ' to ' || round(c_glu, 1) || ' mmol/L.',
      'Review diet, medication timing and dose; book a nurse check-in.';
  END IF;

  IF v_supply IS NOT NULL AND v_supply <= 7 THEN
    RETURN QUERY SELECT 'medication_supply', v_supply::numeric, 30::numeric, NULL::numeric,
      CASE WHEN v_supply <= 2 THEN 'urgent' ELSE 'elevated' END,
      'Only ' || v_supply || ' days of medication left on at least one prescription.',
      'Trigger a refill reminder and confirm stock at the nearest facility.';
  END IF;

  IF v_adh IS NOT NULL AND v_adh < 70 THEN
    RETURN QUERY SELECT 'adherence', round(v_adh), 100::numeric, round(v_adh - 100, 1),
      CASE WHEN v_adh < 55 THEN 'urgent' ELSE 'elevated' END,
      'Medication adherence is averaging ' || round(v_adh) || '%.',
      'Enrol in the daily reminder track and check for cost or access barriers.';
  END IF;
END $$;

-- =========================================================
-- Paper on-ramp
-- =========================================================
CREATE TABLE public.clinical_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
  facility_id uuid REFERENCES public.facilities(id),
  title text NOT NULL,
  doc_type text NOT NULL DEFAULT 'other',
  source text NOT NULL DEFAULT 'paper_scan',
  storage_path text,
  original_text text NOT NULL DEFAULT '',
  extraction_status text NOT NULL DEFAULT 'pending',
  extracted jsonb NOT NULL DEFAULT '{}'::jsonb,
  extraction_note text NOT NULL DEFAULT '',
  committed boolean NOT NULL DEFAULT false,
  uploaded_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinical_documents TO authenticated;
GRANT SELECT ON public.clinical_documents TO anon;
GRANT ALL ON public.clinical_documents TO service_role;
ALTER TABLE public.clinical_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo read documents" ON public.clinical_documents FOR SELECT USING (true);
CREATE POLICY "demo write documents" ON public.clinical_documents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "demo update documents" ON public.clinical_documents FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "demo delete documents" ON public.clinical_documents FOR DELETE TO authenticated USING (true);
CREATE TRIGGER clinical_documents_touch BEFORE UPDATE ON public.clinical_documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.api_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  organisation text NOT NULL,
  island_code text REFERENCES public.islands(code),
  scopes text[] NOT NULL DEFAULT ARRAY['patient.read'],
  status text NOT NULL DEFAULT 'active',
  token_prefix text NOT NULL DEFAULT 'ccg_demo',
  system_kind text NOT NULL DEFAULT 'emr',
  last_used_at timestamptz,
  calls_30d integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_clients TO authenticated;
GRANT SELECT ON public.api_clients TO anon;
GRANT ALL ON public.api_clients TO service_role;
ALTER TABLE public.api_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo read api clients" ON public.api_clients FOR SELECT USING (true);
CREATE POLICY "demo write api clients" ON public.api_clients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "demo update api clients" ON public.api_clients FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "demo delete api clients" ON public.api_clients FOR DELETE TO authenticated USING (true);

-- =========================================================
-- Seeds
-- =========================================================
INSERT INTO public.screening_campaigns (id, name, description, condition_focus, island_code, cohort_rule, message_template, channel, status, starts_on)
VALUES
  ('c1000000-0000-4000-8000-000000000001'::uuid, 'Kingston hypertension sweep',
   'Every hypertensive patient in Jamaica with no blood-pressure reading in 30 days gets a home-reading request.',
   'hypertension', 'JM',
   '{"condition":"Hypertension","no_reading_days":30,"risk_min":30}'::jsonb,
   'Hi {name}, this is your CariCare care team. It has been a while since your last blood pressure check. Reply with your reading (e.g. 148/92) or type CHECK and we will find you a free check nearby.',
   'whatsapp', 'running', current_date - 9),
  ('c1000000-0000-4000-8000-000000000002'::uuid, 'Diabetes refill rescue',
   'Patients with under 10 days of medication left, or adherence under 70%, before they run out.',
   'diabetes', NULL,
   '{"days_supply_max":10,"adherence_max":70}'::jsonb,
   'Hi {name}, our records show your medication is running low. Reply REFILL and we will confirm stock at your nearest clinic and hold it for you.',
   'whatsapp', 'running', current_date - 4),
  ('c1000000-0000-4000-8000-000000000003'::uuid, 'Rural undiagnosed screening drive',
   'Rural patients over 40 with no recorded conditions — first-time screening offer with a community health worker.',
   'screening', NULL,
   '{"rural":true,"age_min":40,"conditions_max":0}'::jsonb,
   'Hi {name}, free blood pressure and sugar testing is coming to your area this week. Reply YES to reserve a slot — it takes 10 minutes and it is free.',
   'sms', 'draft', current_date + 3);

-- Campaign 1 targets: Jamaican patients, hero patient first
INSERT INTO public.campaign_targets (campaign_id, patient_id, status, reason, sent_at, responded_at, reading_captured, outcome)
SELECT 'c1000000-0000-4000-8000-000000000001'::uuid, p.id,
       CASE WHEN row_number() OVER (ORDER BY p.created_at) % 5 = 0 THEN 'booked'
            WHEN row_number() OVER (ORDER BY p.created_at) % 3 = 0 THEN 'responded'
            WHEN row_number() OVER (ORDER BY p.created_at) % 7 = 0 THEN 'queued'
            ELSE 'sent' END,
       'Hypertension on file, no reading in 30 days',
       now() - interval '8 days',
       CASE WHEN row_number() OVER (ORDER BY p.created_at) % 3 = 0 THEN now() - interval '7 days' ELSE NULL END,
       (row_number() OVER (ORDER BY p.created_at) % 3 = 0),
       CASE WHEN row_number() OVER (ORDER BY p.created_at) % 5 = 0 THEN 'Teleconsult booked' ELSE '' END
FROM public.patients p
WHERE p.island_code = 'JM'
LIMIT 60;

INSERT INTO public.campaign_targets (campaign_id, patient_id, status, reason, sent_at, responded_at, reading_captured, outcome)
SELECT 'c1000000-0000-4000-8000-000000000002'::uuid, m.patient_id,
       CASE WHEN row_number() OVER (ORDER BY m.days_supply_left) % 4 = 0 THEN 'responded' ELSE 'sent' END,
       'Only ' || m.days_supply_left || ' days of ' || m.name || ' left',
       now() - interval '3 days',
       CASE WHEN row_number() OVER (ORDER BY m.days_supply_left) % 4 = 0 THEN now() - interval '2 days' ELSE NULL END,
       false,
       CASE WHEN row_number() OVER (ORDER BY m.days_supply_left) % 4 = 0 THEN 'Refill confirmed' ELSE '' END
FROM (SELECT DISTINCT ON (patient_id) patient_id, days_supply_left, name FROM public.medications
      WHERE days_supply_left <= 10 ORDER BY patient_id, days_supply_left) m
LIMIT 40;

-- Make sure the hero patient is in the hypertension campaign
INSERT INTO public.campaign_targets (campaign_id, patient_id, status, reason, sent_at, responded_at, reading_captured, outcome)
VALUES ('c1000000-0000-4000-8000-000000000001'::uuid, '11111111-1111-4111-8111-111111111111'::uuid,
        'responded', 'Hypertension on file, reading overdue', now() - interval '8 days', now() - interval '8 days', true,
        'Home reading 168/104 returned — escalated to triage')
ON CONFLICT (campaign_id, patient_id) DO UPDATE
  SET status = 'responded', reading_captured = true, outcome = 'Home reading 168/104 returned — escalated to triage';

-- Detection signals from the trend detector for the highest-risk patients
INSERT INTO public.detection_signals (patient_id, kind, metric, current_value, baseline_value, delta_pct, severity, narrative, recommended_action, detected_at, status)
SELECT r.patient_id, 'trend', t.metric, t.current_value, t.baseline_value, t.delta_pct, t.severity, t.narrative, t.recommended_action,
       now() - (random() * interval '6 days'), 'open'
FROM (SELECT patient_id FROM public.risk_scores ORDER BY score DESC LIMIT 45) r
CROSS JOIN LATERAL public.detect_trend(r.patient_id) t;

INSERT INTO public.detection_signals (patient_id, kind, metric, current_value, baseline_value, delta_pct, severity, narrative, recommended_action, detected_at, status, campaign_id)
VALUES ('11111111-1111-4111-8111-111111111111'::uuid, 'home_reading', 'systolic_bp', 168, 142, 18.3, 'urgent',
        'Home cuff reading of 168/104 returned through the care line, 26 mmHg above her 30-day baseline.',
        'Same-day teleconsult; cross-island cardiology route if unresolved.',
        now() - interval '6 hours', 'open', 'c1000000-0000-4000-8000-000000000001'::uuid);

-- Home-sourced readings so the detection layer has real inputs
UPDATE public.vitals SET reported_by = 'patient', device = 'Omron home cuff'
WHERE source = 'home';

INSERT INTO public.vitals (patient_id, measured_at, systolic, diastolic, pulse, source, reported_by, device)
VALUES
  ('11111111-1111-4111-8111-111111111111'::uuid, now() - interval '6 hours', 168, 104, 92, 'home', 'patient', 'Omron home cuff'),
  ('11111111-1111-4111-8111-111111111111'::uuid, now() - interval '3 days', 158, 98, 88, 'home', 'patient', 'Omron home cuff'),
  ('11111111-1111-4111-8111-111111111111'::uuid, now() - interval '6 days', 152, 96, 84, 'home', 'patient', 'Omron home cuff');

-- Documents
INSERT INTO public.clinical_documents (patient_id, facility_id, title, doc_type, source, original_text, extraction_status, extracted, extraction_note, committed, uploaded_by, created_at)
SELECT '11111111-1111-4111-8111-111111111111'::uuid, f.id,
       'Kingston clinic card — handwritten, 2023-2025', 'clinic_card', 'paper_scan',
       E'MARLENE CAMPBELL  DOB 12/03/1968\nHTN dx 2019  T2DM dx 2021\nBP 156/96 (14/02/25)  BP 148/92 (09/05/25)\nAmlodipine 10mg od; Metformin 1g bd\nNKDA',
       'complete',
       '{"conditions":[{"name":"Hypertension","diagnosed":"2019"},{"name":"Type 2 diabetes","diagnosed":"2021"}],"medications":[{"name":"Amlodipine","dosage":"10mg","frequency":"once daily"},{"name":"Metformin","dosage":"1g","frequency":"twice daily"}],"vitals":[{"systolic":156,"diastolic":96,"measured_at":"2025-02-14"},{"systolic":148,"diastolic":92,"measured_at":"2025-05-09"}],"allergies":"NKDA"}'::jsonb,
       'High confidence. Two readings and two medications matched existing records; no conflicts.',
       true, 'Sister Yvette Marshall', now() - interval '11 days'
FROM public.facilities f WHERE f.island_code = 'JM' AND f.kind = 'clinic' LIMIT 1;

INSERT INTO public.clinical_documents (patient_id, facility_id, title, doc_type, source, original_text, extraction_status, extracted, extraction_note, committed, uploaded_by, created_at)
SELECT '11111111-1111-4111-8111-111111111111'::uuid, f.id,
       'Lipid panel + HbA1c — faxed lab report', 'lab_report', 'fax',
       E'LAB: Kingston Path Services\nHbA1c 8.9%\nTotal chol 6.2 mmol/L  LDL 4.1  HDL 1.0\nCollected 02/08/2026',
       'complete',
       '{"labs":[{"name":"HbA1c","value":"8.9","unit":"%"},{"name":"Total cholesterol","value":"6.2","unit":"mmol/L"},{"name":"LDL","value":"4.1","unit":"mmol/L"},{"name":"HDL","value":"1.0","unit":"mmol/L"}],"collected":"2026-08-02"}'::jsonb,
       'HbA1c above target — flagged to the attending clinician.',
       true, 'Dr. Anika Cadogan', now() - interval '4 days'
FROM public.facilities f WHERE f.island_code = 'JM' AND f.kind = 'hospital' LIMIT 1;

INSERT INTO public.api_clients (name, organisation, island_code, scopes, status, token_prefix, system_kind, last_used_at, calls_30d)
VALUES
  ('Trinidad General EMR bridge', 'Trinidad and Tobago General Hospital', 'TT',
   ARRAY['patient.read','observation.read','condition.read','encounter.write'], 'active', 'ccg_live_tt7f', 'emr', now() - interval '20 minutes', 4820),
  ('Jamaica MOH surveillance feed', 'Ministry of Health & Wellness, Jamaica', 'JM',
   ARRAY['population.read'], 'active', 'ccg_live_jmoh', 'ministry', now() - interval '2 hours', 640),
  ('Barbados clinic network pilot', 'Barbados Community Clinic', 'BB',
   ARRAY['patient.read','condition.read'], 'pending', 'ccg_test_bb21', 'emr', NULL, 0);