/**
 * Verbose Logger Factory
 *
 * Creates a simple stderr-based logger for verbose CLI output.
 * Extracted to eliminate 4 duplicated logger definitions in cli.ts.
 */

/**
 * Logger interface matching the shape expected by CLI services.
 */
export interface VerboseLogger {
  info: (msg: string, data?: unknown) => void
  warn: (msg: string, data?: unknown) => void
  error: (msg: string, err?: unknown) => void
  debug: (msg: string, data?: unknown) => void
}

/**
 * Render an error argument for the `[ERROR]` line (#1708).
 *
 * Callers pass either an `Error` or a context object such as
 * `{ date, districtId, error }`. Printing `''` for the object (the previous
 * behaviour) left the line saying what failed but never where or why. An
 * `Error` nested in the context serialises as its message (JSON.stringify
 * would print `{}`), and an unserialisable context falls back to String().
 */
function describeError(err: unknown): string {
  if (err === undefined) return ''
  if (err instanceof Error) return err.message
  try {
    return JSON.stringify(err, (_key, value: unknown) =>
      value instanceof Error ? value.message : value
    )
  } catch {
    return String(err)
  }
}

/**
 * Create a verbose logger that writes to stderr with level prefixes.
 * Returns undefined when verbose is false, matching the optional logger
 * pattern used throughout the CLI services.
 */
export function createVerboseLogger(
  verbose: boolean
): VerboseLogger | undefined {
  if (!verbose) {
    return undefined
  }

  return {
    info: (msg: string, data?: unknown) =>
      console.error(`[INFO] ${msg}`, data ? JSON.stringify(data) : ''),
    warn: (msg: string, data?: unknown) =>
      console.error(`[WARN] ${msg}`, data ? JSON.stringify(data) : ''),
    error: (msg: string, err?: unknown) =>
      console.error(`[ERROR] ${msg}`, describeError(err)),
    debug: (msg: string, data?: unknown) =>
      console.error(`[DEBUG] ${msg}`, data ? JSON.stringify(data) : ''),
  }
}
