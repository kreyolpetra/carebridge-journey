// Swapped from a real @supabase/supabase-js client to an in-memory mock so this
// prototype runs standalone with no backend to configure. See src/lib/mock/.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { mockSupabaseClient } from "@/lib/mock";

export const supabase = mockSupabaseClient as unknown as SupabaseClient<Database>;
