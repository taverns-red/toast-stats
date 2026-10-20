/**
 * World education page model (#1811, epic #1781) over the #1801 rollup.
 *
 * Ledger only, read as the rollup computed it: the `world` block's totals,
 * KPIs and Pathways-only level × path matrix (the same summary the region
 * page reads from its block), and one row per region from that PY's
 * `regions`. The world is never re-summed from the region rows: it also
 * counts the districts that were in no region that year
 * (`regionsUnassigned`), so a sum of regions would undercount.
 *
 * Absent is never 0: a region none of whose districts has a ledger is a
 * `not-available` row; a figure the rollup did not measure stays `null`; a
 * PY before the region history (`regions: null`) keeps the world block
 * and has no region rows; a PY the index omitted is a `null` year.
 */
import type {
  EducationRollupIndex,
  EducationRollupProgramYear,
  EducationAwardTotals,
} from '@taverns-red/shared-contracts'
import type { EducationSummary } from './districtEducation'
import type { EducationTrendYear } from './educationTrend'
import {
  summariseEducationAggregate,
  type EducationKpis,
} from './regionEducation'

export interface DistrictCoverage {
  available: number
  notAvailable: number
}

export type WorldEducationRegionRow =
  | {
      id: string
      status: 'available'
      totals: EducationAwardTotals
      clubsWithAward: number
      /** `null` = not measured (archive years). */
      membersWithAward: number | null
      districts: DistrictCoverage
    }
  | {
      id: string
      status: 'not-available'
      districts: DistrictCoverage
    }

export type WorldEducation =
  /** No rollup object for the PY (a 404 or an off-contract body). */
  | { status: 'not-available'; reason: 'no-rollup' }
  | {
      status: 'available'
      summary: EducationSummary
      kpis: EducationKpis
      /** `null` = no region membership for the PY (before 2016-17). */
      regions: WorldEducationRegionRow[] | null
      /** Districts counted in the world but in no region this PY. */
      unassigned: string[]
      coverage: DistrictCoverage
      source: {
        source: EducationRollupProgramYear['source']
        sourceDate: string | null
      }
    }

const numeric = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true })

export function buildWorldEducation({
  rollup,
}: {
  rollup: EducationRollupProgramYear | null
}): WorldEducation {
  if (!rollup) return { status: 'not-available', reason: 'no-rollup' }
  const { summary, kpis } = summariseEducationAggregate(rollup.world)

  const regions = rollup.regions
    ? Object.entries(rollup.regions)
        .sort(([a], [b]) => numeric(a, b))
        .map(([id, block]): WorldEducationRegionRow => {
          const districts = {
            available: block.districtsAvailable.length,
            notAvailable: block.districtsNotAvailable.length,
          }
          if (districts.available === 0) {
            return { id, status: 'not-available', districts }
          }
          return {
            id,
            status: 'available',
            totals: { ...block.totals },
            clubsWithAward: block.clubsWithAward,
            membersWithAward: block.membersWithAward,
            districts,
          }
        })
    : null

  return {
    status: 'available',
    summary,
    kpis,
    regions,
    unassigned: [...rollup.regionsUnassigned],
    coverage: {
      available: rollup.world.districtsAvailable.length,
      notAvailable: rollup.world.districtsNotAvailable.length,
    },
    source: { source: rollup.source, sourceDate: rollup.sourceDate },
  }
}

/** The world's totals per program year, oldest first, from the index —
 *  each year over that year's districts with a ledger. A PY the index
 *  omitted (no rollup at all) is a `null` year in its place. */
export function worldEducationTrend(
  index: EducationRollupIndex | null
): EducationTrendYear[] {
  if (!index) return []
  return [
    ...index.programYears.map(p => ({
      programYear: p.programYear,
      totals: p.world as EducationAwardTotals | null,
    })),
    ...index.omittedProgramYears.map(o => ({
      programYear: o.programYear,
      totals: null,
    })),
  ].sort((a, b) => a.programYear.localeCompare(b.programYear))
}
