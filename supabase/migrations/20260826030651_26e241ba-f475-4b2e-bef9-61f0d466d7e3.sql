-- CariCare Grid core schema (synthetic demo dataset, no real patient data)

CREATE TABLE public.islands (
  code text PRIMARY KEY,
  name text NOT NULL,
  country text NOT NULL,
  population int NOT NULL DEFAULT 0,
  lat double precision NOT NULL,
  lng double precision NOT NULL
);

CREATE TABLE public.facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  island_code text NOT NULL REFERENCES public.islands(code),
  kind text NOT NULL DEFAULT 'clinic',
  beds_total int NOT NULL DEFAULT 0,
  beds_occupied int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  specialty text NOT NULL,
  island_code text NOT NULL REFERENCES public.islands(code),
  facility_id uuid REFERENCES public.facilities(id) ON DELETE SET NULL,
  languages text[] NOT NULL DEFAULT ARRAY['en'],
  teleconsult_rate_usd int NOT NULL DEFAULT 60,
  next_local_wait_days int NOT NULL DEFAULT 14,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.availability_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  minutes int NOT NULL DEFAULT 20,
  status text NOT NULL DEFAULT 'open'
);

CREATE TABLE public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text NOT NULL,
  age int NOT NULL,
  sex text NOT NULL,
  island_code text NOT NULL REFERENCES public.islands(code),
  parish text NOT NULL,
  language text NOT NULL DEFAULT 'en',
  rural boolean NOT NULL DEFAULT false,
  km_to_facility int NOT NULL DEFAULT 5,
  insurer text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  name text NOT NULL,
  diagnosed_on date NOT NULL DEFAULT current_date
);

CREATE TABLE public.medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  name text NOT NULL,
  dosage text NOT NULL DEFAULT '',
  frequency text NOT NULL DEFAULT 'daily',
  adherence_pct int NOT NULL DEFAULT 80,
  last_refill_on date,
  days_supply_left int NOT NULL DEFAULT 14
);

CREATE TABLE public.vitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  measured_at timestamptz NOT NULL DEFAULT now(),
  systolic int,
  diastolic int,
  glucose_mmol numeric(4,1),
  pulse int,
  weight_kg numeric(5,1),
  source text NOT NULL DEFAULT 'whatsapp'
);
CREATE INDEX vitals_patient_time_idx ON public.vitals (patient_id, measured_at DESC);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  direction text NOT NULL,
  body text NOT NULL,
  kind text NOT NULL DEFAULT 'text',
  language text NOT NULL DEFAULT 'en',
  channel text NOT NULL DEFAULT 'whatsapp',
  queued_offline boolean NOT NULL DEFAULT false,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_patient_time_idx ON public.messages (patient_id, created_at);

CREATE TABLE public.triage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  severity text NOT NULL,
  category text NOT NULL,
  recommended_level text NOT NULL,
  rationale text NOT NULL DEFAULT '',
  red_flags text[] NOT NULL DEFAULT '{}',
  confidence numeric(3,2) NOT NULL DEFAULT 0.8,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  triage_event_id uuid REFERENCES public.triage_events(id) ON DELETE SET NULL,
  to_provider_id uuid REFERENCES public.providers(id) ON DELETE SET NULL,
  specialty text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  cross_island boolean NOT NULL DEFAULT false,
  reason text NOT NULL DEFAULT '',
  wait_days_local int NOT NULL DEFAULT 0,
  wait_days_routed int NOT NULL DEFAULT 0,
  retained_value_usd int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid REFERENCES public.referrals(id) ON DELETE SET NULL,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES public.providers(id) ON DELETE SET NULL,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'scheduled',
  notes text NOT NULL DEFAULT '',
  plan text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.consent_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES public.providers(id) ON DELETE CASCADE,
  scope text[] NOT NULL DEFAULT ARRAY['vitals','medications','conditions'],
  purpose text NOT NULL DEFAULT 'teleconsult',
  status text NOT NULL DEFAULT 'pending',
  granted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.consent_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES public.providers(id) ON DELETE SET NULL,
  grant_id uuid REFERENCES public.consent_grants(id) ON DELETE SET NULL,
  resource text NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  accessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.risk_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  score int NOT NULL,
  band text NOT NULL,
  trend text NOT NULL DEFAULT 'stable',
  drivers jsonb NOT NULL DEFAULT '[]'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX risk_scores_patient_idx ON public.risk_scores (patient_id, computed_at DESC);

CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  island_code text REFERENCES public.islands(code),
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
  title text NOT NULL,
  detail text NOT NULL DEFAULT '',
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  medication_name text NOT NULL,
  on_hand int NOT NULL DEFAULT 0,
  days_cover int NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'ok'
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['islands','facilities','providers','availability_slots','patients',
    'conditions','medications','vitals','messages','triage_events','referrals','consultations',
    'consent_grants','consent_access_log','risk_scores','alerts','stock_items']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "demo_read_%s" ON public.%I FOR SELECT USING (true)', t, t);
    EXECUTE format('CREATE POLICY "demo_write_%s" ON public.%I FOR INSERT WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "demo_update_%s" ON public.%I FOR UPDATE USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "demo_delete_%s" ON public.%I FOR DELETE USING (true)', t, t);
  END LOOP;
END $$;