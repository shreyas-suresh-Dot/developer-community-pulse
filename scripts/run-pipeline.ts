/*
 * Runs the weekly pipeline locally against the real sources, Gemini and Supabase.
 *   npm run pipeline -- --week 2026-10-09 --trigger backfill
 * Uses .env.local; prints the outcome and each step, never any secret.
 */
import { runPipeline } from "../src/lib/pipeline/run";
import { supabase } from "../src/lib/supabase";
import type { Trigger } from "../src/lib/pipeline/store";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const weekEnd = arg("week");
  const trigger = (arg("trigger") ?? "backfill") as Trigger;
  if (!["cron", "manual", "backfill"].includes(trigger)) throw new Error(`Unknown trigger ${trigger}`);

  const t0 = Date.now();
  try {
    const outcome = await runPipeline({ trigger, weekEnd });
    console.log(`\n✔ ${outcome.status} brief for week ending ${outcome.weekEnd} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    console.log(`  run ${outcome.runId} · brief ${outcome.briefId}`);
  } catch (e) {
    console.error(`\n✖ run failed after ${((Date.now() - t0) / 1000).toFixed(1)} s:`, e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }

  const { data } = await supabase().from("pipeline_runs").select("steps").order("started_at", { ascending: false }).limit(1);
  const steps = (data?.[0]?.steps ?? []) as Array<{ name: string; status: string; ms: number | null; detail: string }>;
  for (const s of steps) console.log(`  ${s.status.padEnd(7)} ${String(s.ms ?? "-").padStart(6)} ms  ${s.name}: ${s.detail}`);
}

main();
