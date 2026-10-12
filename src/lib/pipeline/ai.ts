import "server-only";
import { ApiError, FinishReason, GoogleGenAI, ThinkingLevel, type GenerateContentParameters } from "@google/genai";
import { z } from "zod";
import { geminiApiKey } from "../env";
import { clip } from "./validate";

/*
 * One "prompt in, validated JSON out" call to Gemini, walking a model fallback chain (DESIGN §4).
 * The free tier allows 5 requests/minute per model and models are sometimes overloaded, so instead of
 * retrying a model we move to the next one at once: config errors fail fast, safety blocks stop, and a
 * 429 puts the model on cool-down so later calls skip it. A reply only counts once it parses as JSON
 * and passes the zod schema. Logs carry the label, model, outcome and timing, never prompts or keys.
 */

export const DEFAULT_MODELS = ["gemini-3.6-flash", "gemini-3-flash-preview", "gemini-3.5-flash-lite"];

/** Gemini answers HTTP 400 ("Minimum allowed deadline is 10s") to a shorter request timeout. */
const GEMINI_MIN_TIMEOUT_MS = 10_000;
/** Each attempt must end this long before the deadline, leaving room to record the outcome. */
const DEADLINE_MARGIN_MS = 1_000;
/** No attempt starts unless Gemini's minimum timeout still fits before the caller's deadline. */
const MIN_ATTEMPT_MS = GEMINI_MIN_TIMEOUT_MS + DEADLINE_MARGIN_MS;
/** Cool-down after a 429 that carries no RetryInfo. */
const DEFAULT_COOLDOWN_MS = 60_000;

export type AttemptOutcome =
  | "ok"
  | "cooldown"
  | "rate_limited"
  | "unavailable"
  | "not_found"
  | "timeout"
  | "network"
  | "bad_finish"
  | "empty"
  | "invalid_json"
  | "invalid_schema"
  | "blocked"
  | "config"
  | "error";

export type AiAttempt = { model: string; outcome: AttemptOutcome; ms: number; status?: number; detail?: string };

export type AiErrorCode = "unavailable" | "config" | "blocked" | "deadline" | "invalid";

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly attempts: AiAttempt[];

  constructor(code: AiErrorCode, message: string, attempts: AiAttempt[]) {
    super(message);
    this.name = "AiError";
    this.code = code;
    this.attempts = attempts;
  }
}

/** The part of a generateContent response this module reads; lets tests inject a fake client. */
export type AiResponse = {
  text?: string;
  candidates?: { finishReason?: FinishReason }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
};

export type AiClient = { generateContent(params: GenerateContentParameters): Promise<AiResponse> };

export type GenerateJsonOptions<T> = {
  /** Short name for logs and errors, e.g. "classify 1/3". */
  label: string;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  maxOutputTokens: number;
  /** Epoch ms; no attempt starts or runs past it. */
  deadline: number;
  perAttemptTimeoutMs?: number;
  thinking?: ThinkingLevel;
  /** Defaults to a shared GoogleGenAI client. */
  client?: AiClient;
  /** Defaults to modelChain(). */
  models?: readonly string[];
};

export type AiUsage = { inputTokens: number; outputTokens: number; thoughtsTokens: number };

export type GenerateJsonResult<T> = {
  data: T;
  model: string;
  attempts: AiAttempt[];
  ms: number;
  usage: AiUsage | null;
};

const cooldownUntil = new Map<string, number>();

/** Forgets every rate-limit cool-down (tests, or a fresh run in a long-lived process). */
export function clearCooldowns(): void {
  cooldownUntil.clear();
}

/** GEMINI_MODELS (comma-separated) overrides the default fallback chain. */
export function modelChain(): string[] {
  const configured = (process.env.GEMINI_MODELS ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set(configured.length > 0 ? configured : DEFAULT_MODELS)];
}

/** Attempts that actually sent a request (cool-down skips excluded). */
export function requestCount(attempts: readonly AiAttempt[]): number {
  return attempts.filter((a) => a.outcome !== "cooldown").length;
}

let sharedClient: AiClient | null = null;

function defaultClient(): AiClient {
  if (!sharedClient) {
    const genai = new GoogleGenAI({ apiKey: geminiApiKey(), vertexai: false });
    sharedClient = { generateContent: (params) => genai.models.generateContent(params) };
  }
  return sharedClient;
}

export async function generateJson<T>(opts: GenerateJsonOptions<T>): Promise<GenerateJsonResult<T>> {
  const started = Date.now();
  const attempts: AiAttempt[] = [];
  const record = (attempt: AiAttempt) => {
    attempts.push(attempt);
    const status = attempt.status ? ` status=${attempt.status}` : "";
    const detail = attempt.detail ? ` (${attempt.detail})` : "";
    const line = `[ai] ${opts.label} model=${attempt.model} outcome=${attempt.outcome} ms=${attempt.ms}${status}${detail}`;
    if (attempt.outcome === "ok") console.info(line);
    else console.warn(line);
  };

  let client: AiClient;
  let responseJsonSchema: unknown;
  try {
    client = opts.client ?? defaultClient();
    responseJsonSchema = z.toJSONSchema(opts.schema);
  } catch (e) {
    throw new AiError("config", `${opts.label}: ${errorMessage(e)}`, attempts);
  }

  for (const model of opts.models ?? modelChain()) {
    const remaining = opts.deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) {
      throw new AiError("deadline", `${opts.label}: time budget exhausted ${summarize(attempts)}`, attempts);
    }
    if ((cooldownUntil.get(model) ?? 0) > Date.now()) {
      record({ model, outcome: "cooldown", ms: 0 });
      continue;
    }

    const timeout = Math.max(GEMINI_MIN_TIMEOUT_MS, Math.min(opts.perAttemptTimeoutMs ?? 60_000, remaining - DEADLINE_MARGIN_MS));
    const t0 = Date.now();
    let response: AiResponse;
    try {
      response = await client.generateContent({
        model,
        contents: opts.prompt,
        config: {
          systemInstruction: opts.system,
          responseMimeType: "application/json",
          responseJsonSchema,
          thinkingConfig: { thinkingLevel: opts.thinking ?? ThinkingLevel.MINIMAL },
          maxOutputTokens: opts.maxOutputTokens,
          httpOptions: { timeout },
        },
      });
    } catch (e) {
      const failure = describeFailure(e);
      record({ model, ms: Date.now() - t0, ...failure.attempt });
      if (failure.cooldownMs) cooldownUntil.set(model, Date.now() + failure.cooldownMs);
      if (failure.attempt.outcome === "config") {
        const detail = failure.attempt.detail ? `: ${failure.attempt.detail}` : "";
        throw new AiError(
          "config",
          `${opts.label}: Gemini rejected the request (${failure.attempt.status})${detail}`,
          attempts,
        );
      }
      continue;
    }

    const read = readJson(response, opts.schema);
    const ms = Date.now() - t0;
    if (read.ok) {
      record({ model, outcome: "ok", ms });
      return { data: read.data, model, attempts, ms: Date.now() - started, usage: usageOf(response) };
    }
    record({ model, outcome: read.outcome, ms, detail: read.detail });
    if (read.outcome === "blocked") {
      throw new AiError("blocked", `${opts.label}: Gemini blocked the content (${read.detail})`, attempts);
    }
  }

  const code = finalCode(attempts, opts.deadline);
  throw new AiError(code, `${opts.label}: no Gemini model produced a usable reply ${summarize(attempts)}`, attempts);
}

/* ----------------------------- Failure classification ----------------------------- */

type Failure = { attempt: Omit<AiAttempt, "model" | "ms">; cooldownMs?: number };

function describeFailure(e: unknown): Failure {
  if (e instanceof ApiError) {
    const status = e.status;
    const body = parseApiErrorBody(e.message);
    if (status === 429) {
      return {
        attempt: { outcome: "rate_limited", status, detail: body.status },
        cooldownMs: body.retryMs ?? DEFAULT_COOLDOWN_MS,
      };
    }
    if (status === 400 || status === 401 || status === 403) {
      return { attempt: { outcome: "config", status, detail: body.message && clip(body.message, 200) } };
    }
    if (status === 404) return { attempt: { outcome: "not_found", status } };
    if (status === 408) return { attempt: { outcome: "timeout", status } };
    if (status >= 500) return { attempt: { outcome: "unavailable", status, detail: body.status } };
    return { attempt: { outcome: "error", status, detail: body.message && clip(body.message, 160) } };
  }
  if (isAbortError(e)) return { attempt: { outcome: "timeout" } };
  if (e instanceof TypeError) return { attempt: { outcome: "network", detail: clip(e.message, 120) } };
  return { attempt: { outcome: "error", detail: clip(errorMessage(e), 160) } };
}

const ApiErrorBodySchema = z.object({
  error: z.object({
    message: z.string().optional(),
    status: z.string().optional(),
    details: z.array(z.object({ "@type": z.string().optional(), retryDelay: z.string().optional() })).optional(),
  }),
});

/** ApiError messages carry the JSON error body: {error: {code, message, status, details}}. */
function parseApiErrorBody(message: string): { message?: string; status?: string; retryMs?: number } {
  let json: unknown;
  try {
    json = JSON.parse(message);
  } catch {
    return {};
  }
  const parsed = ApiErrorBodySchema.safeParse(json);
  if (!parsed.success) return {};
  const { error } = parsed.data;
  const delay = error.details?.find((d) => d["@type"]?.endsWith("google.rpc.RetryInfo"))?.retryDelay;
  return { message: error.message, status: error.status, retryMs: parseRetryDelay(delay) };
}

/** "30s" / "1.5s" → ms (at least one second). */
export function parseRetryDelay(delay: string | undefined): number | undefined {
  const m = delay ? /^(\d+(?:\.\d+)?)s$/.exec(delay.trim()) : null;
  return m ? Math.max(1_000, Math.round(Number(m[1]) * 1000)) : undefined;
}

function isAbortError(e: unknown): boolean {
  return (
    typeof e === "object" && e !== null && "name" in e && (e.name === "AbortError" || e.name === "TimeoutError")
  );
}

const OUTPUT_PROBLEMS = new Set<AttemptOutcome>(["bad_finish", "empty", "invalid_json", "invalid_schema"]);

function finalCode(attempts: readonly AiAttempt[], deadline: number): AiErrorCode {
  const sent = attempts.filter((a) => a.outcome !== "cooldown");
  if (sent.length > 0 && sent.every((a) => OUTPUT_PROBLEMS.has(a.outcome))) return "invalid";
  if (deadline - Date.now() < MIN_ATTEMPT_MS) return "deadline";
  return "unavailable";
}

/* ----------------------------- Reply parsing ----------------------------- */

const BLOCKED_FINISH = new Set<FinishReason>([
  FinishReason.SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.BLOCKLIST,
  FinishReason.SPII,
]);

type ReadResult<T> = { ok: true; data: T } | { ok: false; outcome: AttemptOutcome; detail?: string };

function readJson<T>(response: AiResponse, schema: z.ZodType<T>): ReadResult<T> {
  const blockReason = response.promptFeedback?.blockReason;
  if (blockReason) return { ok: false, outcome: "blocked", detail: blockReason };
  const finish = response.candidates?.[0]?.finishReason;
  if (finish && BLOCKED_FINISH.has(finish)) return { ok: false, outcome: "blocked", detail: finish };
  if (finish && finish !== FinishReason.STOP) return { ok: false, outcome: "bad_finish", detail: finish };

  const text = response.text?.trim();
  if (!text) return { ok: false, outcome: "empty" };
  let json: unknown;
  try {
    json = JSON.parse(stripCodeFences(text));
  } catch {
    return { ok: false, outcome: "invalid_json" };
  }
  const parsed = schema.safeParse(json);
  if (parsed.success) return { ok: true, data: parsed.data };
  const issue = parsed.error.issues[0];
  return { ok: false, outcome: "invalid_schema", detail: issue && `${issue.path.join(".") || "(root)"}: ${issue.code}` };
}

/** Some models wrap JSON in a markdown fence despite responseMimeType; unwrap it. */
export function stripCodeFences(text: string): string {
  const m = /^```[\w-]*\s*([\s\S]*?)\s*```$/.exec(text.trim());
  return m ? m[1] : text.trim();
}

function usageOf(response: AiResponse): AiUsage | null {
  const u = response.usageMetadata;
  if (!u) return null;
  return {
    inputTokens: u.promptTokenCount ?? 0,
    outputTokens: u.candidatesTokenCount ?? 0,
    thoughtsTokens: u.thoughtsTokenCount ?? 0,
  };
}

function summarize(attempts: readonly AiAttempt[]): string {
  if (attempts.length === 0) return "(no attempts)";
  return `(${attempts.map((a) => `${a.model}: ${a.outcome}${a.status ? ` ${a.status}` : ""}`).join("; ")})`;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
