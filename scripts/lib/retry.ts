/**
 * retryAsync — bounded retry with exponential backoff (#1267, epic #1266)
 *
 * A tiny, dependency-free helper for absorbing TRANSIENT I/O failures. Built
 * for the closing-date registry freshness check, whose single GCS read can
 * throw on a flaky Workload-Identity/STS token exchange
 * (`sts.googleapis.com/v1/token: Premature close`) — a one-off that the old
 * code laundered into a false empty-feed STALE alert (#1245).
 *
 * It retries ANY thrown error up to `attempts` times, waiting
 * `baseDelayMs * 2^n` between tries. This intentionally does not classify
 * errors: the caller's fallback after exhaustion is still to alert
 * (fail-closed, L107), so retrying a genuinely-permanent failure a couple of
 * extra times costs only a few seconds and never hides it.
 *
 * `sleep` is injectable so tests run instantly without real timers. No GCS or
 * other I/O lives here — it is pure control flow.
 */

export interface RetryOptions {
  /** Total attempts, including the first (default 3). Values < 1 run once. */
  attempts?: number
  /** Delay before the FIRST retry, in ms (default 500). Doubles each retry. */
  baseDelayMs?: number
  /** Injectable wait — defaults to a real setTimeout-backed sleep. */
  sleep?: (ms: number) => Promise<void>
  /** Called before each backoff wait with the error, 1-based retry #, and delay. */
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms))

/**
 * Run `fn`, retrying on any rejection with exponential backoff. Resolves with
 * the first successful result; rejects with the LAST error once attempts are
 * spent.
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3)
  const baseDelayMs = options.baseDelayMs ?? 500
  const sleep = options.sleep ?? defaultSleep

  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      const isLastAttempt = i === attempts - 1
      if (isLastAttempt) break
      const delayMs = baseDelayMs * 2 ** i
      options.onRetry?.(err, i + 1, delayMs)
      await sleep(delayMs)
    }
  }
  throw lastError
}
