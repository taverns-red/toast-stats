import type { IdentityExpectation } from './identitySmoke.js'

export interface SmokeDeps {
  token: string | undefined
  fetch: typeof fetch
  /** Human-readable table (stderr, R4). */
  log: (line: string) => void
  /** The one JSON result (stdout). */
  out: (line: string) => void
}

// Stub: the real logic moves here from scripts/identity-smoke.ts.
export const runSmoke = async (
  _expected: IdentityExpectation,
  _deps: SmokeDeps
): Promise<number> => 99
