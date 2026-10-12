/**
 * Identity histories — Runner (#1782, epic #1781)
 *
 * Thin glue around the pure fold in ./lib/clubDistrictHistory.js:
 *   1. read every `<club-race>/{PY}/first-reached.json` the caller synced
 *      (R2: sync-stores.sh pulled and normalised them; this reads local
 *      files only), validating each against the shared contract;
 *   2. fold them into the club-district history;
 *   3. write `<out>/club-district-history/{NN,index}.json` (compact JSON)
 *      for scripts/pipeline/build-identity-history.sh to upload.
 *
 * Decision logic is unit-tested in scripts/lib/__tests__/
 * clubDistrictHistory.test.ts. Logs go to stderr; stdout is ONE JSON line
 * (R4) with the counts and the measured sizes, gzip included, because the
 * shard-or-not decision (gz > 250 KB → shard, #1782) is made on them.
 *
 * Usage:
 *   npx tsx scripts/build-identity-history.ts --club-race ./cache/club-race --out /tmp/identity
 *
 * Exit codes: 0 written · 1 no store, an unreadable store, or a fold error
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { gzipSync } from 'node:zlib'
import {
  ClubRaceStoreSchema,
  type ClubRaceStoreData,
} from '@taverns-red/shared-contracts'
import { foldClubDistrictHistory } from './lib/clubDistrictHistory.js'
import { summarizeZodIssues } from './lib/zodIssueSummary.js'

function log(msg: string): void {
  process.stderr.write(`${msg}\n`)
}

function fail(msg: string): never {
  log(`::error::build-identity-history: ${msg}`)
  process.exit(1)
}

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`)
  const value = i >= 0 ? process.argv[i + 1] : undefined
  if (!value) fail(`missing required argument --${name}`)
  return value
}

const clubRaceDir = arg('club-race')
const outDir = arg('out')

if (!fs.existsSync(clubRaceDir)) {
  fail(`${clubRaceDir} does not exist; the club-race store was never synced`)
}

const stores: ClubRaceStoreData[] = []
for (const py of fs.readdirSync(clubRaceDir).sort()) {
  const file = path.join(clubRaceDir, py, 'first-reached.json')
  if (!fs.existsSync(file)) continue
  let json: unknown
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch (err) {
    fail(`${file} is not JSON: ${(err as Error).message}`)
  }
  const parsed = ClubRaceStoreSchema.safeParse(json)
  if (!parsed.success) {
    fail(
      `${file} violates the club-race contract: ${summarizeZodIssues(parsed.error.issues)}`
    )
  }
  stores.push(parsed.data)
}
if (stores.length === 0) {
  fail(`no club-race/{PY}/first-reached.json under ${clubRaceDir}`)
}

const artifact = foldClubDistrictHistory(stores)

const dir = path.join(outDir, 'club-district-history')
fs.mkdirSync(dir, { recursive: true })
let rawBytes = 0
let gzipBytes = 0
let maxShardGzipBytes = 0
const write = (name: string, value: unknown): number => {
  const body = Buffer.from(JSON.stringify(value), 'utf-8')
  fs.writeFileSync(path.join(dir, name), body)
  const gz = gzipSync(body).length
  rawBytes += body.length
  gzipBytes += gz
  return gz
}
for (const [key, shard] of Object.entries(artifact.shards)) {
  maxShardGzipBytes = Math.max(maxShardGzipBytes, write(`${key}.json`, shard))
}
write('index.json', artifact.index)

log(
  `club-district history: ${artifact.index.totalClubs} clubs in ${artifact.index.shards.length} shards, ` +
    `${artifact.index.duplicates.length} duplicates, PYs ${artifact.index.programYears.join(', ')}`
)
process.stdout.write(
  `${JSON.stringify({
    clubDistrictHistory: {
      asOf: artifact.index.asOf,
      programYears: artifact.index.programYears.length,
      clubs: artifact.index.totalClubs,
      shards: artifact.index.shards.length,
      duplicates: artifact.index.duplicates.length,
      rawBytes,
      gzipBytes,
      maxShardGzipBytes,
    },
  })}\n`
)
