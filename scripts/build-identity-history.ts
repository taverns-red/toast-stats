/**
 * Identity histories — Runner (#1782, #1820; epic #1781)
 *
 * Thin glue around the pure folds in ./lib/clubDistrictHistory.js and
 * ./lib/districtRegionHistory.js. Two commands:
 *
 *   select-region-dates
 *     stdin: snapshot dates, one per line (the staged
 *     snapshots/<date>/all-districts-rankings.json listing). stdout: the
 *     first and last date of every program year, one per line — the dates
 *     the caller downloads.
 *
 *   build --club-race <dir> --rankings <dir> --out <dir>
 *     1. read every `<club-race>/{PY}/first-reached.json` the caller synced
 *        (R2: sync-stores.sh pulled and normalised them), validating each
 *        against the shared contract;
 *     2. read every `<rankings>/<date>/all-districts-rankings.json` the
 *        caller downloaded, peeling any gzip layer (gcloud 568 hands back a
 *        `-Z` object's bytes as stored; 588 inflates one layer);
 *     3. fold both and write `<out>/club-district-history/{NN,index}.json`
 *        and `<out>/district-region-history.json` (compact JSON) for
 *        scripts/pipeline/build-identity-history.sh to upload;
 *     4. fold the club history once more into one
 *        `<out>/charter-cohort-survival/district_<id>.json` per district
 *        (#2061), the survival page's curves.
 *
 * Decision logic is unit-tested in scripts/lib/__tests__/
 * {clubDistrictHistory,districtRegionHistory}.test.ts. Logs go to stderr;
 * stdout is ONE JSON line (R4) with the counts and the measured sizes, gzip
 * included, because the shard-or-not decision (gz > 250 KB → shard, #1782)
 * is made on them.
 *
 * Exit codes: 0 written · 1 a missing or unreadable input, or a fold error
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import {
  AllDistrictsRankingsDataSchema,
  ClubRaceStoreSchema,
  type ClubRaceStoreData,
} from '@taverns-red/shared-contracts'
import { foldClubDistrictHistory } from './lib/clubDistrictHistory.js'
import { foldCharterCohortSurvival } from './lib/charterCohortSurvival.js'
import {
  foldDistrictRegionHistory,
  selectRegionSourceDates,
  type RegionSource,
} from './lib/districtRegionHistory.js'
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

/** Read a JSON file, peeling every gzip layer first. */
function readJson(file: string): unknown {
  let bytes = fs.readFileSync(file)
  while (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    bytes = gunzipSync(bytes)
  }
  try {
    return JSON.parse(bytes.toString('utf-8'))
  } catch (err) {
    fail(`${file} is not JSON: ${(err as Error).message}`)
  }
}

function selectRegionDates(): void {
  const dates = fs
    .readFileSync(0, 'utf-8')
    .split('\n')
    .map(s => s.trim())
  const picked = selectRegionSourceDates(dates)
  process.stdout.write(picked.map(d => `${d}\n`).join(''))
}

function readStores(clubRaceDir: string): ClubRaceStoreData[] {
  if (!fs.existsSync(clubRaceDir)) {
    fail(`${clubRaceDir} does not exist; the club-race store was never synced`)
  }
  const stores: ClubRaceStoreData[] = []
  for (const py of fs.readdirSync(clubRaceDir).sort()) {
    const file = path.join(clubRaceDir, py, 'first-reached.json')
    if (!fs.existsSync(file)) continue
    const parsed = ClubRaceStoreSchema.safeParse(readJson(file))
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
  return stores
}

function readRankings(rankingsDir: string): RegionSource[] {
  if (!fs.existsSync(rankingsDir)) fail(`${rankingsDir} does not exist`)
  const sources: RegionSource[] = []
  for (const date of fs.readdirSync(rankingsDir).sort()) {
    const file = path.join(rankingsDir, date, 'all-districts-rankings.json')
    if (!fs.existsSync(file)) continue
    const parsed = AllDistrictsRankingsDataSchema.safeParse(readJson(file))
    if (!parsed.success) {
      fail(
        `${file} violates the rankings contract: ${summarizeZodIssues(parsed.error.issues)}`
      )
    }
    sources.push({ snapshotDate: date, rankings: parsed.data })
  }
  if (sources.length === 0) {
    fail(`no <date>/all-districts-rankings.json under ${rankingsDir}`)
  }
  return sources
}

function build(): void {
  const stores = readStores(arg('club-race'))
  const sources = readRankings(arg('rankings'))
  const outDir = arg('out')

  const clubs = foldClubDistrictHistory(stores)
  const regions = foldDistrictRegionHistory(sources)
  const survival = foldCharterCohortSurvival(clubs, id =>
    log(
      `::warning::build-identity-history: district id '${id}' cannot name a survival file; skipped`
    )
  )

  const encode = (value: unknown): Buffer =>
    Buffer.from(JSON.stringify(value), 'utf-8')

  const clubDir = path.join(outDir, 'club-district-history')
  fs.mkdirSync(clubDir, { recursive: true })
  let rawBytes = 0
  let gzipBytes = 0
  let maxShardGzipBytes = 0
  const writeClub = (name: string, value: unknown): number => {
    const body = encode(value)
    fs.writeFileSync(path.join(clubDir, name), body)
    const gz = gzipSync(body).length
    rawBytes += body.length
    gzipBytes += gz
    return gz
  }
  for (const [key, shard] of Object.entries(clubs.shards)) {
    maxShardGzipBytes = Math.max(
      maxShardGzipBytes,
      writeClub(`${key}.json`, shard)
    )
  }
  writeClub('index.json', clubs.index)

  const survivalDir = path.join(outDir, 'charter-cohort-survival')
  fs.mkdirSync(survivalDir, { recursive: true })
  let survivalRawBytes = 0
  let survivalGzipBytes = 0
  let survivalMaxGzipBytes = 0
  for (const [id, file] of Object.entries(survival)) {
    const body = encode(file)
    fs.writeFileSync(path.join(survivalDir, `district_${id}.json`), body)
    const gz = gzipSync(body).length
    survivalRawBytes += body.length
    survivalGzipBytes += gz
    survivalMaxGzipBytes = Math.max(survivalMaxGzipBytes, gz)
  }

  const regionBody = encode(regions)
  fs.writeFileSync(
    path.join(outDir, 'district-region-history.json'),
    regionBody
  )

  log(
    `club-district history: ${clubs.index.totalClubs} clubs in ${clubs.index.shards.length} shards, ` +
      `${clubs.index.duplicates.length} duplicates, PYs ${clubs.index.programYears.join(', ')}`
  )
  log(
    `district-region history: ${Object.keys(regions.districts).length} districts from ` +
      `${regions.sourceDates.length} snapshots, ${regions.conflicts.length} conflicts`
  )
  process.stdout.write(
    `${JSON.stringify({
      clubDistrictHistory: {
        asOf: clubs.index.asOf,
        programYears: clubs.index.programYears.length,
        clubs: clubs.index.totalClubs,
        shards: clubs.index.shards.length,
        duplicates: clubs.index.duplicates.length,
        rawBytes,
        gzipBytes,
        maxShardGzipBytes,
      },
      charterCohortSurvival: {
        districts: Object.keys(survival).length,
        rawBytes: survivalRawBytes,
        gzipBytes: survivalGzipBytes,
        maxGzipBytes: survivalMaxGzipBytes,
      },
      districtRegionHistory: {
        asOf: regions.asOf,
        programYears: regions.programYears.length,
        sourceDates: regions.sourceDates.length,
        districts: Object.keys(regions.districts).length,
        conflicts: regions.conflicts.length,
        rawBytes: regionBody.length,
        gzipBytes: gzipSync(regionBody).length,
      },
    })}\n`
  )
}

const command = process.argv[2]
if (command === 'select-region-dates') selectRegionDates()
else if (command === 'build') build()
else
  fail(`unknown command '${command ?? ''}' (want build | select-region-dates)`)
