/**
 * CEO Report oracle — runner (#1429, epic #1426).
 *
 * Thin glue around the pure comparator in ./lib/ceoReportOracle.js: for each
 * program year the TI CEO Report publishes, find that year's last snapshot in
 * a local cache directory, compute the totals the report publishes, hand them
 * to the comparator, print the per-year table, and exit non-zero on any
 * finding.
 *
 * All decision logic is unit-tested in
 * scripts/lib/__tests__/ceoReportOracle.test.ts. Nothing here decides what a
 * number means — this file only reads files and counts.
 *
 * Four correctness constraints this file exists to honour:
 *
 * 1. `programYear` is ALWAYS passed to `DistinguishedDistrictCalculator`,
 *    derived from the SNAPSHOT DATE. The parameter is optional and omitting
 *    it falls back to `CURRENT_RULESET` — the 2026-27 four-gate set, not a
 *    fixed year — which would score 2021-22 under rules whose prerequisite
 *    columns do not exist in that year's export, flipping every district to
 *    `Unknown`. The program year is NEVER derived from
 *    `metadata.sourceCsvDate`: a year-end snapshot's source date falls in
 *    July (Lesson 139), which lands one era late.
 * 2. Club tiers are re-derived from the raw `clubPerformance` array, never
 *    read from `totals.distinguished*`. Those totals are written once at
 *    transform time and never re-derived, so archived 2021-22…2024-25 files
 *    carry pre-#1124 output whose semantics may differ per year. The raw
 *    array is persisted verbatim on every snapshot, which makes the count
 *    version-independent across all five years (Lesson 123).
 * 3. Tier classification uses analytics-core's `classifyDistinguishedTier`
 *    only — never the frontend twin `normalizeTierCode`, which is
 *    case-sensitive on the letter codes and matches only four exact word
 *    forms including an apostrophe in "president's distinguished", while this
 *    dataset's documented word form has none.
 * 4. Two different fields are both called `distinguishedClubs`:
 *    `rankings[].distinguishedClubs` is TI's "Total Distinguished Clubs"
 *    column (ALL tiers summed) while `totals.distinguishedClubs` is the D
 *    tier only. Neither is read here — every club count is derived from
 *    `clubPerformance` — and the variables below are named so the two cannot
 *    be confused.
 *
 * Logging goes to stderr (R4); `--json` writes the machine-readable
 * comparison to stdout.
 *
 * Usage:
 *   npx tsx scripts/validate-vs-ceo-report.ts --cache-dir ./cache [--json]
 *
 * Exit codes: 0 = every published figure reproduced · 1 = findings ·
 * 2 = usage or setup error.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  AllDistrictsRankingsData,
  DistrictRanking,
} from '@taverns-red/shared-contracts'
import { DistinguishedDistrictCalculator } from '../packages/analytics-core/src/rankings/DistinguishedDistrictCalculator.js'
import { classifyDistinguishedTier } from '../packages/analytics-core/src/analytics/ClubEligibilityUtils.js'
import {
  CEO_REPORT_FIGURES,
  compareToCeoReport,
  formatComparisonTable,
  type ComputedProgramYearTotals,
  type DistrictTierCounts,
} from './lib/ceoReportOracle.js'

const DATE_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DISTRICT_FILE_PATTERN = /^district_(.+)\.json$/

function log(msg: string): void {
  process.stderr.write(`${msg}\n`)
}

interface Args {
  cacheDir: string
  json: boolean
}

function parseArgs(argv: string[]): Args {
  let cacheDir = './cache'
  let json = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '--json') {
      json = true
    } else if (arg === '--cache-dir') {
      const value = argv[++i]
      if (!value) throw new Error('--cache-dir needs a directory')
      cacheDir = value
    } else if (arg.startsWith('--cache-dir=')) {
      cacheDir = arg.slice('--cache-dir='.length)
    } else {
      throw new Error(`unknown argument: ${arg}`)
    }
  }

  return { cacheDir, json }
}

/**
 * Program year ("YYYY-YYYY") a snapshot DATE belongs to. Calendar-pure and
 * local on purpose: the snapshot's directory date is the collection date, so
 * July 1 starts the new program year. Never call this on
 * `metadata.sourceCsvDate` — see constraint 1 in the file header.
 */
function programYearForSnapshotDate(date: string): string {
  const year = Number.parseInt(date.slice(0, 4), 10)
  const month = Number.parseInt(date.slice(5, 7), 10)
  return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

/** Every `YYYY-MM-DD` snapshot directory in the cache, oldest first. */
function listSnapshotDates(cacheDir: string): string[] {
  const snapshotsDir = join(cacheDir, 'snapshots')
  if (!existsSync(snapshotsDir)) return []
  return readdirSync(snapshotsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && DATE_DIR_PATTERN.test(entry.name))
    .map(entry => entry.name)
    .sort()
}

/**
 * The last snapshot belonging to a program year — its year-end freeze.
 *
 * Selection is by the snapshot's own date, NOT by `sourceCsvDate`: the
 * June-30 freeze is published ~3 weeks later, so a program-year-equality
 * guard on the source date drops every completed year (Lesson 139).
 */
function selectYearEndSnapshot(
  dates: string[],
  programYear: string
): string | undefined {
  const inYear = dates.filter(
    date => programYearForSnapshotDate(date) === programYear
  )
  return inYear[inYear.length - 1]
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T
}

function districtFilesIn(snapshotDir: string): string[] {
  return readdirSync(snapshotDir)
    .filter(
      name =>
        DISTRICT_FILE_PATTERN.test(name) && !name.endsWith('_reports.json')
    )
    .sort()
}

interface ClubTierTally {
  /** D tier only — NOT TI's all-tier "Total Distinguished Clubs" column. */
  dTierClubs: number
  sTierClubs: number
  pTierClubs: number
  mTierClubs: number
  /** Counted independently of the four tiers: any non-null classification. */
  distinguishedOrBetterClubs: number
  /** True when the Smedley tier is present in this year's data at all. */
  smedleyTierExists: boolean
}

/**
 * Count club tiers from the raw `clubPerformance` rows of every district
 * snapshot — the version-independent source (constraint 2).
 */
function tallyClubTiers(
  snapshotDir: string,
  rankings: DistrictRanking[]
): ClubTierTally {
  const tally: ClubTierTally = {
    dTierClubs: 0,
    sTierClubs: 0,
    pTierClubs: 0,
    mTierClubs: 0,
    distinguishedOrBetterClubs: 0,
    // The tier is also "present" when the era's rankings carry the field,
    // so a year that simply had no Smedley clubs still reports 0 rather
    // than absent.
    smedleyTierExists: rankings.some(r => r.smedleyDistinguished !== undefined),
  }

  for (const fileName of districtFilesIn(snapshotDir)) {
    const perDistrict = readJson<{
      status?: string
      data?: { clubPerformance?: Array<Record<string, unknown>> }
    }>(join(snapshotDir, fileName))
    if (perDistrict.status === 'failed') continue

    for (const club of perDistrict.data?.clubPerformance ?? []) {
      const raw = club['Club Distinguished Status']
      const tier = classifyDistinguishedTier(
        typeof raw === 'string' ? raw : undefined
      )
      if (tier === null) continue

      tally.distinguishedOrBetterClubs++
      if (tier === 'D') tally.dTierClubs++
      else if (tier === 'S') tally.sTierClubs++
      else if (tier === 'P') tally.pTierClubs++
      else if (tier === 'M') {
        tally.mTierClubs++
        tally.smedleyTierExists = true
      }
    }
  }

  return tally
}

/**
 * Score every district under the rules of the program year the SNAPSHOT
 * belongs to, and tally the tiers (constraint 1). `Unknown` districts stay
 * their own bucket — the comparator folds them into neither side.
 */
function tallyDistrictTiers(
  rankings: DistrictRanking[],
  programYear: string
): DistrictTierCounts {
  const calculator = new DistinguishedDistrictCalculator()
  const statuses = calculator.calculateAll(rankings, programYear)

  const counts: Record<string, number> = {}
  for (const status of Object.values(statuses)) {
    counts[status.currentTier] = (counts[status.currentTier] ?? 0) + 1
  }
  return counts as DistrictTierCounts
}

function computeProgramYear(
  cacheDir: string,
  snapshotDate: string
): ComputedProgramYearTotals {
  const snapshotDir = join(cacheDir, 'snapshots', snapshotDate)
  const programYear = programYearForSnapshotDate(snapshotDate)

  const rankingsFile = readJson<AllDistrictsRankingsData>(
    join(snapshotDir, 'all-districts-rankings.json')
  )
  const rankings = rankingsFile.rankings ?? []

  const clubs = tallyClubTiers(snapshotDir, rankings)
  const paidClubsFromRankings = rankings.reduce(
    (sum, ranking) => sum + (ranking.paidClubs ?? 0),
    0
  )

  return {
    programYear,
    districtTiers: tallyDistrictTiers(rankings, programYear),
    distinguishedClubs: clubs.dTierClubs,
    selectDistinguishedClubs: clubs.sTierClubs,
    presidentsDistinguishedClubs: clubs.pTierClubs,
    // Absent — not zero — for years before the tier existed.
    ...(clubs.smedleyTierExists
      ? { smedleyDistinguishedClubs: clubs.mTierClubs }
      : {}),
    totalDistinguishedClubs: clubs.distinguishedOrBetterClubs,
    paidClubs: paidClubsFromRankings,
  }
}

function main(): void {
  let args: Args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (err) {
    log(`Usage: validate-vs-ceo-report.ts --cache-dir <dir> [--json]`)
    log(String(err instanceof Error ? err.message : err))
    process.exit(2)
  }

  const dates = listSnapshotDates(args.cacheDir)
  if (dates.length === 0) {
    log(`No snapshot directories under ${join(args.cacheDir, 'snapshots')}.`)
    log('Sync the year-end snapshot archive from GCS first (R2).')
    process.exit(2)
  }

  const computed: ComputedProgramYearTotals[] = []
  for (const { programYear } of CEO_REPORT_FIGURES) {
    const snapshotDate = selectYearEndSnapshot(dates, programYear)
    if (!snapshotDate) {
      // Absent is absent — the comparator reports noData, never a mismatch.
      log(`${programYear}: no snapshot in the cache — reporting no data`)
      continue
    }
    log(`${programYear}: using snapshot ${snapshotDate}`)
    try {
      computed.push(computeProgramYear(args.cacheDir, snapshotDate))
    } catch (err) {
      log(
        `${programYear}: could not read snapshot ${snapshotDate} — ` +
          `${err instanceof Error ? err.message : String(err)}`
      )
      process.exit(2)
    }
  }

  const comparison = compareToCeoReport(computed)

  log('')
  log(formatComparisonTable(comparison))

  if (args.json) {
    process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`)
  }

  process.exit(comparison.ok ? 0 : 1)
}

main()
