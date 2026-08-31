/**
 * Global club → district index — Runner (#1469, originally #320)
 *
 * Thin glue around the pure builder in ./lib/clubIndex.js:
 *   1. read every district_*.json the workflow synced into --src (R2:
 *      the caller syncs explicitly; this script reads only local files),
 *   2. verify the sync delivered everything the listing found (--expect),
 *   3. build the index,
 *   4. write it to --out for the workflow to upload to
 *      config/club-index.json.
 *
 * No decision logic lives here — that is unit-tested in
 * scripts/lib/__tests__/clubIndex.test.ts. All logging goes to stderr (R4);
 * stdout stays clean.
 *
 * Usage:
 *   npx tsx scripts/build-club-index.ts \
 *     --src /tmp/club-index-src \
 *     --out /tmp/club-index.json \
 *     --snapshot-date 2026-08-30 \
 *     --expect 94
 *
 * Exits non-zero when no district files could be read, OR when fewer were
 * read than --expect. This index shipped covering 2 of 94 districts because
 * a truncated sync looked exactly like a small one (#1469) — an under-covered
 * index must never overwrite a complete one.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildClubIndex, parseDistrictFile } from './lib/clubIndex.js'
import { syncCoverageError } from './lib/syncCoverage.js'
import { isDistrictSnapshotFile } from './lib/snapshotFileNames.js'

function log(msg: string): void {
  process.stderr.write(`${msg}\n`)
}

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`)
  const value = i >= 0 ? process.argv[i + 1] : undefined
  if (!value) {
    log(`Missing required argument --${name}`)
    process.exit(1)
  }
  return value
}

function optionalNumber(name: string): number {
  const i = process.argv.indexOf(`--${name}`)
  const value = i >= 0 ? process.argv[i + 1] : undefined
  const parsed = value === undefined ? NaN : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const srcDir = arg('src')
const outFile = arg('out')
const snapshotDate = arg('snapshot-date')
// How many district files the workflow's listing found. 0 (or absent) skips
// the coverage check rather than failing closed on a caller that cannot count.
const expected = optionalNumber('expect')

// district_<id>.json only. The daily-reports sidecar
// district_<id>_reports.json shares the directory and is a
// DistrictReportsDataset — a bare payload carrying districtId, which the
// builder would register as a club-less phantom district (#1428).
const fileNames = readdirSync(srcDir).filter(isDistrictSnapshotFile).sort()

const payloads: unknown[] = []
for (const name of fileNames) {
  const parsed = parseDistrictFile(readFileSync(join(srcDir, name), 'utf-8'))
  if (parsed === null) {
    log(`Skipping corrupt file: ${name}`)
    continue
  }
  payloads.push(parsed)
}

if (payloads.length === 0) {
  log(
    `No readable district_*.json files in ${srcDir} — refusing to write an empty index`
  )
  process.exit(1)
}

const coverage = syncCoverageError(expected, payloads.length)
if (coverage !== null) {
  log(coverage)
  process.exit(1)
}

const index = buildClubIndex(payloads, snapshotDate, new Date().toISOString())

writeFileSync(outFile, JSON.stringify(index))
const districts = new Set(
  Object.values(index.clubs).map(entry => entry.districtId)
)
log(
  `Generated club-index: ${index.totalClubs} clubs across ${districts.size} districts ` +
    `(from ${payloads.length} files, snapshot ${snapshotDate})`
)
