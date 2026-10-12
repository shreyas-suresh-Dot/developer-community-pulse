import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/auth";
import { cronSecret } from "@/lib/env";
import { RunConflictError, runPipeline } from "@/lib/pipeline/run";

/*
 * Vercel Cron entry point (vercel.json: Friday 01:30 UTC = 07:00 IST). Vercel sends
 * "Authorization: Bearer $CRON_SECRET"; anything else is rejected. The run is awaited so the
 * function stays alive until the brief is saved and emailed.
 */

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!safeEqual(request.headers.get("authorization"), `Bearer ${cronSecret()}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const outcome = await runPipeline({ trigger: "cron" });
    return NextResponse.json(outcome);
  } catch (e) {
    if (e instanceof RunConflictError) {
      return NextResponse.json({ error: e.message, runId: e.runId }, { status: 409 });
    }
    console.error("[cron] weekly brief failed:", e);
    return NextResponse.json({ error: "Pipeline run failed; see the run log on /how-it-works." }, { status: 500 });
  }
}
