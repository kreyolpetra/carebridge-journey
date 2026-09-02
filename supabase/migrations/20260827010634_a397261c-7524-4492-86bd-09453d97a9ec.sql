-- staff roles inside a hospital/clinic
DO $$ BEGIN
  CREATE TYPE public.staff_role AS ENUM ('doctor','nurse','front_desk','org_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.facility_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  staff_role public.staff_role NOT NULL DEFAULT 'doctor',
  title text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, facility_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.facility_staff TO authenticated;
GRANT SELECT ON public.facility_staff TO anon;
GRANT ALL ON public.facility_staff TO service_role;
ALTER TABLE public.facility_staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY demo_read_facility_staff ON public.facility_staff FOR SELECT USING (true);
CREATE POLICY demo_write_facility_staff ON public.facility_staff FOR INSERT WITH CHECK (true);
CREATE POLICY demo_update_facility_staff ON public.facility_staff FOR UPDATE USING (true);
CREATE POLICY demo_delete_facility_staff ON public.facility_staff FOR DELETE USING (true);

-- every time a patient is seen at a facility
CREATE TABLE public.encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES public.providers(id),
  consultation_id uuid REFERENCES public.consultations(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'clinic_visit',
  reason text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'closed',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX encounters_patient_idx ON public.encounters(patient_id);
CREATE INDEX encounters_facility_idx ON public.encounters(facility_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.encounters TO authenticated;
GRANT SELECT ON public.encounters TO anon;
GRANT ALL ON public.encounters TO service_role;
ALTER TABLE public.encounters ENABLE ROW LEVEL SECURITY;
CREATE POLICY demo_read_encounters ON public.encounters FOR SELECT USING (true);
CREATE POLICY demo_write_encounters ON public.encounters FOR INSERT WITH CHECK (true);
CREATE POLICY demo_update_encounters ON public.encounters FOR UPDATE USING (true);
CREATE POLICY demo_delete_encounters ON public.encounters FOR DELETE USING (true);

-- which facility captured each clinical item
ALTER TABLE public.consultations ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id);
ALTER TABLE public.vitals        ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id);
ALTER TABLE public.conditions    ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id);
ALTER TABLE public.medications   ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id);
ALTER TABLE public.profiles      ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id);
ALTER TABLE public.profiles      ADD COLUMN IF NOT EXISTS staff_role public.staff_role;

-- helper: facilities a staff user works at
CREATE OR REPLACE FUNCTION public.staff_facility_ids(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT facility_id FROM public.facility_staff WHERE user_id = _user_id
$$;

-- helper: facilities that have seen a patient (automatic sharing inside the Grid)
CREATE OR REPLACE FUNCTION public.patient_facility_ids(_patient_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT facility_id FROM public.encounters WHERE patient_id = _patient_id
$$;

CREATE OR REPLACE FUNCTION public.can_staff_see_patient(_user_id uuid, _patient_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.facility_staff fs
    JOIN public.encounters e ON e.facility_id = fs.facility_id
    WHERE fs.user_id = _user_id AND e.patient_id = _patient_id
  )
$$;

-- backfill sources
UPDATE public.consultations c SET facility_id = p.facility_id
  FROM public.providers p WHERE c.provider_id = p.id AND c.facility_id IS NULL;

UPDATE public.vitals v SET facility_id = f.id
  FROM public.patients pt
  JOIN LATERAL (SELECT id FROM public.facilities WHERE island_code = pt.island_code AND kind = 'clinic' ORDER BY name LIMIT 1) f ON true
  WHERE v.patient_id = pt.id AND v.facility_id IS NULL AND v.source <> 'patient';

UPDATE public.medications m SET facility_id = f.id
  FROM public.patients pt
  JOIN LATERAL (SELECT id FROM public.facilities WHERE island_code = pt.island_code AND kind = 'clinic' ORDER BY name LIMIT 1) f ON true
  WHERE m.patient_id = pt.id AND m.facility_id IS NULL;

UPDATE public.conditions cd SET facility_id = f.id
  FROM public.patients pt
  JOIN LATERAL (SELECT id FROM public.facilities WHERE island_code = pt.island_code AND kind = 'hospital' ORDER BY name LIMIT 1) f ON true
  WHERE cd.patient_id = pt.id AND cd.facility_id IS NULL;

-- encounters from existing visits
INSERT INTO public.encounters (patient_id, facility_id, provider_id, consultation_id, kind, reason, summary, status, started_at, ended_at)
SELECT c.patient_id, c.facility_id, c.provider_id, c.id,
       'clinic_visit',
       COALESCE(NULLIF(c.notes, ''), 'Chronic care visit'),
       COALESCE(NULLIF(c.plan, ''), ''),
       CASE WHEN c.status = 'completed' THEN 'closed' ELSE 'open' END,
       c.scheduled_at,
       CASE WHEN c.status = 'completed' THEN c.scheduled_at + interval '35 minutes' ELSE NULL END
FROM public.consultations c
WHERE c.facility_id IS NOT NULL;

-- demo patient seen at both a Jamaican clinic and a Trinidadian hospital
INSERT INTO public.encounters (patient_id, facility_id, provider_id, kind, reason, summary, status, started_at, ended_at)
VALUES
  ('11111111-1111-4111-8111-111111111111'::uuid, 'a0ce1541-1e9d-4cce-81a5-218002bddd9d'::uuid, NULL,
   'clinic_visit', 'Walk-in: headaches and blurred vision',
   'BP 168/104 at the clinic. Started on amlodipine, referred into the Grid for cardiology.',
   'closed', now() - interval '21 days', now() - interval '21 days' + interval '40 minutes'),
  ('11111111-1111-4111-8111-111111111111'::uuid, '5e722b4d-9d67-4664-a8ad-59e47896c391'::uuid, NULL,
   'emergency', 'A&E presentation: chest tightness',
   'ECG normal sinus rhythm, troponin negative. Observed 6 hours, discharged with cardiology follow-up.',
   'closed', now() - interval '9 days', now() - interval '9 days' + interval '6 hours'),
  ('11111111-1111-4111-8111-111111111111'::uuid, '2c65425d-ad09-4e50-a019-f8afa29a14b4'::uuid, NULL,
   'teleconsult', 'Cross-island cardiology teleconsult', '',
   'open', now() + interval '1 day', NULL);