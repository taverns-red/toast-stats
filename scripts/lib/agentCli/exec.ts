/**
 * Process runner and the retrying `gh` wrapper for the agent CLI (#2418).
 *
 * Every subcommand shells out to `gh` and `git` through an injectable
 * {@link Runner}, so tests answer from recorded fixtures and never touch the
 * network. `runGh` retries only the GitHub API failures that sessions in
 * this repo have actually seen go away on their own (HTTP 5xx incl. 503
 * "ServerBusy", HTTP/2 "stream error ... CANCEL", resets, TLS timeouts,
 * secondary rate limits), with a bounded doubling backoff. A 404, a bad
 * flag or an auth error fails at once.
 */
import { execFile } from 'node:child_process'
import { retryAsync } from '../retry.js'

export interface ExecResult {
  stdout: string
  stderr: string
  code: number
}

export type Runner = (
  cmd: string,
  args: readonly string[],
  opts?: { cwd?: string }
) => Promise<ExecResult>

/** Runs a real process. Never throws: a non-zero exit is in `code`. */
export const realRunner: Runner = (cmd, args, opts = {}) =>
  new Promise(resolve => {
    execFile(
      cmd,
      [...args],
      { cwd: opts.cwd, maxBuffer: 512 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout, stderr) => {
        let code = 0
        if (err) {
          const c = (err as { code?: unknown }).code
          code = typeof c === 'number' ? c : 127
          if (code === 127 && !stderr) stderr = String(err.message)
        }
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code })
      }
    )
  })

export class CommandError extends Error {
  constructor(
    readonly argv: readonly string[],
    readonly result: ExecResult
  ) {
    const detail = (result.stderr || result.stdout).trim().split('\n')[0]
    super(`${argv.join(' ')} exited ${result.code}: ${detail}`)
    this.name = 'CommandError'
  }
}

/** Failures seen to clear on retry. Matched against stderr + stdout. */
export const TRANSIENT_GH_PATTERNS: readonly RegExp[] = [
  /HTTP 5\d\d/i,
  /\(HTTP 5\d\d\)/i,
  /ServerBusy/i,
  /stream error: stream ID \d+; (CANCEL|INTERNAL_ERROR|REFUSED_STREAM)/i,
  /connection reset by peer/i,
  /TLS handshake timeout/i,
  /i\/o timeout/i,
  /unexpected EOF/i,
  /secondary rate limit/i,
  /Bad Gateway|Service Unavailable|Gateway Time-?out/i,
]

export function isTransientGhError(text: string): boolean {
  return TRANSIENT_GH_PATTERNS.some(p => p.test(text))
}

export interface GhOptions {
  runner: Runner
  sleep?: (ms: number) => Promise<void>
  /** Total tries, including the first (default 5). */
  attempts?: number
  /** First backoff in ms (default 1000); doubles each retry (1+2+4+8 s). */
  baseDelayMs?: number
  cwd?: string
  /** Logs each retry; defaults to stderr (R4: stdout is for results). */
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void
}

const logRetry = (err: unknown, attempt: number, delayMs: number): void => {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`agent-cli: retry ${attempt} in ${delayMs}ms after: ${msg}`)
}

/**
 * Runs `gh <args>` and returns the raw result, retrying transient failures.
 * `accept` decides which results count as usable (default: exit 0) — `gh pr
 * checks --json` exits 8/1 for pending/failed checks yet prints valid JSON.
 */
export async function runGhResult(
  args: readonly string[],
  opts: GhOptions,
  accept: (r: ExecResult) => boolean = r => r.code === 0
): Promise<ExecResult> {
  const argv = ['gh', ...args]
  return retryAsync(
    async () => {
      const r = await opts.runner('gh', args, { cwd: opts.cwd })
      if (accept(r)) return r
      throw new CommandError(argv, r)
    },
    {
      attempts: opts.attempts ?? 5,
      baseDelayMs: opts.baseDelayMs ?? 1000,
      sleep: opts.sleep,
      onRetry: opts.onRetry ?? logRetry,
      shouldRetry: err =>
        err instanceof CommandError &&
        isTransientGhError(`${err.result.stderr}\n${err.result.stdout}`),
    }
  )
}

/** Runs `gh <args>`, retrying transient failures; resolves with stdout. */
export async function runGh(
  args: readonly string[],
  opts: GhOptions
): Promise<string> {
  return (await runGhResult(args, opts)).stdout
}

/** Runs `gh <args>` and parses stdout as JSON. */
export async function runGhJson<T>(
  args: readonly string[],
  opts: GhOptions
): Promise<T> {
  return JSON.parse(await runGh(args, opts)) as T
}

/** Runs git (no retry: local, deterministic). Never throws. */
export function runGit(
  runner: Runner,
  args: readonly string[],
  cwd?: string
): Promise<ExecResult> {
  return runner('git', args, { cwd })
}
