REVOKE ALL ON FUNCTION public.staff_facility_ids(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.patient_facility_ids(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_staff_see_patient(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_facility_ids(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.patient_facility_ids(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_staff_see_patient(uuid, uuid) TO service_role;