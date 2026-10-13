/**
 * Education rollup fold (#1801, epic #1781).
 *
 * Folds one program year's education ledger into counts per district, per
 * region (that PY's own membership, #1820) and worldwide, and the per-PY
 * results into an index with the multi-year trend. Ledger only (Ron,
 * 2026-10-11): a PY's awards come from exactly one source —
 *   - `ledger-history`: raw-education-ledger/<PY>/district_<id>.json (#1802),
 *     2003-04 → 2018-19, whose records carry `awardCode`;
 *   - `reports`: snapshots/<date>/district_<id>_reports.json's
 *     `educationAchievements` (archive backfill at each year-end from 2019-20,
 *     the daily feed for the current PY), whose records carry only the
 *     rendered award, so the code is recovered with `awardCodeFromAward`.
 * Both are tagged by the one shared code → program rule.
 *
 * Per-row degradation (Lesson: an aggregate published from a shared step
 * degrades per row): a district that cannot be counted is `not-available`
 * with a reason and named in every aggregate it belongs to; it never becomes
 * a zero, and it never stops the other districts from being counted.
 *
 * Lesson 153: the fold keeps only counts. Club ids are used to count
 * distinct clubs and then dropped; names, locations and months never leave
 * the input.
 *
 * A snapshot's program year is its LOGICAL date's (the CLAUDE.md tripwire):
 * the 2026-06-30 close, collected in July, is 2025-26.
 */

import {
  EDUCATION_ROLLUP_VERSION,
  awardCodeFromAward,
  educationAwardProgram,
  educationRollupObjectPath,
  pathwaysLevel,
  type DistrictRegionHistory,
  type DistrictReportsDataset,
  type EducationAwardTotals,
  type EducationAwardsBlock,
  type EducationLedgerHistoryFile,
  type EducationRollupAggregate,
  type EducationRollupDistrict,
  type EducationRollupIndex,
  type EducationRollupProgramYear,
} from '@taverns-red/shared-contracts'
import { programYearForSnapshotDate } from './ceoReportSnapshotDates.js'

export type EducationRollupSource = 'ledger-history' | 'reports'

export interface EducationRollupInput {
  programYear: string
  source: EducationRollupSource
  /** The snapshot date the reports were read from; null for the ledger. */
  sourceDate: string | null
  /** `ledger-history`: every ledger file of the PY (ok and no-data). */
  ledgerFiles: readonly EducationLedgerHistoryFile[]
  /** `reports`: every reports dataset read at `sourceDate`. */
  reports: readonly DistrictReportsDataset[]
  /** The PY's district list (its rankings), so a missing file is visible. */
  districtIds: readonly string[]
  /** null: no region history at all, so no region rollup. */
  regionHistory: DistrictRegionHistory | null
}

export interface OmittedProgramYear {
  programYear: string
  reason: string
}

export interface EducationRollupPlanEntry {
  programYear: string
  source: EducationRollupSource
  /** The PY's last snapshot date: its rankings name the PY's districts. */
  rankingsDate: string | null
  /** `reports`: the PY's snapshot dates, newest first, to try in order. */
  reportCandidates: string[]
}

/** How many dates back the caller looks for a PY's reports. */
export const MAX_REPORT_CANDIDATES = 6

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

interface AwardRow {
  awardCode: string
  count: number
  club: string
}

type Counted =
  | {
      status: 'available'
      rows: AwardRow[]
      membersWithAward: number | null
      tripleCrownAchievers: number | null
    }
  | {
      status: 'not-available'
      reason: Extract<
        EducationRollupDistrict,
        { status: 'not-available' }
      >['reason']
    }

function fromLedger(
  file: EducationLedgerHistoryFile,
  programYear: string
): Counted {
  if (file.programYear !== programYear) {
    return { status: 'not-available', reason: 'program-year-mismatch' }
  }
  if (file.status === 'no-data') {
    return { status: 'not-available', reason: 'no-data' }
  }
  return {
    status: 'available',
    rows: file.records.map(r => ({
      awardCode: r.awardCode,
      count: r.achievementCount,
      club: r.club,
    })),
    membersWithAward: null,
    tripleCrownAchievers: null,
  }
}

function fromReports(
  dataset: DistrictReportsDataset,
  programYear: string
): Counted {
  if (dataset.programYear !== programYear) {
    return { status: 'not-available', reason: 'program-year-mismatch' }
  }
  const achievements = dataset.sections.educationAchievements
  if (!achievements) {
    return { status: 'not-available', reason: 'no-education-section' }
  }
  const members = dataset.sections.educationMembers
  return {
    status: 'available',
    rows: achievements.records.map(r => ({
      awardCode: awardCodeFromAward(r.award),
      count: r.achievementCount,
      club: r.club,
    })),
    membersWithAward: members
      ? members.records.reduce((s, r) => s + r.membersWithAward, 0)
      : null,
    tripleCrownAchievers:
      dataset.sections.tripleCrown?.summary.achieverCount ?? null,
  }
}

const zeroTotals = (): EducationAwardTotals => ({
  awards: 0,
  pathways: 0,
  legacy: 0,
  dtm: 0,
  other: 0,
})

/** Re-insert a record's keys in sorted order (stable bytes). */
function sortedRecord<T>(rec: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {}
  for (const k of Object.keys(rec).sort(byString)) out[k] = rec[k] as T
  return out
}

function countRows(
  rows: readonly AwardRow[],
  membersWithAward: number | null,
  tripleCrownAchievers: number | null
): EducationAwardsBlock {
  const totals = zeroTotals()
  const matrix: Record<string, [number, number, number, number, number]> = {}
  const legacyByCode: Record<string, number> = {}
  const otherByCode: Record<string, number> = {}
  const clubs = new Set<string>()
  for (const row of rows) {
    if (row.count <= 0) continue
    clubs.add(row.club)
    totals.awards += row.count
    switch (educationAwardProgram(row.awardCode)) {
      case 'Pathways': {
        totals.pathways += row.count
        const level = pathwaysLevel(row.awardCode)
        if (!level) throw new Error(`not a Pathways level: ${row.awardCode}`)
        const cells = (matrix[level.path] ??= [0, 0, 0, 0, 0])
        cells[level.level - 1] = (cells[level.level - 1] ?? 0) + row.count
        break
      }
      case 'Legacy':
        totals.legacy += row.count
        legacyByCode[row.awardCode] =
          (legacyByCode[row.awardCode] ?? 0) + row.count
        break
      case 'DTM':
        totals.dtm += row.count
        break
      case 'Other':
        totals.other += row.count
        otherByCode[row.awardCode] =
          (otherByCode[row.awardCode] ?? 0) + row.count
        break
    }
  }
  return {
    totals,
    pathwaysMatrix: sortedRecord(matrix),
    legacyByCode: sortedRecord(legacyByCode),
    otherByCode: sortedRecord(otherByCode),
    clubsWithAward: clubs.size,
    membersWithAward,
    tripleCrownAchievers,
  }
}

/**
 * Sum district blocks. `clubsWithAward` sums per-district distinct clubs (a
 * club belongs to one district in a PY). Members and Triple Crown are null
 * unless every summed block measured them: a partial sum would be a
 * plausible wrong number.
 */
function sumBlocks(
  blocks: readonly EducationAwardsBlock[],
  districtsAvailable: string[],
  districtsNotAvailable: string[]
): EducationRollupAggregate {
  const totals = zeroTotals()
  const matrix: Record<string, [number, number, number, number, number]> = {}
  const legacyByCode: Record<string, number> = {}
  const otherByCode: Record<string, number> = {}
  let clubsWithAward = 0
  let members: number | null = blocks.length > 0 ? 0 : null
  let tripleCrown: number | null = blocks.length > 0 ? 0 : null
  for (const b of blocks) {
    for (const k of Object.keys(totals) as (keyof EducationAwardTotals)[]) {
      totals[k] += b.totals[k]
    }
    for (const [p, cells] of Object.entries(b.pathwaysMatrix)) {
      const into = (matrix[p] ??= [0, 0, 0, 0, 0])
      cells.forEach((n, i) => (into[i] = (into[i] as number) + n))
    }
    for (const [c, n] of Object.entries(b.legacyByCode)) {
      legacyByCode[c] = (legacyByCode[c] ?? 0) + n
    }
    for (const [c, n] of Object.entries(b.otherByCode)) {
      otherByCode[c] = (otherByCode[c] ?? 0) + n
    }
    clubsWithAward += b.clubsWithAward
    members =
      members === null || b.membersWithAward === null
        ? null
        : members + b.membersWithAward
    tripleCrown =
      tripleCrown === null || b.tripleCrownAchievers === null
        ? null
        : tripleCrown + b.tripleCrownAchievers
  }
  return {
    totals,
    pathwaysMatrix: sortedRecord(matrix),
    legacyByCode: sortedRecord(legacyByCode),
    otherByCode: sortedRecord(otherByCode),
    clubsWithAward,
    membersWithAward: members,
    tripleCrownAchievers: tripleCrown,
    districtsAvailable: [...districtsAvailable].sort(byString),
    districtsNotAvailable: [...districtsNotAvailable].sort(byString),
  }
}

/** Fold one program year. Pure and deterministic in its inputs' order. */
export function rollUpEducationProgramYear(
  input: EducationRollupInput
): EducationRollupProgramYear {
  const { programYear } = input
  if (input.source === 'reports') {
    if (
      !input.sourceDate ||
      programYearForSnapshotDate(input.sourceDate) !== programYear
    ) {
      throw new Error(
        `reports for ${programYear} must come from a snapshot dated in it, got ${input.sourceDate}`
      )
    }
  }

  const counted = new Map<string, Counted>()
  if (input.source === 'ledger-history') {
    for (const f of input.ledgerFiles) {
      counted.set(f.districtId, fromLedger(f, programYear))
    }
  } else {
    for (const d of input.reports) {
      counted.set(d.districtId, fromReports(d, programYear))
    }
  }
  for (const id of input.districtIds) {
    if (!counted.has(id)) {
      counted.set(id, { status: 'not-available', reason: 'no-file' })
    }
  }

  const history = input.regionHistory
  const hasRegions =
    history !== null && history.programYears.includes(programYear)
  const regionOf = (id: string): string | null =>
    hasRegions
      ? (history?.districts[id]?.byProgramYear[programYear] ?? null)
      : null

  const districts: Record<string, EducationRollupDistrict> = {}
  const blocks = new Map<string, EducationAwardsBlock>()
  for (const id of [...counted.keys()].sort(byString)) {
    const c = counted.get(id) as Counted
    const region = regionOf(id)
    if (c.status === 'available') {
      const awards = countRows(
        c.rows,
        c.membersWithAward,
        c.tripleCrownAchievers
      )
      blocks.set(id, awards)
      districts[id] = { status: 'available', region, awards }
    } else {
      districts[id] = { status: 'not-available', region, reason: c.reason }
    }
  }

  const aggregate = (ids: readonly string[]): EducationRollupAggregate => {
    const available = ids.filter(id => blocks.has(id))
    const missing = ids.filter(id => !blocks.has(id))
    return sumBlocks(
      available.map(id => blocks.get(id) as EducationAwardsBlock),
      available,
      missing
    )
  }

  const ids = Object.keys(districts).sort(byString)
  let regions: Record<string, EducationRollupAggregate> | null = null
  const regionsUnassigned: string[] = []
  if (hasRegions) {
    const members = new Map<string, string[]>()
    for (const id of ids) {
      const region = districts[id]?.region ?? null
      if (region === null) {
        regionsUnassigned.push(id)
        continue
      }
      const list = members.get(region) ?? []
      list.push(id)
      members.set(region, list)
    }
    regions = {}
    for (const region of [...members.keys()].sort(byString)) {
      regions[region] = aggregate(members.get(region) as string[])
    }
  }

  return {
    _format: { version: EDUCATION_ROLLUP_VERSION, type: 'education-rollup' },
    programYear,
    source: input.source,
    sourceDate: input.source === 'reports' ? input.sourceDate : null,
    districts,
    regions,
    regionsUnassigned,
    world: aggregate(ids),
  }
}

/** The index: one row per PY, ascending, and the multi-year trend. */
export function buildEducationRollupIndex(
  rollups: readonly EducationRollupProgramYear[],
  omitted: readonly OmittedProgramYear[] = []
): EducationRollupIndex {
  const sorted = [...rollups].sort((a, b) =>
    byString(a.programYear, b.programYear)
  )
  const districtTrend: Record<
    string,
    Record<string, EducationAwardTotals | null>
  > = {}
  const regionTrend: Record<string, Record<string, EducationAwardTotals>> = {}
  let asOf: string | null = null
  for (const r of sorted) {
    if (r.sourceDate && (asOf === null || r.sourceDate > asOf)) {
      asOf = r.sourceDate
    }
    for (const [id, d] of Object.entries(r.districts)) {
      ;(districtTrend[id] ??= {})[r.programYear] =
        d.status === 'available' ? d.awards.totals : null
    }
    for (const [region, agg] of Object.entries(r.regions ?? {})) {
      ;(regionTrend[region] ??= {})[r.programYear] = agg.totals
    }
  }
  return {
    _format: {
      version: EDUCATION_ROLLUP_VERSION,
      type: 'education-rollup-index',
    },
    asOf,
    programYears: sorted.map(r => ({
      programYear: r.programYear,
      source: r.source,
      sourceDate: r.sourceDate,
      path: educationRollupObjectPath(r.programYear),
      world: r.world.totals,
      districtsAvailable: r.world.districtsAvailable.length,
      districtsNotAvailable: r.world.districtsNotAvailable.length,
    })),
    omittedProgramYears: [...omitted].sort((a, b) =>
      byString(a.programYear, b.programYear)
    ),
    trend: {
      districts: sortedRecord(districtTrend),
      regions: sortedRecord(regionTrend),
    },
  }
}

/**
 * Which source each program year is read from, and which snapshot dates to
 * read. `ledgerProgramYears`: the PY directories under raw-education-ledger/.
 * `snapshotDates`: the staged snapshot dates (every one has rankings).
 * A PY with a ledger is read from it; any other PY a snapshot date falls in
 * is read from the reports, trying its dates newest first.
 */
export function planEducationRollup(
  ledgerProgramYears: readonly string[],
  snapshotDates: readonly string[]
): EducationRollupPlanEntry[] {
  const datesByPy = new Map<string, string[]>()
  for (const date of snapshotDates) {
    if (!ISO_DATE.test(date)) continue
    const py = programYearForSnapshotDate(date)
    const list = datesByPy.get(py) ?? []
    list.push(date)
    datesByPy.set(py, list)
  }
  const ledger = new Set(ledgerProgramYears)
  const pys = new Set<string>([...ledger, ...datesByPy.keys()])
  return [...pys].sort(byString).map(programYear => {
    const dates = [...new Set(datesByPy.get(programYear) ?? [])]
      .sort(byString)
      .reverse()
    const source: EducationRollupSource = ledger.has(programYear)
      ? 'ledger-history'
      : 'reports'
    return {
      programYear,
      source,
      rankingsDate: dates[0] ?? null,
      reportCandidates:
        source === 'reports' ? dates.slice(0, MAX_REPORT_CANDIDATES) : [],
    }
  })
}
