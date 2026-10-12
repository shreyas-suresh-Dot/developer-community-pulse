import "server-only";
import type { FetchContext } from "../types";

/*
 * The one HTTP client the source adapters use: JSON GETs with a per-request timeout, one retry with
 * backoff on 429 / 5xx / timeouts / network errors / garbled JSON, a descriptive User-Agent (the
 * community APIs ask for one) and a request counter for the quality panel. It never throws: callers
 * get a result object and decide. Errors carry a caller-supplied label instead of the URL, so an API
 * key in a query string never reaches notes or logs. No request starts after ctx.deadline.
 */

export const USER_AGENT = "CommunityPulse/1.0 (+https://github.com/shreyas-suresh-Dot/developer-community-pulse)";

export type HttpOptions = {
  timeoutMs: number;
  /** Extra attempts after the first one, for retryable failures only. */
  retries: number;
  /** First backoff delay, doubled per retry with a little jitter. A Retry-After header wins (capped). */
  retryDelayMs: number;
  maxRetryDelayMs: number;
};

export const DEFAULT_HTTP_OPTIONS: HttpOptions = {
  timeoutMs: 10_000,
  retries: 1,
  retryDelayMs: 1_000,
  maxRetryDelayMs: 8_000,
};

export type JsonResult =
  | { ok: true; status: number; data: unknown }
  | {
      ok: false;
      /** HTTP status, or null when no response arrived (timeout, network error, skipped). */
      status: number | null;
      /** Parsed body when the server explained the error in JSON (Stack Exchange does), else null. */
      data: unknown;
      error: string;
      /** True when nothing was sent because the time budget was spent or the run was aborted. */
      skipped: boolean;
    };

export type HttpClient = {
  getJson(url: string, label: string): Promise<JsonResult>;
  /** HTTP attempts sent so far, retries included. */
  readonly requests: number;
};

type Attempt =
  | { kind: "ok"; status: number; data: unknown }
  | { kind: "error"; status: number | null; data: unknown; error: string; retryable: boolean; retryAfterMs: number | null };

/** Why no new request may start, or null when the source can keep going. */
export function stopReason(ctx: FetchContext): string | null {
  if (ctx.signal?.aborted) return "run aborted";
  if (Date.now() >= ctx.deadline) return "time budget exhausted";
  return null;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

/** Runs `fn` over `items` with at most `limit` in flight; results keep the input order. */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

function parseJson(body: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(body) as unknown };
  } catch {
    return { ok: false };
  }
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

function describeNetworkError(err: unknown): string {
  if (!(err instanceof Error)) return "network error";
  const cause = err.cause;
  const code = cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string" ? cause.code : null;
  return code ? `network error (${code})` : `network error (${err.message})`;
}

async function attemptOnce(url: string, timeoutMs: number, signal: AbortSignal | undefined): Promise<Attempt> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const failure = (err: unknown): Attempt => {
    if (signal?.aborted) return { kind: "error", status: null, data: null, error: "run aborted", retryable: false, retryAfterMs: null };
    if (timeout.aborted) {
      const error = `timed out after ${Math.round(timeoutMs / 1000)} s`;
      return { kind: "error", status: null, data: null, error, retryable: true, retryAfterMs: null };
    }
    return { kind: "error", status: null, data: null, error: describeNetworkError(err), retryable: true, retryAfterMs: null };
  };

  let response: Response;
  let body: string;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: combined,
    });
    body = await response.text();
  } catch (err) {
    return failure(err);
  }

  const parsed = parseJson(body);
  if (response.ok) {
    if (parsed.ok) return { kind: "ok", status: response.status, data: parsed.value };
    const error = `invalid JSON in HTTP ${response.status} response`;
    return { kind: "error", status: response.status, data: null, error, retryable: true, retryAfterMs: null };
  }
  return {
    kind: "error",
    status: response.status,
    data: parsed.ok ? parsed.value : null,
    error: `HTTP ${response.status}`,
    retryable: response.status === 429 || response.status >= 500,
    retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
  };
}

export function createHttpClient(ctx: FetchContext, options: Partial<HttpOptions> = {}): HttpClient {
  const opts: HttpOptions = { ...DEFAULT_HTTP_OPTIONS, ...options };
  let requests = 0;

  async function getJson(url: string, label: string): Promise<JsonResult> {
    for (let attempt = 0; ; attempt++) {
      const stop = stopReason(ctx);
      if (stop) return { ok: false, status: null, data: null, error: `${label}: ${stop}`, skipped: attempt === 0 };

      requests++;
      const outcome = await attemptOnce(url, opts.timeoutMs, ctx.signal);
      if (outcome.kind === "ok") return { ok: true, status: outcome.status, data: outcome.data };

      const retriesLeft = attempt < opts.retries;
      const fail = (suffix = ""): JsonResult => ({
        ok: false,
        status: outcome.status,
        data: outcome.data,
        error: `${label}: ${outcome.error}${attempt > 0 ? ` (after ${attempt + 1} attempts)` : ""}${suffix}`,
        skipped: false,
      });
      if (!outcome.retryable || !retriesLeft) return fail();

      const exponential = opts.retryDelayMs * 2 ** attempt * (1 + Math.random() * 0.25);
      const delay = Math.min(outcome.retryAfterMs ?? exponential, opts.maxRetryDelayMs);
      if (Date.now() + delay >= ctx.deadline) return fail(" (no time left to retry)");
      await sleep(delay, ctx.signal);
    }
  }

  return {
    getJson,
    get requests() {
      return requests;
    },
  };
}
