import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { AiError, clearCooldowns, generateJson, type AiClient } from "./ai";

/** A Gemini stand-in that records the request timeout of every call and replies with valid JSON. */
function fakeClient() {
  const timeouts: (number | undefined)[] = [];
  const client: AiClient = {
    async generateContent(params) {
      timeouts.push(params.config?.httpOptions?.timeout);
      return { text: JSON.stringify({ ok: true }) };
    },
  };
  return { client, timeouts };
}

function call(client: AiClient, deadlineInMs: number, perAttemptTimeoutMs?: number) {
  return generateJson({
    label: "test",
    schema: z.object({ ok: z.boolean() }),
    system: "system",
    prompt: "prompt",
    maxOutputTokens: 100,
    deadline: Date.now() + deadlineInMs,
    perAttemptTimeoutMs,
    client,
    models: ["model-a"],
  });
}

describe("generateJson time limits", () => {
  beforeEach(() => clearCooldowns());

  it("never sends Gemini a timeout under its 10 s minimum, which it rejects with HTTP 400", async () => {
    const { client, timeouts } = fakeClient();
    await call(client, 12_000);
    await call(client, 120_000, 5_000);
    expect(timeouts).toHaveLength(2);
    for (const t of timeouts) expect(t).toBeGreaterThanOrEqual(10_000);
  });

  it("stops with a deadline error, without calling Gemini, when under 11 s remain", async () => {
    const { client, timeouts } = fakeClient();
    const error = await call(client, 9_000).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiError);
    expect((error as AiError).code).toBe("deadline");
    expect(timeouts).toHaveLength(0);
  });

  it("keeps the timeout inside the caller's deadline when there is time to spare", async () => {
    const { client, timeouts } = fakeClient();
    await call(client, 30_000);
    expect(timeouts[0]).toBeLessThanOrEqual(29_000);
    expect(timeouts[0]).toBeGreaterThan(28_000);
  });
});
