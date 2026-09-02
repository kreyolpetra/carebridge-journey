// Server-side admin client — also swapped to the in-memory mock (no real RLS
// to bypass once there's no real backend). See src/lib/mock/.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { mockSupabaseClient } from "@/lib/mock";

export const supabaseAdmin = mockSupabaseClient as unknown as SupabaseClient<Database>;
