/**
 * Read-only identity smoke (#2966, epic #2872).
 *
 *   identity-smoke.ts <identity>      env ACCESS_TOKEN (a Google access token)
 *
 * Asks the Cloud Storage JSON API which of the expected permissions the
 * caller holds on each bucket (buckets.testIamPermissions), compares both
 * directions with scripts/lib/identitySmoke.ts, and counts soft-deleted
 * objects under one small prod prefix (objects.list, softDeleted=true).
 * Only GET requests (logic in scripts/lib/identitySmokeCli.ts).
 * stderr: the table (R4); stdout: one JSON result.
 * Exit: 0 pass - 1 mismatch or API failure - 2 usage.
 */

import { IDENTITY_EXPECTATIONS } from './lib/identitySmoke.js'
import { runSmoke } from './lib/identitySmokeCli.js'

const main = async (): Promise<number> => {
  const name = process.argv[2] ?? ''
  const expected = IDENTITY_EXPECTATIONS[name]
  if (!expected) {
    console.error(
      `usage: identity-smoke.ts <${Object.keys(IDENTITY_EXPECTATIONS).join('|')}>`
    )
    return 2
  }
  return runSmoke(expected, {
    token: process.env['ACCESS_TOKEN'],
    fetch,
    log: line => console.error(line),
    out: line => console.log(line),
  })
}

// exitCode, not process.exit(): let stdout flush before the process ends.
void main().then(code => {
  process.exitCode = code
})
