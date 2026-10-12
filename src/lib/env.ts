import "server-only";
import { z } from "zod";

/*
 * Server-only environment access. Each feature validates just the variables it needs,
 * so a missing optional integration (e.g. email) never breaks page rendering.
 * Values come from .env.local locally and from Vercel project settings in production.
 */

function read<T extends z.ZodRawShape>(feature: string, shape: T): z.infer<z.ZodObject<T>> {
  const parsed = z.object(shape).safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`${feature} is not configured: missing or invalid env var(s) ${missing}. See README → Setup.`);
  }
  return parsed.data;
}

export function supabaseEnv() {
  const env = read("Supabase", {
    SUPABASE_URL: z.string().url(),
    SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  });
  return { url: env.SUPABASE_URL, key: env.SUPABASE_PUBLISHABLE_KEY };
}

/** Token the database functions require for every write (only its SHA-256 is stored in Supabase). */
export function pipelineToken(): string {
  return read("Pipeline writes", { PIPELINE_DB_TOKEN: z.string().min(32) }).PIPELINE_DB_TOKEN;
}

export function geminiApiKey(): string {
  return read("Gemini", { GEMINI_API_KEY: z.string().min(10) }).GEMINI_API_KEY;
}

export function cronSecret(): string {
  return read("Cron", { CRON_SECRET: z.string().min(16) }).CRON_SECRET;
}

export function adminPasscode(): string {
  return read("Manual runs", { ADMIN_PASSCODE: z.string().min(8) }).ADMIN_PASSCODE;
}

/** Email delivery is optional: returns null when Resend is not configured. */
export function emailEnv(): { apiKey: string; to: string[]; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = (process.env.BRIEF_RECIPIENTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!apiKey || to.length === 0) return null;
  const from = process.env.BRIEF_FROM?.trim() || "Community Pulse <onboarding@resend.dev>";
  return { apiKey, to, from };
}

/** Absolute base URL for links in emails. */
export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}
