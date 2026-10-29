/**
 * Reports-derived region and world rollups (#2012, the remainder of #1799).
 *
 * Folds one snapshot date's daily-reports sidecars
 * (`snapshots/<date>/district_<id>_reports.json`) into
 * `snapshots/<date>/reports-rollups.json`: a row per district, a block per
 * region (the logical date's program year, `config/district-region-history`)
 * and a world block. Shape and rules: `ReportsRollupsSchema`.
 *
 * - **One merged set** (Lesson 157). The sidecar records are claimed by club
 *   once, in ascending district order, and every block is a grouping of that
 *   one set, so world = Σ districts and region = Σ its districts by
 *   construction. A club on two districts' reports counts in the first and is
 *   named in `scope.duplicateClubs`.
 * - **Degrade per row; absent is not zero.** A district the date's rankings
 *   list without a usable sidecar has every figure null; a sidecar without a
 *   section has that figure null; and a block is null for a figure as soon as
 *   one of its districts is (a partial sum is an invisible understatement).
 *   A present, empty report is a measured 0.
 * - **One reading of TI's text**: the shared vocabulary
 *   (`parseProspectStage`, `classifyDuesRenewal`, `sponsorMentorRole`), the
 *   same rules the district pages apply.
 * - Counts only (Lesson 153): club ids are used to deduplicate and dropped;
 *   no club name, location or person reaches the output.
 *
 * Pure and deterministic in its inputs: no I/O, no clock.
 */

import {
  REPORTS_ROLLUPS_FORMAT,
  classifyDuesRenewal,
  normalizeClubId,
  parseProspectStage,
  sponsorMentorRole,
  type DistrictRegionHistory,
  type DistrictReportsDataset,
  type DistrictReportsSections,
  type DuesRenewalCounts,
  type ProspectiveStageCount,
  type ReportsRollupDistrict,
  type ReportsRollupDistrictStatus,
  type ReportsRollupFigures,
  type ReportsRollupRegion,
  type ReportsRollups,
} from '@taverns-red/shared-contracts'
import { programYearForSnapshotDate } from './ceoReportSnapshotDates.js'

export interface ReportsRollupsInput {
  /** The snapshot's logical date (the directory name). */
  snapshotDate: string
  generatedAt: string
  /** The districts the date's `all-districts-rankings.json` lists. */
  districtIds: readonly string[]
  /** Every sidecar at the date, in any order. */
  reports: readonly DistrictReportsDataset[]
  /** null: no region history, so no region blocks. */
  regionHistory: DistrictRegionHistory | null
}

const REGION_SOURCE = 'config/district-region-history.json' as const

/** The sidecar sections the rollup reads. */
const SECTIONS = [
  'prospectiveClubs',
  'coaches',
  'octoberDuesRenewal',
  'aprilDuesRenewal',
  'officerList',
  'sponsorsMentors',
] as const satisfies readonly (keyof DistrictReportsSections)[]
type SectionKey = (typeof SECTIONS)[number]
type SectionRecords<K extends SectionKey> = NonNullable<
  DistrictReportsSections[K]
>['records']
/** A district's claimed records per section; null = section absent. */
type Claimed = { [K in SectionKey]: SectionRecords<K> | null }

/** The figure keys, in schema order. */
export const REPORTS_ROLLUP_FIGURE_KEYS = [
  'prospective',
  'coached',
  'octoberDues',
  'aprilDues',
  'officerList',
  'sponsorsMentors',
] as const satisfies readonly (keyof ReportsRollupFigures)[]

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

const NULL_FIGURES: ReportsRollupFigures = {
  prospective: null,
  coached: null,
  octoberDues: null,
  aprilDues: null,
  officerList: null,
  sponsorsMentors: null,
}

const UNRECOGNISED = 'unrecognised'

function sortStages(stages: ProspectiveStageCount[]): ProspectiveStageCount[] {
  return stages.sort((a, b) => {
    if (a.stage !== b.stage) {
      if (a.stage === null) return 1
      if (b.stage === null) return -1
      return a.stage - b.stage
    }
    return byString(a.label, b.label)
  })
}

function addStages(
  into: Map<string, ProspectiveStageCount>,
  stages: readonly ProspectiveStageCount[]
): void {
  for (const s of stages) {
    const key = `${s.stage ?? '-'}\u0000${s.label}`
    const g = into.get(key) ?? { stage: s.stage, label: s.label, clubs: 0 }
    g.clubs += s.clubs
    into.set(key, g)
  }
}

function duesCounts(
  records: SectionRecords<'octoberDuesRenewal'>,
  season: 'october' | 'april',
  programYear: string,
  snapshotDate: string
): DuesRenewalCounts {
  const counts: DuesRenewalCounts = {
    clubs: records.length,
    verified: 0,
    notReceived: 0,
    low: 0,
    ineligible: 0,
    notYetDue: 0,
    other: 0,
  }
  for (const r of records) {
    counts[
      classifyDuesRenewal({
        status: r.renewalStatus,
        season,
        programYear,
        snapshotDate,
      })
    ] += 1
  }
  return counts
}

/** One district's figures from its claimed records. */
function districtFigures(
  c: Claimed,
  programYear: string,
  snapshotDate: string
): ReportsRollupFigures {
  let prospective: ReportsRollupFigures['prospective'] = null
  if (c.prospectiveClubs) {
    const stages = new Map<string, ProspectiveStageCount>()
    let paymentComplete = 0
    for (const r of c.prospectiveClubs) {
      const p = parseProspectStage(r.prospect)
      if (p.recognised && p.payment === 'complete') paymentComplete += 1
      addStages(stages, [
        p.recognised
          ? { stage: p.stageNumber, label: p.stageLabel, clubs: 1 }
          : { stage: null, label: UNRECOGNISED, clubs: 1 },
      ])
    }
    prospective = {
      clubs: c.prospectiveClubs.length,
      paymentComplete,
      byStage: sortStages([...stages.values()]),
    }
  }

  let coached: ReportsRollupFigures['coached'] = null
  if (c.coaches) {
    const active = new Set<string>()
    const completed = new Set<string>()
    for (const r of c.coaches) {
      if (r.activeCoach) active.add(normalizeClubId(r.club))
    }
    for (const r of c.coaches) {
      const id = normalizeClubId(r.club)
      if (!r.activeCoach && !active.has(id)) completed.add(id)
    }
    coached = { activeClubs: active.size, completedClubs: completed.size }
  }

  let sponsorsMentors: ReportsRollupFigures['sponsorsMentors'] = null
  if (c.sponsorsMentors) {
    const clubs = new Set<string>()
    const sm = { sponsors: 0, mentors: 0, other: 0, awarded: 0 }
    for (const r of c.sponsorsMentors) {
      clubs.add(normalizeClubId(r.club))
      sm[sponsorMentorRole(r.code)] += r.count
      if (r.status.trim().toUpperCase() === 'AWARDED') sm.awarded += r.count
    }
    sponsorsMentors = { clubs: clubs.size, ...sm }
  }

  return {
    prospective,
    coached,
    octoberDues: c.octoberDuesRenewal
      ? duesCounts(c.octoberDuesRenewal, 'october', programYear, snapshotDate)
      : null,
    aprilDues: c.aprilDuesRenewal
      ? duesCounts(c.aprilDuesRenewal, 'april', programYear, snapshotDate)
      : null,
    officerList: c.officerList
      ? {
          submitted: c.officerList.filter(r => r.officerListSubmitted).length,
          notSubmitted: c.officerList.filter(r => !r.officerListSubmitted)
            .length,
        }
      : null,
    sponsorsMentors,
  }
}

/** Σ of plain count objects; null when any part is null. */
function sumCounts<T extends Record<string, number>>(
  parts: readonly (T | null)[]
): T | null {
  if (parts.some(p => p === null)) return null
  const [first, ...rest] = parts as T[]
  if (!first) return null
  const out = { ...first }
  for (const p of rest) {
    for (const k of Object.keys(out) as (keyof T)[]) {
      out[k] = ((out[k] as number) + (p[k] as number)) as T[keyof T]
    }
  }
  return out
}

/**
 * Σ of blocks, figure by figure: a figure is null as soon as one block's is.
 * The content gate re-derives region and world blocks with it.
 */
export function sumReportsRollupFigures(
  blocks: readonly ReportsRollupFigures[]
): ReportsRollupFigures {
  if (blocks.length === 0) return { ...NULL_FIGURES }
  const prospects = blocks.map(b => b.prospective)
  let prospective: ReportsRollupFigures['prospective'] = null
  if (!prospects.some(p => p === null)) {
    const stages = new Map<string, ProspectiveStageCount>()
    let clubs = 0
    let paymentComplete = 0
    for (const p of prospects as NonNullable<
      ReportsRollupFigures['prospective']
    >[]) {
      clubs += p.clubs
      paymentComplete += p.paymentComplete
      addStages(stages, p.byStage)
    }
    prospective = {
      clubs,
      paymentComplete,
      byStage: sortStages([...stages.values()]),
    }
  }
  return {
    prospective,
    coached: sumCounts(blocks.map(b => b.coached)),
    octoberDues: sumCounts(blocks.map(b => b.octoberDues)),
    aprilDues: sumCounts(blocks.map(b => b.aprilDues)),
    officerList: sumCounts(blocks.map(b => b.officerList)),
    sponsorsMentors: sumCounts(blocks.map(b => b.sponsorsMentors)),
  }
}

export function buildReportsRollups(
  input: ReportsRollupsInput
): ReportsRollups {
  const { snapshotDate } = input
  const programYear = programYearForSnapshotDate(snapshotDate)
  const ids = [...new Set(input.districtIds)].sort(byString)
  const inScope = new Set(ids)

  const datasets = new Map<string, DistrictReportsDataset>()
  for (const d of [...input.reports].sort((a, b) =>
    byString(a.districtId, b.districtId)
  )) {
    if (!datasets.has(d.districtId)) datasets.set(d.districtId, d)
  }
  const excludedDistricts = [...datasets.keys()].filter(id => !inScope.has(id))

  // The one merged set: in each section, a club's records belong to the
  // first district (ascending) that reports it.
  const owner = new Map<string, string>()
  const seenIn = new Map<string, Set<string>>()
  const status = new Map<string, ReportsRollupDistrictStatus>()
  const claimed = new Map<string, Claimed>()
  for (const id of ids) {
    const d = datasets.get(id)
    if (!d) {
      status.set(id, 'no-file')
      continue
    }
    if (d.programYear !== programYear) {
      status.set(id, 'program-year-mismatch')
      continue
    }
    status.set(id, 'available')
    const c = {} as Record<SectionKey, unknown[] | null>
    for (const key of SECTIONS) {
      const section = d.sections[key]
      if (!section) {
        c[key] = null
        continue
      }
      c[key] = (section.records as { club: string }[]).filter(r => {
        const club = normalizeClubId(r.club)
        const claim = `${key}\u0000${club}`
        const first = owner.get(claim) ?? id
        owner.set(claim, first)
        if (first !== id) {
          const districts = seenIn.get(club) ?? new Set<string>([first])
          districts.add(id)
          seenIn.set(club, districts)
        }
        return first === id
      })
    }
    claimed.set(id, c as Claimed)
  }
  const duplicateClubs = [...seenIn.entries()]
    .map(([clubId, districts]) => ({
      clubId,
      districtIds: [...districts].sort(byString),
    }))
    .sort((a, b) => byString(a.clubId, b.clubId))

  // Regions: the logical date's program year.
  const history = input.regionHistory
  let regionMembershipNote: string | null = null
  if (history === null) {
    regionMembershipNote = `${REGION_SOURCE} was not available for this run`
  } else if (!history.programYears.includes(programYear)) {
    regionMembershipNote = `${REGION_SOURCE} (asOf ${history.asOf}) has no ${programYear}`
  }
  const hasRegions = regionMembershipNote === null
  const regionOf = (id: string): string | null =>
    hasRegions
      ? (history?.districts[id]?.byProgramYear[programYear] ?? null)
      : null

  const districts: Record<string, ReportsRollupDistrict> = {}
  for (const id of ids) {
    const c = claimed.get(id)
    districts[id] = {
      ...(c ? districtFigures(c, programYear, snapshotDate) : NULL_FIGURES),
      region: regionOf(id),
      reports: status.get(id) as ReportsRollupDistrictStatus,
    }
  }

  const figuresOf = (members: readonly string[]) =>
    sumReportsRollupFigures(
      members.map(id => districts[id] as ReportsRollupDistrict)
    )
  const without = (members: readonly string[]) =>
    members.filter(id => status.get(id) !== 'available')

  let regions: Record<string, ReportsRollupRegion> | null = null
  const unassignedDistricts: string[] = []
  if (hasRegions) {
    const members = new Map<string, string[]>()
    for (const id of ids) {
      const region = districts[id]?.region ?? null
      if (region === null) {
        unassignedDistricts.push(id)
        continue
      }
      members.set(region, [...(members.get(region) ?? []), id])
    }
    regions = {}
    for (const region of [...members.keys()].sort(byString)) {
      const list = members.get(region) as string[]
      regions[region] = {
        ...figuresOf(list),
        districtIds: list,
        districtsWithoutReports: without(list),
      }
    }
  }

  return {
    _format: REPORTS_ROLLUPS_FORMAT,
    snapshotDate,
    programYear,
    generatedAt: input.generatedAt,
    regionMembership:
      hasRegions && history
        ? { source: REGION_SOURCE, asOf: history.asOf, programYear }
        : null,
    regionMembershipNote,
    scope: { excludedDistricts, unassignedDistricts, duplicateClubs },
    world: {
      ...figuresOf(ids),
      districts: ids.length,
      districtsWithoutReports: without(ids),
    },
    regions,
    districts,
  }
}
