/**
 * Results, and whether repeating one would waste a scarce lab.
 *
 * The problem this exists for: because records do not move between facilities,
 * the same blood test gets ordered again. The patient pays twice, waits twice,
 * and a laboratory that serves a whole island spends its capacity confirming
 * something it already knows.
 *
 * CareBridge already holds the earlier result. All that was missing was showing
 * it to the clinician about to order the test — and saying, in the plainest
 * terms, how long ago it was done and whether that is recent enough to rely on.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { unwrap } from "@/lib/api";

export type LabResult = {
  id: string;
  patient_id: string;
  facility_id: string | null;
  ordered_by_provider_id: string | null;
  test_code: string;
  test_name: string;
  value: string;
  unit: string;
  abnormal: boolean;
  collected_at: string;
  created_at: string;
};

/**
 * How long a result stays good enough to act on, in days.
 *
 * These are ordinary chronic-disease monitoring intervals, not a clinical
 * protocol: HbA1c reflects roughly three months of glycaemia, so repeating it
 * inside that window measures the same red cells twice. A clinician can always
 * repeat sooner with a reason — the panel says "recently done", never "do not
 * order".
 */
export const REPEAT_INTERVAL_DAYS: Record<string, number> = {
  hba1c: 90,
  lipids: 365,
  creatinine: 180,
  egfr: 180,
  acr: 365,
  tsh: 365,
  fbc: 90,
};

export type ResultAge = {
  result: LabResult;
  days: number;
  /** True when a repeat would land inside the interval the test is good for. */
  recent: boolean;
  intervalDays: number | null;
};

export function ageResult(r: LabResult): ResultAge {
  const days = Math.floor((Date.now() - new Date(r.collected_at).getTime()) / 86400000);
  const intervalDays = REPEAT_INTERVAL_DAYS[r.test_code] ?? null;
  return { result: r, days, recent: intervalDays !== null && days < intervalDays, intervalDays };
}

/**
 * The newest result per test, since only the newest one answers the question
 * "has this already been done".
 */
export function latestPerTest(results: LabResult[]): ResultAge[] {
  const newest = new Map<string, LabResult>();
  for (const r of results) {
    const prev = newest.get(r.test_code);
    if (!prev || new Date(r.collected_at) > new Date(prev.collected_at)) newest.set(r.test_code, r);
  }
  return [...newest.values()]
    .map(ageResult)
    .sort((a, b) => Number(b.recent) - Number(a.recent) || a.days - b.days);
}

export const labResultsQuery = queryOptions({
  queryKey: ["lab_results"],
  staleTime: 15_000,
  queryFn: async () =>
    unwrap<LabResult[]>(
      await supabase
        .from("lab_results")
        .select("*")
        .order("collected_at", { ascending: false })
        .limit(4000),
    ),
});
