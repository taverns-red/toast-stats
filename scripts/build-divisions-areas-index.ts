/**
 * Global divisions/areas index — Runner (#1134, epic #1101)
 *
 * Thin glue around the pure builder in ./lib/divisionsAreasIndex.js:
 *   1. read every district_*.json the workflow synced into --src (R2:
 *      the caller syncs explicitly; this script reads only local files),
 *   2. build the index,
 *   3. write it to --out for the workflow to upload to
 *      config/divisions-areas-index.json.
 *
 * No decision logic lives here — that is unit-tested in
 * scripts/lib/__tests__/divisionsAreasIndex.test.ts. All logging goes to
 * stderr (R4); stdout stays clean.
 *
 * Usage:
 *   npx tsx scripts/build-divisions-areas-index.ts \
 *     --src /tmp/divisions-areas-src \
 *     --out /tmp/divisions-areas-index.json \
 *     --snapshot-date 2026-06-09
 *
 * Exits non-zero when no district files could be read — an empty index
 * uploaded over a populated one would silently break omni-search.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildDivisionsAreasIndex,
  parseDistrictFile,
} from './lib/divisionsAreasIndex.js'

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

const srcDir = arg('src')
const outFile = arg('out')
const snapshotDate = arg('snapshot-date')

const fileNames = readdirSync(srcDir)
  .filter(f => f.startsWith('district_') && f.endsWith('.json'))
  .sort()

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

const index = buildDivisionsAreasIndex(
  payloads,
  snapshotDate,
  new Date().toISOString()
)

writeFileSync(outFile, JSON.stringify(index))
log(
  `Generated divisions-areas index: ${index.totalDivisions} divisions, ` +
    `${index.totalAreas} areas across ${Object.keys(index.districts).length} districts ` +
    `(from ${payloads.length} files, snapshot ${snapshotDate})`
)
