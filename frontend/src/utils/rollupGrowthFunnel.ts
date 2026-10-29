import type {
  ProspectiveStageCount,
  ProspectiveStepsCount,
  RegionRollupFigures,
  RegionRollups,
  ReportsRollupFigures,
  ReportsRollups,
} from '@taverns-red/shared-contracts'
import type { StageValue } from './clubGrowthFunnel'

/* rollupGrowthFunnel (#1812 region, #1813 world; epic #1781) — the view model
   of the region and world Club Growth funnels, the rollups of the district
   funnel (#1794): Prospective → Chartered → Coached → Suspended.

   Two artifacts, each read for what only it has:
   - `reports-rollups.json` (#2012): prospective clubs by checklist steps
     complete (#2388; by stage on dates written before it) (TI's
     Prospective Clubs report — the district funnel's source), coached clubs,
     sponsors/mentors counts;
   - `region-rollups.json` (#1799): clubs chartered and suspended this program
     year (roster dates). Its own `growth.prospective` is Find-A-Club, a
     different source, so it is not used here.

   Pure: the program year and date are the page's (R3). Absent is not zero: a
   figure the artifact writes as null — or an artifact that is not published
   for the date (a 404) — stays unknown/null, and the page says why. Counts
   only: the artifacts carry no club or person names. */

export type RollupGrowthScope =
  { kind: 'region'; regionId: string } | { kind: 'world' }

/** One row of a stage's breakdown: a district (region page) or a region
 *  (world page), linking down to its own funnel. null = not available. */
export interface RollupGrowthChild {
  id: string
  label: string
  to: string
  prospective: number | null
  paymentComplete: number | null
  chartered: number | null
  sponsors: number | null
  mentors: number | null
  coached: number | null
  coachingCompleted: number | null
  suspended: number | null
  /** The district's sidecar (or one of the region's) is missing. */
  reportsMissing: boolean
}

export interface RollupGrowthFunnel {
  /** The scope exists in at least one artifact for this date. */
  found: boolean
  /** reports-rollups.json was published for the date. */
  reportsAvailable: boolean
  /** region-rollups.json was published for the date. */
  rollupsAvailable: boolean
  stages: {
    prospective: StageValue
    chartered: StageValue
    coached: StageValue
    suspended: StageValue
  }
  prospectiveByStage: ProspectiveStageCount[] | null
  /** By checklist steps complete (#2388); null for a date whose artifact
   *  predates it (1.0.0) — the view then falls back to `prospectiveByStage`. */
  prospectiveByProgress: ProspectiveStepsCount[] | null
  paymentComplete: number | null
  coachingCompleted: number | null
  sponsorsMentors: NonNullable<ReportsRollupFigures['sponsorsMentors']> | null
  /** Districts the reports figures cover; null when the artifact is absent. */
  coverage: { districts: number; withoutReports: string[] } | null
  children: RollupGrowthChild[]
}

export interface BuildRollupGrowthFunnelInput {
  reports: ReportsRollups | null
  rollups: RegionRollups | null
  scope: RollupGrowthScope
  /** The page's `location.search`; `py` and `date` ride the drill-down. */
  search?: string
}

export const NOT_AVAILABLE_YET = 'Not available yet for this date'

const KEPT_PARAMS = ['py', 'date'] as const

function keptQuery(search: string | undefined): string {
  if (!search) return ''
  const current = new URLSearchParams(search)
  const kept = new URLSearchParams()
  for (const key of KEPT_PARAMS) {
    const value = current.get(key)
    if (value) kept.set(key, value)
  }
  const qs = kept.toString()
  return qs ? `?${qs}` : ''
}

const byNumericId = (a: string, b: string): number =>
  Number(a) - Number(b) || a.localeCompare(b)

function listNames(ids: readonly string[], noun: string): string {
  const names = ids.map(id => `${noun} ${id}`)
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
}

/** A reports figure → stage value; null says which districts are missing. */
function reportsStage(
  block: ReportsRollupFigures | null,
  read: (b: ReportsRollupFigures) => number | null,
  withoutReports: readonly string[]
): StageValue {
  if (!block) return { kind: 'unknown', reason: NOT_AVAILABLE_YET }
  const v = read(block)
  if (v !== null) return { kind: 'count', value: v }
  return {
    kind: 'unknown',
    reason:
      withoutReports.length > 0
        ? `Not available: no reports for ${listNames(withoutReports, 'District')} on this date`
        : 'Not available: the report was not collected for this date',
  }
}

function rollupStage(
  block: RegionRollupFigures | null,
  read: (b: RegionRollupFigures) => number | null
): StageValue {
  if (!block) return { kind: 'unknown', reason: NOT_AVAILABLE_YET }
  const v = read(block)
  return v === null
    ? {
        kind: 'unknown',
        reason: 'Not available: not collected for this date',
      }
    : { kind: 'count', value: v }
}

const prospective = (b: ReportsRollupFigures | null) =>
  b?.prospective?.clubs ?? null
const coached = (b: ReportsRollupFigures | null) =>
  b?.coached?.activeClubs ?? null

function childRow(
  id: string,
  label: string,
  to: string,
  rep: ReportsRollupFigures | null,
  roll: RegionRollupFigures | null,
  reportsMissing: boolean
): RollupGrowthChild {
  return {
    id,
    label,
    to,
    prospective: prospective(rep),
    paymentComplete: rep?.prospective?.paymentComplete ?? null,
    chartered: roll?.growth.chartered ?? null,
    sponsors: rep?.sponsorsMentors?.sponsors ?? null,
    mentors: rep?.sponsorsMentors?.mentors ?? null,
    coached: coached(rep),
    coachingCompleted: rep?.coached?.completedClubs ?? null,
    suspended: roll?.growth.suspended ?? null,
    reportsMissing,
  }
}

export function buildRollupGrowthFunnel({
  reports,
  rollups,
  scope,
  search,
}: BuildRollupGrowthFunnelInput): RollupGrowthFunnel {
  const qs = keptQuery(search)

  let rep: ReportsRollupFigures | null
  let roll: RegionRollupFigures | null
  let withoutReports: string[] | null
  let districts: number | null
  let children: RollupGrowthChild[]

  if (scope.kind === 'region') {
    const r = reports?.regions?.[scope.regionId] ?? null
    const g = rollups?.regions?.[scope.regionId] ?? null
    rep = r
    roll = g
    withoutReports = r ? r.districtsWithoutReports : null
    districts = r ? r.districtIds.length : null
    const ids = [
      ...new Set([...(r?.districtIds ?? []), ...(g?.districtIds ?? [])]),
    ].sort(byNumericId)
    children = ids.map(id => {
      const d = reports?.districts[id] ?? null
      return childRow(
        id,
        `District ${id}`,
        `/district/${id}/growth${qs}`,
        d,
        rollups?.districts[id] ?? null,
        reports !== null && (d === null || d.reports !== 'available')
      )
    })
  } else {
    rep = reports?.world ?? null
    roll = rollups?.world ?? null
    withoutReports = reports ? reports.world.districtsWithoutReports : null
    districts = reports ? reports.world.districts : null
    const ids = [
      ...new Set([
        ...Object.keys(reports?.regions ?? {}),
        ...Object.keys(rollups?.regions ?? {}),
      ]),
    ].sort(byNumericId)
    children = ids.map(id => {
      const r = reports?.regions?.[id] ?? null
      return childRow(
        id,
        `Region ${id}`,
        `/region/${id}/growth${qs}`,
        r,
        rollups?.regions?.[id] ?? null,
        reports !== null && (r === null || r.districtsWithoutReports.length > 0)
      )
    })
  }

  const missing = withoutReports ?? []
  return {
    found: rep !== null || roll !== null,
    reportsAvailable: reports !== null,
    rollupsAvailable: rollups !== null,
    stages: {
      prospective: reportsStage(rep, b => prospective(b), missing),
      chartered: rollupStage(roll, b => b.growth.chartered),
      coached: reportsStage(rep, b => coached(b), missing),
      suspended: rollupStage(roll, b => b.growth.suspended),
    },
    prospectiveByStage: rep?.prospective?.byStage ?? null,
    prospectiveByProgress: rep?.prospective?.byStepsComplete ?? null,
    paymentComplete: rep?.prospective?.paymentComplete ?? null,
    coachingCompleted: rep?.coached?.completedClubs ?? null,
    sponsorsMentors: rep?.sponsorsMentors ?? null,
    coverage:
      districts === null ? null : { districts, withoutReports: [...missing] },
    children,
  }
}
