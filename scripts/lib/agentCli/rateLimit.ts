/**
 * GitHub rate-limit guard for `agent-cli ci-wait` (#2892). The 5,000/h REST
 * limit is shared by every session on one login, so a waiting session must
 * not start polling when the budget is low, and must stop (not retry) when
 * GitHub says the limit is hit. `gh api rate_limit` is free: it does not
 * count against the limit.
 */
import { runGhResult, type ExecResult, type Runner } from './exec.js'

/** Below this many core requests left, ci-wait refuses to start polling. */
export const MIN_CORE_REMAINING = 500

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RateLimitError'
  }
}

/** Primary ("API rate limit exceeded") and secondary rate-limit responses. */
export function isRateLimitText(text: string): boolean {
  return /rate limit (exceeded|hit)|exceeded a secondary rate limit|secondary rate limit/i.test(
    text
  )
}

interface CoreLimit {
  remaining: number
  reset: number
}

/** Reads core.remaining and core.reset; null when it cannot be read. */
export async function readCoreLimit(runner: Runner): Promise<CoreLimit | null> {
  try {
    const r = await runGhResult(['api', 'rate_limit'], {
      runner,
      attempts: 1,
    })
    const core = (
      JSON.parse(r.stdout) as {
        resources?: { core?: { remaining?: number; reset?: number } }
      }
    ).resources?.core
    if (typeof core?.remaining !== 'number' || typeof core.reset !== 'number')
      return null
    return { remaining: core.remaining, reset: core.reset }
  } catch {
    return null
  }
}

function resetText(reset: number, nowMs: number): string {
  const mins = Math.max(0, Math.ceil((reset * 1000 - nowMs) / 60_000))
  const iso = new Date(reset * 1000).toISOString().replace('.000Z', 'Z')
  return `resets at ${iso} (in about ${mins} min)`
}

/** Throws a RateLimitError when fewer than MIN_CORE_REMAINING calls are left. */
export async function assertRateLimitBudget(
  runner: Runner,
  nowMs: number
): Promise<void> {
  const core = await readCoreLimit(runner)
  if (core && core.remaining < MIN_CORE_REMAINING) {
    throw new RateLimitError(
      `GitHub core rate limit has ${core.remaining} calls left (need ${MIN_CORE_REMAINING}); ` +
        `it ${resetText(core.reset, nowMs)}. Not polling.`
    )
  }
}

/** A RateLimitError naming the reset time, when GitHub reports one. */
export async function rateLimitStop(
  runner: Runner,
  nowMs: number
): Promise<RateLimitError> {
  const core = await readCoreLimit(runner)
  return new RateLimitError(
    core
      ? `GitHub rate limit hit; it ${resetText(core.reset, nowMs)}. Stopped, not retrying.`
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
