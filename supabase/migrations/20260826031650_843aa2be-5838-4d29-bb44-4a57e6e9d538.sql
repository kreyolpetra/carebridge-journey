SELECT setseed(0.4242);

INSERT INTO public.islands (code, name, country, population, lat, lng) VALUES
  ('JM','Jamaica','Jamaica',2825000,18.1096,-77.2975),
  ('TT','Trinidad and Tobago','Trinidad and Tobago',1531000,10.6918,-61.2225),
  ('BB','Barbados','Barbados',281000,13.1939,-59.5432),
  ('GD','Grenada','Grenada',125000,12.1165,-61.6790),
  ('LC','Saint Lucia','Saint Lucia',180000,13.9094,-60.9789),
  ('VC','Saint Vincent','Saint Vincent and the Grenadines',111000,13.2528,-61.1971),
  ('DM','Dominica','Dominica',72000,15.4150,-61.3710),
  ('AG','Antigua','Antigua and Barbuda',98000,17.0608,-61.7964);

INSERT INTO public.facilities (name, island_code, kind, beds_total, beds_occupied)
SELECT i.name || ' ' || f.suffix, i.code, f.kind, f.beds,
       greatest(0, (f.beds * (0.58 + random() * 0.38))::int)
FROM public.islands i
CROSS JOIN (VALUES
  ('General Hospital','hospital',180),
  ('Community Clinic','clinic',14),
  ('Rural Health Centre','clinic',8)
) AS f(suffix, kind, beds);

WITH mix(island_code, specialty, cnt, wait_days) AS (VALUES
  ('JM','General Practice',6,9),('JM','Internal Medicine',3,16),('JM','Endocrinology',1,38),
  ('JM','Nephrology',1,34),('JM','Ophthalmology',1,29),
  ('TT','General Practice',5,7),('TT','Cardiology',3,12),('TT','Endocrinology',2,15),
  ('TT','Nephrology',2,18),('TT','Psychiatry',1,21),
  ('BB','General Practice',4,6),('BB','Cardiology',2,11),('BB','Endocrinology',1,14),
  ('BB','Nephrology',1,17),('BB','Ophthalmology',1,20),
  ('GD','General Practice',3,10),('GD','Internal Medicine',1,24),
  ('LC','General Practice',3,11),('LC','Internal Medicine',1,22),('LC','Endocrinology',1,26),
  ('VC','General Practice',2,13),('VC','Internal Medicine',1,27),
  ('DM','General Practice',2,15),
  ('AG','General Practice',3,8),('AG','Cardiology',1,19),('AG','Psychiatry',1,23)
),
fn(a) AS (VALUES (ARRAY['Andre','Camille','Devon','Simone','Rohan','Anika','Kwame','Nadia','Trevor','Shanice','Errol','Yolande','Dwight','Marsha','Rajiv','Petra','Colin','Jodi-Ann','Leon','Cheryl'])),
ln(a) AS (VALUES (ARRAY['Bailey','Ramsingh','Clarke','Joseph','Providence','Grant','Alleyne','Sinanan','Charles','Boyce','Prescod','Frederick','Baptiste','Henriques','Maharaj','Cadogan','Simmons','Toussaint','Beckles','Marshall']))
INSERT INTO public.providers (full_name, specialty, island_code, facility_id, languages, teleconsult_rate_usd, next_local_wait_days)
SELECT
  'Dr. ' || (SELECT a FROM fn)[1 + floor(random() * 20)::int] || ' ' || (SELECT a FROM ln)[1 + floor(random() * 20)::int],
  m.specialty,
  m.island_code,
  (SELECT f.id FROM public.facilities f WHERE f.island_code = m.island_code ORDER BY random() LIMIT 1),
  CASE WHEN m.island_code IN ('LC','DM') THEN ARRAY['en','fr-cr'] WHEN m.island_code = 'TT' THEN ARRAY['en','es'] ELSE ARRAY['en'] END,
  CASE m.specialty WHEN 'General Practice' THEN 25 WHEN 'Internal Medicine' THEN 45 ELSE 70 END,
  m.wait_days
FROM mix m, generate_series(1, m.cnt);

INSERT INTO public.availability_slots (provider_id, starts_at, minutes, status)
SELECT p.id,
       date_trunc('day', now()) + (d || ' days')::interval + ((8 + s) || ' hours')::interval,
       CASE WHEN p.specialty = 'General Practice' THEN 15 ELSE 25 END,
       CASE WHEN random() < 0.45 THEN 'booked' ELSE 'open' END
FROM public.providers p,
     generate_series(1, 12) d,
     generate_series(0, 5) s
WHERE random() < 0.35;

WITH fn(a) AS (VALUES (ARRAY['Marlene','Delroy','Sharon','Winston','Althea','Junior','Beverley','Clement','Icilda','Everton','Merlene','Rupert','Pearline','Lloyd','Grace','Neville','Doreen','Sylvester','Hyacinth','Barrington','Yvette','Fitzroy','Monica','Desmond','Verona','Linton','Claudette','Egbert','Sandra','Owen'])),
ln(a) AS (VALUES (ARRAY['Campbell','Bramble','Ramkissoon','Gilkes','Charles','Edwards','Providence','Mohammed','Isaac','Belgrave','Phillip','Stewart','Hosein','Blackman','Anthony','Peters','Lewis','Weekes','Douglas','Samuel'])),
parishes(island_code, names) AS (VALUES
  ('JM', ARRAY['St. Elizabeth','Clarendon','St. Thomas','Portland','Westmoreland','Kingston','St. Ann']),
  ('TT', ARRAY['Sangre Grande','Mayaro','Point Fortin','Chaguanas','Tobago East','Siparia']),
  ('BB', ARRAY['St. Lucy','St. Andrew','St. Philip','Christ Church','St. John']),
  ('GD', ARRAY['St. Patrick','St. David','Carriacou','St. Andrew']),
  ('LC', ARRAY['Soufriere','Micoud','Dennery','Choiseul','Gros Islet']),
  ('VC', ARRAY['Union Island','Georgetown','Bequia','Barrouallie']),
  ('DM', ARRAY['Portsmouth','Grand Bay','Marigot','La Plaine']),
  ('AG', ARRAY['Barbuda','St. Philip','St. Mary','Bolans'])
),
weights(island_code, n) AS (VALUES ('JM',95),('TT',60),('BB',35),('GD',22),('LC',26),('VC',18),('DM',14),('AG',20))
INSERT INTO public.patients (full_name, phone, age, sex, island_code, parish, language, rural, km_to_facility, insurer)
SELECT
  (SELECT a FROM fn)[1 + floor(random() * 30)::int] || ' ' || (SELECT a FROM ln)[1 + floor(random() * 20)::int],
  '+1' || (200 + floor(random() * 700))::int || (1000000 + floor(random() * 8999999))::int,
  34 + floor(random() * 46)::int,
  CASE WHEN random() < 0.56 THEN 'F' ELSE 'M' END,
  w.island_code,
  (SELECT p.names FROM parishes p WHERE p.island_code = w.island_code)[1 + floor(random() * array_length((SELECT p.names FROM parishes p WHERE p.island_code = w.island_code), 1))::int],
  CASE WHEN w.island_code IN ('LC','DM') AND random() < 0.5 THEN 'fr-cr'
       WHEN w.island_code = 'JM' AND random() < 0.45 THEN 'jam'
       WHEN w.island_code = 'TT' AND random() < 0.15 THEN 'es'
       ELSE 'en' END,
  random() < 0.52,
  2 + floor(random() * 48)::int,
  (ARRAY['Sagicor','Guardian Life','Beacon','National Health Fund','Uninsured'])[1 + floor(random() * 5)::int]
FROM weights w, generate_series(1, w.n);

INSERT INTO public.conditions (patient_id, name, diagnosed_on)
SELECT p.id, c.name, current_date - (200 + floor(random() * 2600))::int
FROM public.patients p
CROSS JOIN LATERAL (VALUES ('Type 2 Diabetes', 0.42), ('Hypertension', 0.58), ('Chronic Kidney Disease', 0.09), ('Obesity', 0.31), ('Heart Failure', 0.06)) AS c(name, prob)
WHERE random() < c.prob;

INSERT INTO public.medications (patient_id, name, dosage, frequency, adherence_pct, last_refill_on, days_supply_left)
SELECT c.patient_id,
       m.med, m.dose, 'daily',
       greatest(25, least(100, (55 + random() * 50)::int)),
       current_date - floor(random() * 40)::int,
       greatest(0, (30 - random() * 32)::int)
FROM public.conditions c
CROSS JOIN LATERAL (VALUES
  ('Type 2 Diabetes','Metformin','500mg'),
  ('Hypertension','Amlodipine','10mg'),
  ('Hypertension','Lisinopril','20mg'),
  ('Chronic Kidney Disease','Furosemide','40mg'),
  ('Heart Failure','Carvedilol','12.5mg')
) AS m(cond, med, dose)
WHERE m.cond = c.name AND random() < 0.85;

INSERT INTO public.vitals (patient_id, measured_at, systolic, diastolic, glucose_mmol, pulse, weight_kg, source)
SELECT p.id,
       now() - (d || ' days')::interval,
       (118 + floor(random() * 46) + (d * -0.06))::int,
       (74 + floor(random() * 24))::int,
       round((5.2 + random() * 5.4)::numeric, 1),
       (66 + floor(random() * 30))::int,
       round((62 + random() * 48)::numeric, 1),
       CASE WHEN random() < 0.82 THEN 'whatsapp' ELSE 'clinic' END
FROM public.patients p, generate_series(0, 87, 3) d
WHERE random() < 0.9;

INSERT INTO public.stock_items (facility_id, medication_name, on_hand, days_cover, status)
SELECT f.id, m.name,
       (random() * 900)::int,
       c.cover,
       CASE WHEN c.cover < 7 THEN 'critical' WHEN c.cover < 18 THEN 'low' ELSE 'ok' END
FROM public.facilities f
CROSS JOIN LATERAL (VALUES ('Metformin 500mg'), ('Amlodipine 10mg'), ('Lisinopril 20mg'), ('Insulin glargine'), ('Furosemide 40mg')) AS m(name)
CROSS JOIN LATERAL (SELECT (2 + random() * 48)::int AS cover) c;