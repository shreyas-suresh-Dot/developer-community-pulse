import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { pipelineToken, supabaseEnv } from "./env";

/*
 * All Supabase access happens on the server with the publishable key.
 * Row-level security makes every table read-only for that key; writes go through
 * SECURITY DEFINER functions (pipeline_*) that check PIPELINE_DB_TOKEN inside the database.
 * See supabase/migrations/001_schema.sql.
 */

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    const { url, key } = supabaseEnv();
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}

/** Calls one of the token-gated write functions, e.g. pipelineRpc("pipeline_save_brief", { p_brief }). */
export async function pipelineRpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, { p_token: pipelineToken(), ...args });
  if (error) throw new Error(`Supabase ${fn} failed: ${error.message}`);
  return data as T;
}
