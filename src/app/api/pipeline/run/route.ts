import { after, NextResponse } from "next/server";
import { z } from "zod";
import { safeEqual } from "@/lib/auth";
import { adminPasscode } from "@/lib/env";
import { resolveWeekEnd, runPipeline } from "@/lib/pipeline/run";
import { findActiveRun, lastRunStartedAt, startRun } from "@/lib/pipeline/store";

/*
 * Manual "Run now" (passcode-protected). Responds 202 with the run id straight away and keeps
 * working after the response (after()), so the browser can poll /api/runs/:id for live progress.
 * One run per week at a time, and a short cooldown between runs protects the free API quotas.
 */

export const maxDuration = 300;

const COOLDOWN_MS = 120_000;

const Body = z.object({
  passcode: z.string().min(1).max(200),
  weekEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON: { passcode, weekEnd? }" }, { status: 400 });
  }
  const body = Body.safeParse(json);
  if (!body.success) return NextResponse.json({ error: "Send JSON: { passcode, weekEnd? (YYYY-MM-DD) }" }, { status: 400 });
  if (!safeEqual(body.data.passcode, adminPasscode())) {
    return NextResponse.json({ error: "Wrong passcode." }, { status: 401 });
  }

  let weekEnd: string;
  try {
    weekEnd = resolveWeekEnd(body.data.weekEnd);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid week." }, { status: 400 });
  }

  try {
    const active = await findActiveRun(weekEnd);
    if (active) return NextResponse.json({ error: "A run for this week is already in progress.", runId: active.id }, { status: 409 });

    const last = await lastRunStartedAt();
    const wait = last ? COOLDOWN_MS - (Date.now() - last.getTime()) : 0;
    if (wait > 0) {
      const retryAfterSec = Math.ceil(wait / 1000);
      return NextResponse.json(
        { error: `Another run started moments ago; try again in ${retryAfterSec} s.`, retryAfterSec },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
      );
    }

    const runId = await startRun("manual", weekEnd);
    after(async () => {
      try {
        await runPipeline({ trigger: "manual", weekEnd, runId });
      } catch (e) {
        console.error("[manual run] failed:", e);
      }
    });
    return NextResponse.json({ runId, weekEnd }, { status: 202 });
  } catch (e) {
    console.error("[manual run] could not start:", e);
    return NextResponse.json({ error: "Could not start the run. Please try again." }, { status: 500 });
  }
}
