/**
 * config/district-snapshot-index.json — Runner (#1743, plan P3-3)
 *
 * Thin glue around ./snapshotIndex.ts for the "Update district-snapshot-index"
 * step, which used two inline `node -e` blocks. The builders are pinned byte
 * for byte against that code (__tests__/goldenParity.test.ts). Logs go to
 * stderr (R4).
 *
 * Usage (rebuild / prune / rescrape / rescrape-historical):
 *   npx tsx scripts/manifests/build-snapshot-index.ts \
 *     --from-listing /tmp/snapshot-files.txt --out /tmp/district-snapshot-index.json
 *
 * Usage (daily — rewrites the existing index file in place):
 *   npx tsx scripts/manifests/build-snapshot-index.ts \
 *     --merge /tmp/district-snapshot-index.json --date 2026-10-11 --districts 61,F
 */

import { readFileSync, writeFileSync } from 'node:fs'
import {
  mergeSnapshotIndex,
  snapshotIndexFromListing,
} from './snapshotIndex.js'

function log(msg: string): void {
  process.stderr.write(`${msg}\n`)
}

function optional(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function required(name: string): string {
  const value = optional(name)
  if (value === undefined) {
    log(`Missing required argument --${name}`)
    process.exit(1)
  }
  return value
}

const generatedAt = new Date().toISOString()
const listing = optional('from-listing')
const mergeInto = optional('merge')

if (listing && !mergeInto) {
  const out = required('out')
  const built = snapshotIndexFromListing(
    readFileSync(listing, 'utf-8'),
    generatedAt
  )
  writeFileSync(out, built.json)
  log(built.summary)
} else if (mergeInto && !listing) {
  const built = mergeSnapshotIndex(
    readFileSync(mergeInto, 'utf-8'),
    required('date'),
    required('districts'),
    generatedAt
  )
  writeFileSync(mergeInto, built.json)
  log(built.summary)
} else {
  log(
    'Pass exactly one of --from-listing <file> --out <file>, or --merge <file>'
  )
  process.exit(1)
}
