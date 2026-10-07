/**
 * Pick the date v1/latest.json may name (#1670) — runner.
 *
 * Usage:
 *   npx tsx scripts/resolve-latest-snapshot-date.ts \
 *     --dates-file /tmp/all-dates.txt [--local YYYY-MM-DD] [--remote YYYY-MM-DD]
 *
 * --dates-file  one bucket snapshot date per line (the `snapshots/` listing)
 * --local       newest local snapshot dir this run produced (may be empty)
 * --remote      latestSnapshotDate of the current remote v1/latest.json
 *
 * Prints the chosen date on stdout (the only stdout output, R4), or nothing
 * when there is no date at all. Decision logic lives in
 * ./lib/latestSnapshotDate.ts (unit-tested); this is thin I/O glue.
 */

import * as fs from 'node:fs'
import { resolveLatestSnapshotDate } from './lib/latestSnapshotDate.js'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  const value = i >= 0 ? process.argv[i + 1] : undefined
  return value && !value.startsWith('--') ? value : undefined
}

const datesFile = arg('dates-file')
if (!datesFile) {
  process.stderr.write(
    'usage: resolve-latest-snapshot-date.ts --dates-file F [--local D] [--remote D]\n'
  )
  process.exit(2)
}

const bucketDates = fs
  .readFileSync(datesFile, 'utf-8')
  .split(/\r?\n/)
  .map(l => l.trim())
  .filter(Boolean)

const localLatest = arg('local')
const remoteLatest = arg('remote')
const chosen = resolveLatestSnapshotDate({
  localLatest,
  remoteLatest,
  bucketDates,
})

process.stderr.write(
  `latest snapshot date: local=${localLatest ?? '-'} remote=${remoteLatest ?? '-'} → ${chosen ?? '(none)'}\n`
)
if (chosen) process.stdout.write(`${chosen}\n`)
