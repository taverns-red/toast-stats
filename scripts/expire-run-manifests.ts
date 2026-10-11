/**
 * Run-manifest retention — Runner (#1762, ADR-015 Consequences)
 *
 * Usage: tsx scripts/expire-run-manifests.ts <listing.json>
 *   <listing.json>  `gcloud storage objects list "gs://<staging>/runs/**"
 *                   --format=json` output
 *
 * Prints the `runs/<id>/` prefixes older than RUN_MANIFEST_RETENTION_DAYS
 * (90), one per line, on stdout (R4); the prune step deletes them. Logic:
 * scripts/lib/runManifest.ts. An undatable entry exits 1 — never delete on
 * a guess.
 */

import { readFileSync } from 'node:fs'
import {
  RUN_MANIFEST_RETENTION_DAYS,
  expiredRunPrefixes,
} from './lib/runManifest.js'

const file = process.argv[2]
if (!file) {
  process.stderr.write('usage: expire-run-manifests.ts <listing.json>\n')
  process.exit(2)
}

try {
  const listing = JSON.parse(readFileSync(file, 'utf-8')) as unknown
  if (!Array.isArray(listing)) throw new Error('listing is not a JSON array')
  const expired = expiredRunPrefixes(listing, Date.now())
  process.stderr.write(
    `[expire-run-manifests] ${expired.length} run(s) older than ${RUN_MANIFEST_RETENTION_DAYS} days\n`
  )
  for (const prefix of expired) process.stdout.write(`${prefix}\n`)
} catch (err) {
  process.stderr.write(`[expire-run-manifests] ${String(err)}\n`)
  process.exit(1)
}
