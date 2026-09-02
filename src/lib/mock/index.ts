// The assembled mock "Supabase client" — enough of the supabase-js surface
// (`.from`, `.auth`, `.rpc`, `.channel`) for this app's code to run unmodified
// against an in-memory dataset instead of a live Supabase project. See
// src/lib/mock/{db,query-builder,auth,rpc,realtime,seed}.ts for the pieces.
import { MockQueryBuilder } from "./query-builder";
import { mockAuth } from "./auth";
import { mockRpc } from "./rpc";
import { mockChannel } from "./realtime";

export const mockSupabaseClient = {
  from(table: string) {
    return new MockQueryBuilder(table);
  },
  auth: mockAuth,
  async rpc(fn: string, args: Record<string, unknown> = {}) {
    return mockRpc(fn, args);
  },
  channel(name: string) {
    return mockChannel(name);
  },
  async removeChannel(channel: { unsubscribe: () => void }) {
    channel.unsubscribe();
  },
};
