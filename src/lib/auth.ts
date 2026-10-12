import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time string comparison; hashing first hides the secret's length too. */
export function safeEqual(given: string | null | undefined, expected: string): boolean {
  if (typeof given !== "string" || given.length === 0) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
