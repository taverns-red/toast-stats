/**
 * `v1/global-history.json` assembler (#1499, epic #1496, ruled on #1426).
 *
 * Pure data-in / data-out. Every GCS read, every log line and every write
 * lives in `scripts/build-global-history.ts`; nothing here touches the
 * network, the clock or the filesystem, so the five-year worldwide series is
 * unit-testable against frozen fixtures.
 *
 * The artifact is one row per COMPLETED program year, assembled from
 * artifacts that already exist:
 *
 * - the year-end date's `snapshots/{date}/global-totals.json` (#1498) —
 *   membership, payments, clubs, the tier blocks, district counts;
 * - the program year's `{YYYY}-03-31` `global-totals.json` — the ONE field
 *   TI's published "total membership" row is based on, carried alongside our
 *   June-30 primary rather than substituted for it;
 * - the year-end date's `district_*_reports.json` sidecars — education
 *   achievements, and (forward-only) report-basis new clubs.
 *
 * Three rules this module exists to enforce, each with a plausible wrong
 * answer that type-checks:
 *
 * 1. **Absent is never zero.** Education with no reports set is `null`.
 *    March-31 membership with no March rollup is `null`. Report-basis
 *    `newClubs` for a year whose sidecars carry only education is `null`.
 *    Smedley before PY 2025-2026 is `null` — carried through from
 *    `global-totals`, which already refuses to materialise the literal `0`
 *    the archived rankings store (#1406).
 * 2. **A dated read takes its entity set from that date.** The reports
 *    sidecars are scoped to the year-end date's own rankings district set,
 *    exactly as the district files are: a snapshot directory can legitimately
 *    hold files for districts that did not exist on its date (#1465/#1466).
 *    With no scope in hand, education is refused rather than guessed at.
 * 3. **Key on the snapshot date.** A year-end snapshot's
 *    `metadata.sourceCsvDate` falls in JULY — a program-year equality guard
 *    keyed on it drops every completed year (Lesson 139). Dates are
 *    string-parsed throughout; `new Date('2025-06-30')` is June 29 in any
 *    UTC-negative zone, which walks a year-end into the previous year.
 *
 * @module globalHistory
 */

import {
  GLOBAL_HISTORY_FORMAT,
  GlobalTotalsSchema,
  type GlobalHistory,
  type GlobalHistoryEducation,
  type GlobalHistoryOmittedYear,
  type GlobalHistoryYear,
  type GlobalTotals,
} from '@taverns-red/shared-contracts'
import { canonicalDistrictId } from '../../packages/analytics-core/src/rollup/globalRollup.js'

/** A completed program year and the snapshot dates it is assembled from. */
export interface ProgramYearEndSelection {
  /** e.g. `2024-2025`. */
  readonly programYear: string
  /** The LATEST snapshot date inside the program year. */
  readonly yearEndDate: string
  /** `{endYear}-03-31` when that snapshot exists, else null. */
  readonly marchDate: string | null
}

/** One `district_{id}_reports.json` sidecar, as read from the date's dir. */
export interface GlobalHistoryReportsFile {
  /** The district id the file is named for (NOT trusted from its body). */
  readonly districtId: string
  /** The parsed JSON. Unvalidated — read structurally, tolerantly. */
  readonly dataset: unknown
}

/** Everything one program-year row is assembled from. */
export interface GlobalHistoryYearSource extends ProgramYearEndSelection {
  /** Parsed `global-totals.json` at `yearEndDate`; null when absent. */
  readonly yearEndTotals: unknown | null
  /** Parsed `global-totals.json` at `marchDate`; null when absent. */
  readonly marchTotals: unknown | null
  /**
   * District ids the year-end date's own `all-districts-rankings.json`
   * listed. `null` when the rankings file was unavailable — education is then
   * refused rather than summed over an unscoped directory (#1466).
   */
  readonly rankingsDistrictIds: readonly string[] | null
  /** The date's reports sidecars; `null` when the set is absent entirely. */
  readonly reports: readonly GlobalHistoryReportsFile[] | null
}

export interface GlobalHistoryBuildResult {
  readonly history: GlobalHistory
  /** Loud, ordered messages for the runner to write to stderr (R4). */
  readonly warnings: readonly string[]
}

/** The program year a date belongs to (July 1 → June 30), string-parsed. */
function programYearForDate(date: string): string {
  const year = Number.parseInt(date.slice(0, 4), 10)
  const month = Number.parseInt(date.slice(5, 7), 10)
  return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

/** The June-30 that closes a `YYYY-YYYY` program year. */
function closingDateOf(programYear: string): string {
  return `${programYear.slice(5)}-06-30`
}

/**
 * Group snapshot dates into completed program years, newest first.
 *
 * A program year is COMPLETE once its June 30 is strictly behind `asOfDate`.
 * The in-progress year gets no row: its latest snapshot is a mid-year
 * reading, and publishing it in a year-end series would put a partial figure
 * on the same axis as five finished ones. On June 30 itself the year is not
 * yet complete — the day's data is still moving.
 *
 * `yearEndDate` is the LATEST snapshot inside the year, not literally
 * June 30, so a year whose close was captured on a different day still lands.
 */
export function selectProgramYearEnds(
  dates: readonly string[],
  asOfDate: string
): ProgramYearEndSelection[] {
  const known = new Set(dates)
  /** programYear → latest snapshot date inside it. */
  const latest = new Map<string, string>()

  for (const date of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const programYear = programYearForDate(date)
    // Lexicographic comparison is exact for zero-padded ISO dates.
    if (closingDateOf(programYear) >= asOfDate) continue
    const current = latest.get(programYear)
    if (current === undefined || date > current) latest.set(programYear, date)
  }

  return [...latest.entries()]
    .map(([programYear, yearEndDate]) => {
      const marchDate = `${programYear.slice(5)}-03-31`
      return {
        programYear,
        yearEndDate,
        marchDate: known.has(marchDate) ? marchDate : null,
      }
    })
    .sort((a, b) => b.yearEndDate.localeCompare(a.yearEndDate))
}

// ─── Education achievements ────────────────────────────────────────────────

/**
 * Award codes are a code prefix glued to a display name, e.g.
 * `MS1Motivational Strategies Level 1`, `EC3Effective Coaching Level 3`.
 * The level lives in the trailing `Level N` — verified live 2026-08-31 across
 * 2022→2025-06-30, where the only codes NOT ending in `Level 1..5` are
 * `DTMDistinguished Toastmaster` and `PWMENTORPGMPathways Mentor Program`.
 */
const LEVEL_SUFFIX = /Level\s*([1-5])$/

type EducationBucket =
  'level1' | 'level2' | 'level3' | 'level4' | 'level5' | 'dtm' | 'other'

/**
 * Which bucket an award code counts into. The residual is `other`, never a
 * drop: a breakdown without its residual is a breakdown of an unstated
 * subset, and Pathways Mentor Program is a real award with no level.
 */
export function educationBucketFor(award: string): EducationBucket {
  const trimmed = award.trim()
  const level = LEVEL_SUFFIX.exec(trimmed)
  if (level) return `level${level[1]}` as EducationBucket
  if (/^DTM/i.test(trimmed)) return 'dtm'
  return 'other'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `dataset.sections.<name>.records`, or null when the section is absent. */
function sectionRecords(dataset: unknown, name: string): unknown[] | null {
  if (!isRecord(dataset)) return null
  const sections = dataset.sections
  if (!isRecord(sections)) return null
  const s = sections[name]
  if (!isRecord(s)) return null
  return Array.isArray(s.records) ? s.records : null
}

/**
 * Partition report files into the ones inside the date's own district set and
 * the ones outside it. A `null` scope means "unknown", and an unscoped sum is
 * refused — see rule 2 in the module doc.
 */
function scopeReports(
  reports: readonly GlobalHistoryReportsFile[],
  rankingsDistrictIds: readonly string[] | null
): { inScope: GlobalHistoryReportsFile[]; excluded: string[] } | null {
  if (rankingsDistrictIds === null) return null
  const scope = new Set(rankingsDistrictIds.map(canonicalDistrictId))
  const inScope: GlobalHistoryReportsFile[] = []
  const excluded: string[] = []
  for (const file of reports) {
    if (scope.has(canonicalDistrictId(file.districtId))) inScope.push(file)
    else excluded.push(file.districtId)
  }
  return { inScope, excluded: excluded.sort() }
}

/**
 * Sum RAW education-achievement activity over the date's in-scope reports.
 *
 * `null` when nothing in scope carries an `educationAchievements` section —
 * a year we never fetched is not a year with no awards, and a zero-filled row
 * would be indistinguishable from one.
 *
 * NOT DCP credit (#1080): these are raw achievement rows, member-dedup
 * unrecoverable because the personal `Member` column is dropped at parse time.
 */
export function summarizeEducation(
  reports: readonly GlobalHistoryReportsFile[],
  rankingsDistrictIds: readonly string[] | null
): GlobalHistoryEducation | null {
  const scoped = scopeReports(reports, rankingsDistrictIds)
  if (scoped === null) return null

  const buckets: Record<EducationBucket, number> = {
    level1: 0,
    level2: 0,
    level3: 0,
    level4: 0,
    level5: 0,
    dtm: 0,
    other: 0,
  }
  let districtsReporting = 0

  for (const file of scoped.inScope) {
    const records = sectionRecords(file.dataset, 'educationAchievements')
    if (records === null) continue
    districtsReporting += 1
    for (const record of records) {
      if (!isRecord(record)) continue
      const award = typeof record.award === 'string' ? record.award : ''
      const count = record.achievementCount
      if (typeof count !== 'number' || !Number.isFinite(count)) continue
      buckets[educationBucketFor(award)] += count
    }
  }

  if (districtsReporting === 0) return null

  return {
    ...buckets,
    total:
      buckets.level1 +
      buckets.level2 +
      buckets.level3 +
      buckets.level4 +
      buckets.level5 +
      buckets.dtm +
      buckets.other,
    districtsReporting,
    excludedDistricts: scoped.excluded,
  }
}

/**
 * Report-basis new clubs — the `newClubs` section's record count over the
 * date's in-scope reports. `null` when no in-scope district carries the
 * section, which is EVERY historical year: the #1070 backfill wrote only
 * `educationAchievements`. This is a different metric from
 * `newClubsStillActive` and must never be relabelled as it (#1426 ruling 5).
 */
export function countReportBasisNewClubs(
  reports: readonly GlobalHistoryReportsFile[],
  rankingsDistrictIds: readonly string[] | null
): number | null {
  const scoped = scopeReports(reports, rankingsDistrictIds)
  if (scoped === null) return null

  let total = 0
  let districtsReporting = 0
  for (const file of scoped.inScope) {
    const records = sectionRecords(file.dataset, 'newClubs')
    if (records === null) continue
    districtsReporting += 1
    total += records.length
  }
  return districtsReporting === 0 ? null : total
}

// ─── Assembly ──────────────────────────────────────────────────────────────

function toRow(
  selection: ProgramYearEndSelection,
  yearEnd: GlobalTotals,
  march: GlobalTotals | null,
  reports: readonly GlobalHistoryReportsFile[] | null,
  rankingsDistrictIds: readonly string[] | null
): GlobalHistoryYear {
  return {
    programYear: selection.programYear,
    yearEndDate: selection.yearEndDate,
    marchDate: selection.marchDate,
    districts: {
      total: yearEnd.districts.total,
      numbered: yearEnd.districts.numbered,
      includesUndistricted: yearEnd.districts.includesUndistricted,
    },
    membership: {
      totalMembership: yearEnd.membership.totalMembership,
      totalMembershipMarch31: march?.membership.totalMembership ?? null,
      totalPayments: yearEnd.membership.totalPayments,
      paidClubs: yearEnd.membership.paidClubs,
      activeClubs: yearEnd.membership.activeClubs,
      clubsCounted: yearEnd.membership.clubsCounted,
      avgClubSize: yearEnd.membership.avgClubSize,
    },
    // Carried whole from the year-end rollup, Smedley's null included. The
    // tier block is read from a YEAR-END date only: every March-31 rankings
    // file on record carries zeros across all four fields because TI does not
    // confirm club recognition until the year-end reconciliation.
    distinguishedClubs: { ...yearEnd.distinguishedClubs },
    distinguishedDistricts: {
      distinguishedOrBetter:
        yearEnd.distinguishedDistricts.distinguishedOrBetter,
      byTier: { ...yearEnd.distinguishedDistricts.byTier },
    },
    clubMovement: {
      newClubsStillActive: yearEnd.clubMovement.newClubsStillActive,
      suspendedClubs: yearEnd.clubMovement.suspendedClubs,
      newClubs:
        reports === null
          ? null
          : countReportBasisNewClubs(reports, rankingsDistrictIds),
    },
    education:
      reports === null
        ? null
        : summarizeEducation(reports, rankingsDistrictIds),
  }
}

/**
 * Assemble the published artifact, newest program year first.
 *
 * A year whose year-end `global-totals.json` is missing or off-contract is
 * OMITTED — recorded in `omitted` and reported in `warnings` — and the run
 * continues. That is a backfill gap (remediable by a `backfill-global-totals`
 * dispatch), not a reason to fail the whole manifest step and take
 * `v1/latest.json` down with it. A reader can tell an omitted year from a
 * year that never happened, which a silent absence would not allow.
 */
export function buildGlobalHistory(
  sources: readonly GlobalHistoryYearSource[],
  generatedAt: string
): GlobalHistoryBuildResult {
  const years: GlobalHistoryYear[] = []
  const omitted: GlobalHistoryOmittedYear[] = []
  const warnings: string[] = []

  const ordered = [...sources].sort((a, b) =>
    b.yearEndDate.localeCompare(a.yearEndDate)
  )

  for (const source of ordered) {
    if (source.yearEndTotals === null) {
      const reason = 'no global-totals.json at the year-end date'
      omitted.push({
        programYear: source.programYear,
        yearEndDate: source.yearEndDate,
        reason,
      })
      warnings.push(
        `${source.programYear}: omitted — ${reason} (${source.yearEndDate}). ` +
          `Run the backfill-global-totals dispatch for that date.`
      )
      continue
    }

    const parsed = GlobalTotalsSchema.safeParse(source.yearEndTotals)
    if (!parsed.success) {
      const reason =
        `global-totals.json at ${source.yearEndDate} did not match the ` +
        `contract: ${parsed.error.issues[0]?.message ?? 'unknown issue'}`
      omitted.push({
        programYear: source.programYear,
        yearEndDate: source.yearEndDate,
        reason,
      })
      warnings.push(`${source.programYear}: omitted — ${reason}`)
      continue
    }

    let march: GlobalTotals | null = null
    if (source.marchTotals !== null) {
      const parsedMarch = GlobalTotalsSchema.safeParse(source.marchTotals)
      if (parsedMarch.success) march = parsedMarch.data
      else
        warnings.push(
          `${source.programYear}: March-31 rollup at ${source.marchDate} did ` +
            `not match the contract — totalMembershipMarch31 published as null`
        )
    }

    if (source.reports !== null && source.rankingsDistrictIds === null) {
      warnings.push(
        `${source.programYear}: no all-districts-rankings.json at ` +
          `${source.yearEndDate} — education left null rather than summed ` +
          `over an unscoped directory (#1465)`
      )
    }

    years.push(
      toRow(
        source,
        parsed.data,
        march,
        source.reports,
        source.rankingsDistrictIds
      )
    )
  }

  return {
    history: {
      _format: GLOBAL_HISTORY_FORMAT,
      generatedAt,
      years,
      omitted,
    },
    warnings,
  }
}
