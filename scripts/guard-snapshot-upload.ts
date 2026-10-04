/**
 * Refuse to publish a snapshot over a remote closing snapshot (#1621) —
 * runner.
 *
 * Usage: npx tsx scripts/guard-snapshot-upload.ts YYYY-MM-DD [snapshotsDir]
 *
 * Compares ./cache/snapshots/{date}/metadata.json (or {snapshotsDir}/{date})
 * with gs://$GCS_BUCKET/snapshots/{date}/metadata.json. Decision logic lives
 * in ./lib/closingOverwriteGuard.ts (unit-tested); this is thin I/O glue.
 * Logs go to stderr only (R4).
 *
 * Exit codes:
 *   0 — upload allowed
 *   3 — refused: the remote snapshot is a close the local one must not replace
 *   1 — local or remote metadata unreadable (fail closed: do not upload)
 *   2 — usage error
 *
 * Env: GCS_BUCKET (default: toast-stats-data-staging)
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Storage } from '@google-cloud/storage'
import { RAW_CSV_DEFAULT_BUCKET } from './lib/gcsHelpers.js'
import {
  decideSnapshotUpload,
  parseSnapshotProvenance,
} from './lib/closingOverwriteGuard.js'
import { retryAsync } from './lib/retry.js'

const EXIT_REFUSED = 3

function log(msg: string): void {
  process.stderr.write(`${msg}\n`)
}

async function main(): Promise<void> {
  const date = process.argv[2]
  const snapshotsDir = process.argv[3] ?? './cache/snapshots'
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    log('usage: guard-snapshot-upload.ts YYYY-MM-DD [snapshotsDir]')
    process.exit(2)
  }

  const local = parseSnapshotProvenance(
    await fs.readFile(path.join(snapshotsDir, date, 'metadata.json'))
  )

  const bucket = process.env.GCS_BUCKET ?? RAW_CSV_DEFAULT_BUCKET
  const file = new Storage()
    .bucket(bucket)
    .file(`snapshots/${date}/metadata.json`)
  const retry = { attempts: 3, baseDelayMs: 2000 }
  const [exists] = await retryAsync(() => file.exists(), retry)
  const remote = exists
    ? parseSnapshotProvenance(
        (await retryAsync(() => file.download(), retry))[0]
      )
    : null

  const decision = decideSnapshotUpload(local, remote)
  log(
    `snapshot upload guard ${date}: ${decision.allow ? 'ALLOW' : 'REFUSE'} — ${decision.reason}`
  )
  if (!decision.allow) process.exit(EXIT_REFUSED)
}

main().catch(err => {
  log(`guard-snapshot-upload failed: ${(err as Error).stack ?? err}`)
  process.exit(1)
})
