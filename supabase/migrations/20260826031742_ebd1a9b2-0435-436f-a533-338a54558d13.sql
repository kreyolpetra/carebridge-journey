-- Explainable risk model
CREATE OR REPLACE FUNCTION public.compute_risk(p_patient uuid)
RETURNS TABLE (score int, band text, trend text, drivers jsonb)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_age int; v_km int; v_conds int; v_adh numeric;
  v_sys numeric; v_glu numeric; v_prev_sys numeric;
  s_bp numeric; s_glu numeric; s_adh numeric; s_age numeric; s_cond numeric; s_acc numeric;
  total int; v_band text; v_trend text;
BEGIN
  SELECT age, km_to_facility INTO v_age, v_km FROM patients WHERE id = p_patient;
  SELECT count(*) INTO v_conds FROM conditions WHERE patient_id = p_patient;
  SELECT coalesce(avg(adherence_pct), 100) INTO v_adh FROM medications WHERE patient_id = p_patient;
  SELECT coalesce(avg(systolic), 120), coalesce(avg(glucose_mmol), 5.5) INTO v_sys, v_glu
    FROM vitals WHERE patient_id = p_patient AND measured_at > now() - interval '14 days';
  SELECT coalesce(avg(systolic), v_sys) INTO v_prev_sys
    FROM vitals WHERE patient_id = p_patient
      AND measured_at BETWEEN now() - interval '28 days' AND now() - interval '14 days';

  s_bp   := least(32, greatest(0, (v_sys - 120) * 0.95));
  s_glu  := least(20, greatest(0, (v_glu - 6.0) * 6));
  s_adh  := least(18, greatest(0, (100 - v_adh) * 0.28));
  s_age  := least(12, greatest(0, (v_age - 40) * 0.3));
  s_cond := least(12, v_conds * 4);
  s_acc  := least(6, v_km * 0.12);
  total  := round(s_bp + s_glu + s_adh + s_age + s_cond + s_acc);

  v_band := CASE WHEN total >= 68 THEN 'critical' WHEN total >= 50 THEN 'high'
                 WHEN total >= 32 THEN 'moderate' ELSE 'low' END;
  v_trend := CASE WHEN v_sys - v_prev_sys > 4 THEN 'rising'
                  WHEN v_prev_sys - v_sys > 4 THEN 'improving' ELSE 'stable' END;

  RETURN QUERY SELECT total, v_band, v_trend, jsonb_build_array(
    jsonb_build_object('label','Blood pressure (14d avg ' || round(v_sys) || ' mmHg)','points', round(s_bp)),
    jsonb_build_object('label','Glucose (14d avg ' || round(v_glu,1) || ' mmol/L)','points', round(s_glu)),
    jsonb_build_object('label','Medication adherence ' || round(v_adh) || '%','points', round(s_adh)),
    jsonb_build_object('label','Age ' || v_age,'points', round(s_age)),
    jsonb_build_object('label', v_conds || ' chronic condition(s)','points', round(s_cond)),
    jsonb_build_object('label','Distance to care ' || v_km || ' km','points', round(s_acc))
  );
END $$;

GRANT EXECUTE ON FUNCTION public.compute_risk(uuid) TO anon, authenticated, service_role;

-- Hero demo patient
INSERT INTO public.patients (id, full_name, phone, age, sex, island_code, parish, language, rural, km_to_facility, insurer)
VALUES ('11111111-1111-4111-8111-111111111111','Marlene Campbell','+18765550142',58,'F','JM','St. Elizabeth','jam',true,38,'National Health Fund');

INSERT INTO public.conditions (patient_id, name, diagnosed_on) VALUES
  ('11111111-1111-4111-8111-111111111111','Hypertension', current_date - 2900),
  ('11111111-1111-4111-8111-111111111111','Type 2 Diabetes', current_date - 1400);

INSERT INTO public.medications (patient_id, name, dosage, frequency, adherence_pct, last_refill_on, days_supply_left) VALUES
  ('11111111-1111-4111-8111-111111111111','Amlodipine','10mg','daily',48, current_date - 47, 0),
  ('11111111-1111-4111-8111-111111111111','Metformin','500mg','twice daily',62, current_date - 31, 3);

-- 60 days of steadily worsening readings
INSERT INTO public.vitals (patient_id, measured_at, systolic, diastolic, glucose_mmol, pulse, weight_kg, source)
SELECT '11111111-1111-4111-8111-111111111111',
       now() - (d || ' days')::interval,
       (196 - d * 0.75 + (random() * 6 - 3))::int,
       (104 - d * 0.25 + (random() * 4 - 2))::int,
       round((9.4 - d * 0.03 + random() * 0.6)::numeric, 1),
       (84 + random() * 10)::int,
       92.4,
       'whatsapp'
FROM generate_series(0, 59) d;

-- Risk scores for everyone
INSERT INTO public.risk_scores (patient_id, score, band, trend, drivers)
SELECT p.id, r.score, r.band, r.trend, r.drivers
FROM public.patients p CROSS JOIN LATERAL public.compute_risk(p.id) r;

-- 8 weeks of completed cross-island activity so the dashboard has history
WITH picks AS (
  SELECT p.id AS patient_id, p.island_code,
         (SELECT pr.id FROM public.providers pr
           WHERE pr.specialty IN ('Cardiology','Endocrinology','Nephrology')
             AND pr.island_code <> p.island_code ORDER BY random() LIMIT 1) AS provider_id,
         (SELECT pr.specialty FROM public.providers pr
           WHERE pr.specialty IN ('Cardiology','Endocrinology','Nephrology')
             AND pr.island_code <> p.island_code ORDER BY random() LIMIT 1) AS specialty,
         floor(random() * 56)::int AS days_ago
  FROM public.patients p
  JOIN public.risk_scores rs ON rs.patient_id = p.id
  WHERE rs.score > 45 AND random() < 0.35
)
INSERT INTO public.referrals (patient_id, to_provider_id, specialty, status, cross_island, reason,
                              wait_days_local, wait_days_routed, retained_value_usd, created_at)
SELECT patient_id, provider_id, specialty, 'completed', true,
       'Capacity-aware routing: no local ' || specialty || ' slot within the clinical window',
       28 + floor(random() * 34)::int,
       1 + floor(random() * 6)::int,
       2400 + floor(random() * 9200)::int,
       now() - (days_ago || ' days')::interval
FROM picks WHERE provider_id IS NOT NULL;

INSERT INTO public.consultations (referral_id, patient_id, provider_id, scheduled_at, status, notes, plan)
SELECT r.id, r.patient_id, r.to_provider_id, r.created_at + interval '3 days', 'completed',
       'Teleconsult completed via CariCare Grid.',
       'Continue titration, remote monitoring cadence increased to daily.'
FROM public.referrals r;

-- Live system alerts
INSERT INTO public.alerts (kind, severity, island_code, title, detail)
SELECT 'supply',
       CASE WHEN s.status = 'critical' THEN 'high' ELSE 'medium' END,
       f.island_code,
       s.medication_name || ' shortage at ' || f.name,
       s.days_cover || ' days of cover remaining (' || s.on_hand || ' units on hand).'
FROM public.stock_items s JOIN public.facilities f ON f.id = s.facility_id
WHERE s.status IN ('critical','low');

INSERT INTO public.alerts (kind, severity, island_code, patient_id, title, detail)
SELECT 'clinical', CASE WHEN rs.band = 'critical' THEN 'high' ELSE 'medium' END,
       p.island_code, p.id,
       'Rising risk: ' || p.full_name || ' (' || p.parish || ')',
       'Risk score ' || rs.score || ' and ' || rs.trend || '. Flagged for proactive outreach.'
FROM public.risk_scores rs JOIN public.patients p ON p.id = rs.patient_id
WHERE rs.band IN ('critical','high') AND rs.trend = 'rising';

INSERT INTO public.alerts (kind, severity, island_code, title, detail) VALUES
  ('capacity','high','JM','No cardiology capacity in Jamaica','0 cardiologists available on-island. All cardiac referrals routing to Trinidad and Barbados.'),
  ('capacity','medium','VC','Bed occupancy above 90% at Saint Vincent General Hospital','Divert non-urgent admissions; telemedicine queue depth rising.'),
  ('telemedicine','medium','LC','Creole-speaking clinician shortage','62% of Saint Lucia intake is fr-cr; only 4 matching clinicians available regionally.');
