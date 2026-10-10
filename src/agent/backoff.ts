/**
 * Exponential backoff with full jitter.
 * attempt starts at 1 for the first failure.
 */
export function computeBackoffMs(
  attempt: number,
  opts?: { baseMs?: number; maxMs?: number; retryAfterMs?: number },
): number {
  if (opts?.retryAfterMs != null && opts.retryAfterMs >= 0) {
    return opts.retryAfterMs;
  }
  const base = opts?.baseMs ?? 500;
  const max = opts?.maxMs ?? 60_000;
  const exp = Math.min(max, base * 2 ** Math.max(0, attempt - 1));
  return Math.floor(Math.random() * (exp + 1));
}

/** Deterministic backoff for tests (no jitter). */
export function computeBackoffMsDeterministic(
  attempt: number,
  opts?: { baseMs?: number; maxMs?: number; retryAfterMs?: number },
): number {
  if (opts?.retryAfterMs != null && opts.retryAfterMs >= 0) {
    return opts.retryAfterMs;
  }
  const base = opts?.baseMs ?? 500;
  const max = opts?.maxMs ?? 60_000;
  return Math.min(max, base * 2 ** Math.max(0, attempt - 1));
}
