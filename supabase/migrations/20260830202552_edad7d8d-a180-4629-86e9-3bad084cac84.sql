
-- 1. Treating window policies
CREATE TABLE public.treating_window_policies (
  facility_kind text PRIMARY KEY,
  label text NOT NULL,
  days integer NOT NULL,
  rationale text NOT NULL DEFAULT ''
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treating_window_policies TO authenticated;
GRANT SELECT ON public.treating_window_policies TO anon;
GRANT ALL ON public.treating_window_policies TO service_role;
ALTER TABLE public.treating_window_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY demo_read_twp ON public.treating_window_policies FOR SELECT USING (true);
CREATE POLICY demo_write_twp ON public.treating_window_policies FOR INSERT WITH CHECK (true);
CREATE POLICY demo_update_twp ON public.treating_window_policies FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY demo_delete_twp ON public.treating_window_policies FOR DELETE USING (true);

INSERT INTO public.treating_window_policies (facility_kind, label, days, rationale) VALUES
 ('emergency','ED / A&E',7,'Short handover and re-presentation window'),
 ('hospital','Acute inpatient hospital',30,'Discharge summary, readmission and complications'),
 ('specialist','Outpatient / specialist clinic',90,'Standard follow-up cycle'),
 ('clinic','Primary care / community clinic',365,'Continuous longitudinal relationship'),
 ('pharmacy','Pharmacy',30,'Refill window'),
 ('lab','Lab / imaging',14,'Result review window');

-- 2. Institutional data sharing agreements
CREATE TABLE public.data_sharing_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL,
  from_facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  to_facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  scope text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active',
  executed_on date NOT NULL DEFAULT current_date,
  expires_at date NOT NULL,
  review_due_on date NOT NULL,
  patient_opt_out_allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_sharing_agreements TO authenticated;
GRANT SELECT ON public.data_sharing_agreements TO anon;
GRANT ALL ON public.data_sharing_agreements TO service_role;
ALTER TABLE public.data_sharing_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY demo_read_dsa ON public.data_sharing_agreements FOR SELECT USING (true);
CREATE POLICY demo_write_dsa ON public.data_sharing_agreements FOR INSERT WITH CHECK (true);
CREATE POLICY demo_update_dsa ON public.data_sharing_agreements FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY demo_delete_dsa ON public.data_sharing_agreements FOR DELETE USING (true);

-- 3. Sensitivity tagging on clinical records
ALTER TABLE public.conditions ADD COLUMN IF NOT EXISTS sensitivity text NOT NULL DEFAULT 'standard';
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS sensitivity text NOT NULL DEFAULT 'standard';
ALTER TABLE public.consultations ADD COLUMN IF NOT EXISTS sensitivity text NOT NULL DEFAULT 'standard';
ALTER TABLE public.encounters ADD COLUMN IF NOT EXISTS sensitivity text NOT NULL DEFAULT 'standard';

-- 4. Sensitive category grants
CREATE TABLE public.sensitive_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  category text NOT NULL,
  provider_id uuid REFERENCES public.providers(id) ON DELETE SET NULL,
  facility_id uuid REFERENCES public.facilities(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  purpose text NOT NULL DEFAULT '',
  granted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sensitive_grants TO authenticated;
GRANT SELECT ON public.sensitive_grants TO anon;
GRANT ALL ON public.sensitive_grants TO service_role;
ALTER TABLE public.sensitive_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY demo_read_sg ON public.sensitive_grants FOR SELECT USING (true);
CREATE POLICY demo_write_sg ON public.sensitive_grants FOR INSERT WITH CHECK (true);
CREATE POLICY demo_update_sg ON public.sensitive_grants FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY demo_delete_sg ON public.sensitive_grants FOR DELETE USING (true);

-- 5. Care team membership with role tiers
CREATE TABLE public.care_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES public.providers(id) ON DELETE SET NULL,
  user_id uuid,
  tier text NOT NULL DEFAULT 'attending',
  encounter_id uuid REFERENCES public.encounters(id) ON DELETE SET NULL,
  active_from timestamptz NOT NULL DEFAULT now(),
  active_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.care_team_members TO authenticated;
GRANT SELECT ON public.care_team_members TO anon;
GRANT ALL ON public.care_team_members TO service_role;
ALTER TABLE public.care_team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY demo_read_ctm ON public.care_team_members FOR SELECT USING (true);
CREATE POLICY demo_write_ctm ON public.care_team_members FOR INSERT WITH CHECK (true);
CREATE POLICY demo_update_ctm ON public.care_team_members FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY demo_delete_ctm ON public.care_team_members FOR DELETE USING (true);

-- 6. Break-glass emergency access
CREATE TABLE public.break_glass_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  facility_id uuid REFERENCES public.facilities(id) ON DELETE SET NULL,
  provider_id uuid REFERENCES public.providers(id) ON DELETE SET NULL,
  user_id uuid,
  actor_name text NOT NULL DEFAULT '',
  actor_tier text NOT NULL DEFAULT 'attending',
  reason text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  patient_notified_at timestamptz,
  review_status text NOT NULL DEFAULT 'pending',
  reviewed_at timestamptz,
  reviewer_note text NOT NULL DEFAULT ''
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.break_glass_events TO authenticated;
GRANT SELECT ON public.break_glass_events TO anon;
GRANT ALL ON public.break_glass_events TO service_role;
ALTER TABLE public.break_glass_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY demo_read_bg ON public.break_glass_events FOR SELECT USING (true);
CREATE POLICY demo_write_bg ON public.break_glass_events FOR INSERT WITH CHECK (true);
CREATE POLICY demo_update_bg ON public.break_glass_events FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY demo_delete_bg ON public.break_glass_events FOR DELETE USING (true);

-- 7. Richer access log
ALTER TABLE public.consent_access_log ADD COLUMN IF NOT EXISTS basis text NOT NULL DEFAULT 'consent';
ALTER TABLE public.consent_access_log ADD COLUMN IF NOT EXISTS tier text;
ALTER TABLE public.consent_access_log ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id) ON DELETE SET NULL;
ALTER TABLE public.consent_access_log ADD COLUMN IF NOT EXISTS sensitive_category text;
ALTER TABLE public.consent_access_log ADD COLUMN IF NOT EXISTS actor_name text;
ALTER TABLE public.consent_access_log ADD COLUMN IF NOT EXISTS break_glass_id uuid REFERENCES public.break_glass_events(id) ON DELETE SET NULL;
UPDATE public.consent_access_log SET basis = CASE WHEN grant_id IS NULL THEN 'treating' ELSE 'consent' END;

-- 8. Demo content: institutional agreement, sensitive records, care team, break-glass
INSERT INTO public.data_sharing_agreements (reference, from_facility_id, to_facility_id, purpose, scope, status, executed_on, expires_at, review_due_on)
VALUES
 ('DSA-JM-TT-2026-001',
  'a0ce1541-1e9d-4cce-81a5-218002bddd9d',
  '2c65425d-ad09-4e50-a019-f8afa29a14b4',
  'Standing cardiology and endocrinology referral pipeline (Kingston community clinic to Trinidad General)',
  ARRAY['demographics','vitals','conditions','medications','referrals','encounter summaries'],
  'active', current_date - 120, current_date + 490, current_date + 130),
 ('DSA-JM-TT-2026-004',
  '5e722b4d-9d67-4664-a8ad-59e47896c391',
  '2c65425d-ad09-4e50-a019-f8afa29a14b4',
  'Tertiary escalation and inpatient transfer pathway',
  ARRAY['demographics','vitals','conditions','medications','encounter summaries','labs'],
  'active', current_date - 60, current_date + 540, current_date + 180),
 ('DSA-JM-AG-2025-011',
  'a0ce1541-1e9d-4cce-81a5-218002bddd9d',
  'cbbbc668-51f2-4f5d-a67e-57076dbbebd4',
  'Diaspora continuity of care for seasonal workers',
  ARRAY['demographics','medications','conditions'],
  'expiring', current_date - 700, current_date + 20, current_date - 5);

UPDATE public.conditions SET sensitivity = 'mental_health'
WHERE patient_id = '11111111-1111-4111-8111-111111111111'
  AND id = (SELECT id FROM public.conditions WHERE patient_id = '11111111-1111-4111-8111-111111111111' ORDER BY diagnosed_on LIMIT 1);

INSERT INTO public.care_team_members (patient_id, facility_id, provider_id, tier) VALUES
 ('11111111-1111-4111-8111-111111111111'::uuid, 'a0ce1541-1e9d-4cce-81a5-218002bddd9d'::uuid, '74796b4d-c546-4ee6-bfa1-4212bc07cac1'::uuid, 'attending'),
 ('11111111-1111-4111-8111-111111111111'::uuid, 'a0ce1541-1e9d-4cce-81a5-218002bddd9d'::uuid, NULL, 'nursing'),
 ('11111111-1111-4111-8111-111111111111'::uuid, '2c65425d-ad09-4e50-a019-f8afa29a14b4'::uuid, NULL, 'consulting');

INSERT INTO public.break_glass_events (patient_id, facility_id, actor_name, actor_tier, reason, started_at, expires_at, patient_notified_at, review_status)
VALUES ('11111111-1111-4111-8111-111111111111', '5e722b4d-9d67-4664-a8ad-59e47896c391',
 'Dr. Simone Baptiste', 'attending',
 'Unresponsive on arrival to A&E; medication and allergy history required immediately.',
 now() - interval '9 days', now() - interval '8 days', now() - interval '9 days' + interval '20 minutes', 'cleared');
