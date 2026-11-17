/**
 * GitHub rate-limit guard for `agent-cli ci-wait` (#2892). The 5,000/h REST
 * limit is shared by every session on one login, so a waiting session must
 * not start polling when the budget is low, and must stop (not retry) when
 * GitHub says the limit is hit. `gh api rate_limit` is free: it does not
 * count against the limit.
 */
import { runGhResult, type ExecResult, type Runner } from './exec.js'

/** Below this many calls left in the core or graphql bucket, ci-wait refuses to start polling. */
export const MIN_REMAINING = 500

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RateLimitError'
  }
}

/** Primary ("API rate limit exceeded") and secondary rate-limit responses. */
export function isRateLimitText(text: string): boolean {
  return /rate limit (already )?(exceeded|hit)|secondary rate limit|\bRATE_LIMITED\b/i.test(
    text
  )
}

interface Bucket {
  name: 'core' | 'graphql'
  remaining: number
  reset: number
}

/**
 * Reads the core and graphql buckets and returns the one with the fewest
 * calls left; null when the answer can't be read. `gh pr checks` spends
 * graphql and the REST fallback spends core, so the lower is the budget.
 */
export async function readLowestLimit(runner: Runner): Promise<Bucket | null> {
  try {
    const r = await runGhResult(['api', 'rate_limit'], {
      runner,
      attempts: 1,
    })
    const res = (
      JSON.parse(r.stdout) as {
        resources?: Record<string, { remaining?: number; reset?: number }>
      }
    ).resources
    const buckets: Bucket[] = []
    for (const name of ['core', 'graphql'] as const) {
      const b = res?.[name]
      if (typeof b?.remaining === 'number' && typeof b.reset === 'number')
        buckets.push({ name, remaining: b.remaining, reset: b.reset })
    }
    buckets.sort((a, b) => a.remaining - b.remaining)
    return buckets[0] ?? null
  } catch {
    return null
  }
}

function resetText(reset: number, nowMs: number): string {
  const mins = Math.max(0, Math.ceil((reset * 1000 - nowMs) / 60_000))
  const iso = new Date(reset * 1000).toISOString().replace('.000Z', 'Z')
  return `resets at ${iso} (in about ${mins} min)`
}

/** Throws a RateLimitError when fewer than MIN_REMAINING calls are left. */
export async function assertRateLimitBudget(
  runner: Runner,
  nowMs: number
): Promise<void> {
  const low = await readLowestLimit(runner)
  if (low && low.remaining < MIN_REMAINING) {
    throw new RateLimitError(
      `GitHub ${low.name} rate limit has ${low.remaining} calls left (need ${MIN_REMAINING}); ` +
        `it ${resetText(low.reset, nowMs)}. Not polling.`
    )
  }
}

/** A RateLimitError naming the reset time, when GitHub reports one. */
export async function rateLimitStop(
  runner: Runner,
  nowMs: number
): Promise<RateLimitError> {
  const low = await readLowestLimit(runner)
  return new RateLimitError(
    low
      ? `GitHub rate limit hit; it ${resetText(low.reset, nowMs)}. Stopped, not retrying.`
      : 'GitHub rate limit hit; reset time unknown. Stopped, not retrying.'
  )
}

/**
 * Wraps a runner so a rate-limit response throws at once, before the gh
 * retry layer can retry it.
 */
export function rateLimitAware(runner: Runner, now: () => number): Runner {
  return async (cmd, args, opts) => {
    const r: ExecResult = await runner(cmd, args, opts)
    if (
      r.code !== 0 &&
      cmd === 'gh' &&
      !(args[0] === 'api' && args[1] === 'rate_limit') &&
      isRateLimitText(`${r.stderr}\n${r.stdout}`)
    ) {
      throw await rateLimitStop(runner, now())
    }
    return r
  }
}
