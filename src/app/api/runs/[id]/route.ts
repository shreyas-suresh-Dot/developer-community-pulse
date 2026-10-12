import { NextResponse } from "next/server";
import { getRun } from "@/lib/data";

/* Run progress for the "Run now" panel, which polls this every 2 s. Public, read-only, never cached. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
  try {
    const run = await getRun(id);
    if (!run) return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
    return NextResponse.json(run, { headers: NO_STORE });
  } catch (e) {
    console.error("[runs] read failed:", e);
    return NextResponse.json({ error: "Could not read the run." }, { status: 500, headers: NO_STORE });
  }
}
