/**
 * Reports-derived region and world rollups (#2012, the remainder of #1799).
 *
 * `snapshots/<date>/reports-rollups.json` folds the date's daily-reports
 * sidecars (`district_<id>_reports.json`) into a row per district, a block
 * per region and a world block: prospective clubs by stage, coached clubs,
 * October/April dues-renewal state, officer lists and sponsors/mentors.
 *
 * The inputs are recorded (fixtures/reports-rollups/README.md): the real prod
 * D61 sidecar for 2026-10-15 with names blanked, that date's rankings row and
 * the real region history. Expected counts were computed from those bytes
 * with jq, independently of the builder.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  DistrictRegionHistorySchema,
  DistrictReportsDatasetSchema,
  ReportsRollupsSchema,
  type DistrictReportsDataset,
  type DistrictRegionHistory,
} from '@taverns-red/shared-contracts'
import {
  buildReportsRollups,
  type ReportsRollupsInput,
} from '../reportsRollups.js'

const FIX = path.join(
  process.cwd(),
  'scripts/lib/__tests__/fixtures/reports-rollups'
)
const read = (rel: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(FIX, rel), 'utf-8'))

const D61 = DistrictReportsDatasetSchema.parse(
  read('snapshots/2026-10-15/district_61_reports.json')
)
const RANKINGS = read('snapshots/2026-10-15/all-districts-rankings.json') as {
  rankings: { districtId: string }[]
}
const HISTORY = DistrictRegionHistorySchema.parse(
  read('config/district-region-history.json')
)

function input(over: Partial<ReportsRollupsInput> = {}): ReportsRollupsInput {
  return {
    snapshotDate: '2026-10-15',
    generatedAt: '2026-10-16T10:00:00.000Z',
    districtIds: RANKINGS.rankings.map(r => r.districtId),
    reports: [D61],
    regionHistory: HISTORY,
    ...over,
  }
}

/** D61's sidecar under another district id, its clubs renumbered. */
function cloneAs(
  districtId: string,
  opts: { sameClubs?: boolean } = {}
): DistrictReportsDataset {
  const copy = structuredClone(D61)
  copy.districtId = districtId
  if (!opts.sameClubs) {
    for (const section of Object.values(copy.sections)) {
      if (!section || !('records' in section)) continue
      for (const r of section.records as { club?: string }[]) {
        if (r.club !== undefined) r.club = `9${r.club}`
      }
    }
  }
  return copy
}

/** The figures D61's recorded sidecar holds (jq over the fixture). */
const D61_FIGURES = {
  prospective: {
    clubs: 6,
    paymentComplete: 6,
    byStage: [{ stage: 1, label: 'Application to Organize', clubs: 6 }],
  },
  coached: { activeClubs: 6, completedClubs: 6 },
  octoberDues: {
    clubs: 161,
    verified: 138,
    notReceived: 4,
    low: 16,
    ineligible: 3,
    notYetDue: 0,
    other: 0,
  },
  // 2026-10-15 is before 1 January 2027: April dues are not yet due.
  aprilDues: {
    clubs: 161,
    verified: 0,
    notReceived: 0,
    low: 0,
    ineligible: 0,
    notYetDue: 161,
    other: 0,
  },
  officerList: { submitted: 158, notSubmitted: 3 },
  sponsorsMentors: {
    clubs: 7,
    sponsors: 12,
    mentors: 13,
    other: 0,
    awarded: 9,
  },
}

const FIGURE_KEYS = Object.keys(D61_FIGURES) as (keyof typeof D61_FIGURES)[]

describe('buildReportsRollups: the recorded D61 date', () => {
  const out = buildReportsRollups(input())

  it('is schema-valid, under the logical date and its program year', () => {
    expect(ReportsRollupsSchema.parse(out)).toEqual(out)
    expect(out).toMatchObject({
      _format: { type: 'reports-rollups' },
      snapshotDate: '2026-10-15',
      programYear: '2026-2027',
    })
  })

  it('counts the district figures the sidecar holds', () => {
    expect(out.districts['61']).toEqual({
      region: '05',
      reports: 'available',
      ...D61_FIGURES,
    })
  })

  it('world and region are the one district, by construction', () => {
    expect(out.world).toEqual({
      districts: 1,
      districtsWithoutReports: [],
      ...D61_FIGURES,
    })
    expect(out.regions).toEqual({
      '05': {
        districtIds: ['61'],
        districtsWithoutReports: [],
        ...D61_FIGURES,
      },
    })
    expect(out.regionMembership).toEqual({
      source: 'config/district-region-history.json',
      asOf: '2026-10-15',
      programYear: '2026-2027',
    })
    expect(out.regionMembershipNote).toBeNull()
  })
})

describe('a missing district reads null, not 0, in every block above it', () => {
  // 86 is a real region-05 district on the 2026-10-15 rankings; here it has
  // no sidecar (place-reports placed 93 of 94, say).
  const out = buildReportsRollups(input({ districtIds: ['61', '86'] }))

  it('the district row is null for every figure, and says why', () => {
    const row = out.districts['86']!
    expect(row).toMatchObject({ region: '05', reports: 'no-file' })
    for (const k of FIGURE_KEYS) expect(row[k], k).toBeNull()
  })

  it('its region and the world are null for every figure, and name it', () => {
    for (const block of [out.regions!['05']!, out.world]) {
      for (const k of FIGURE_KEYS) expect(block[k], k).toBeNull()
      expect(block.districtsWithoutReports).toEqual(['86'])
    }
    expect(out.world.districts).toBe(2)
    // The district that has reports still reads its own figures.
    expect(out.districts['61']).toMatchObject(D61_FIGURES)
    expect(ReportsRollupsSchema.safeParse(out).success).toBe(true)
  })

  it('a sidecar of another program year is not counted (logical-date PY)', () => {
    const stale = cloneAs('86')
    stale.programYear = '2025-2026'
    const o = buildReportsRollups(
      input({ districtIds: ['61', '86'], reports: [D61, stale] })
    )
    expect(o.districts['86']?.reports).toBe('program-year-mismatch')
    expect(o.world.octoberDues).toBeNull()
  })
})

describe('a missing section is null, an empty one is 0', () => {
  it('a district without the coaches report nulls coached above it only', () => {
    const noCoaches = cloneAs('86')
    delete noCoaches.sections.coaches
    const out = buildReportsRollups(
      input({ districtIds: ['61', '86'], reports: [D61, noCoaches] })
    )
    expect(out.districts['86']?.coached).toBeNull()
    expect(out.regions?.['05']?.coached).toBeNull()
    expect(out.world.coached).toBeNull()
    expect(out.world.officerList).toEqual({ submitted: 316, notSubmitted: 6 })
  })

  it('a present, empty section counts as a measured 0', () => {
    const empty = cloneAs('86')
    empty.sections.prospectiveClubs = {
      sources: D61.sections.prospectiveClubs!.sources,
      records: [],
    }
    const out = buildReportsRollups(
      input({ districtIds: ['61', '86'], reports: [D61, empty] })
    )
    expect(out.districts['86']?.prospective).toEqual({
      clubs: 0,
      paymentComplete: 0,
      byStage: [],
    })
    expect(out.world.prospective?.clubs).toBe(6)
  })
})

describe('one merged set of the sidecars feeds every block', () => {
  it('world = Σ districts and region = Σ its districts', () => {
    const out = buildReportsRollups(
      input({ districtIds: ['61', '86'], reports: [cloneAs('86'), D61] })
    )
    expect(out.world.octoberDues?.verified).toBe(276)
    expect(out.world.sponsorsMentors).toEqual({
      clubs: 14,
      sponsors: 24,
      mentors: 26,
      other: 0,
      awarded: 18,
    })
    expect(out.world.prospective?.byStage).toEqual([
      { stage: 1, label: 'Application to Organize', clubs: 12 },
    ])
    expect(out.regions?.['05']?.districtIds).toEqual(['61', '86'])
    expect(out.regions?.['05']).toMatchObject({
      coached: out.world.coached,
      officerList: out.world.officerList,
    })
  })

  it('a club in two sidecars counts once, in the first district', () => {
    const out = buildReportsRollups(
      input({
        districtIds: ['61', '86'],
        reports: [D61, cloneAs('86', { sameClubs: true })],
      })
    )
    expect(out.world.octoberDues?.clubs).toBe(161)
    expect(out.districts['86']?.octoberDues?.clubs).toBe(0)
    expect(out.scope.duplicateClubs.length).toBeGreaterThan(0)
    expect(out.scope.duplicateClubs[0]?.districtIds).toEqual(['61', '86'])
  })

  it('a sidecar the rankings do not list is excluded, not counted', () => {
    const out = buildReportsRollups(input({ reports: [D61, cloneAs('999')] }))
    expect(out.scope.excludedDistricts).toEqual(['999'])
    expect(out.districts['999']).toBeUndefined()
    expect(out.world.octoberDues?.clubs).toBe(161)
  })

  it('does not depend on the order the sidecars arrive in', () => {
    const a = buildReportsRollups(
      input({ districtIds: ['61', '86'], reports: [D61, cloneAs('86')] })
    )
    const b = buildReportsRollups(
      input({ districtIds: ['86', '61'], reports: [cloneAs('86'), D61] })
    )
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
  })

  it('an unrecognised prospect stage is kept apart, never guessed', () => {
    const odd = cloneAs('86')
    odd.sections.prospectiveClubs!.records[0]!.prospect = 'Something new'
    const out = buildReportsRollups(
      input({ districtIds: ['61', '86'], reports: [D61, odd] })
    )
    expect(out.districts['86']?.prospective?.byStage).toEqual([
      { stage: 1, label: 'Application to Organize', clubs: 5 },
      { stage: null, label: 'unrecognised', clubs: 1 },
    ])
  })
})

describe('multi-step prospect text (#2142)', () => {
  // Recorded prod cells (district_53/216_reports.json, 2026-10-18).
  it('counts a multi-step prospect at its furthest step, never one long label', () => {
    const multi = cloneAs('86')
    const recs = multi.sections.prospectiveClubs!.records
    recs[0]!.prospect =
      '#1 Application to Organize Complete - 07/20/2026#4 Officer Info Incomplete - 08/03/2026#5 Club Info Incomplete - 08/03/2026#6 Constitution & Bylaws Incomplete - 08/03/2026Payment Complete - 07/20/2026'
    recs[1]!.prospect =
      '#1 Application to Organize Complete - 07/16/2025#4 Officer Info Complete - 07/16/2025Payment Complete - 07/18/2025'
    const out = buildReportsRollups(
      input({ districtIds: ['61', '86'], reports: [D61, multi] })
    )
    expect(out.districts['86']?.prospective?.byStage).toEqual([
      { stage: 1, label: 'Application to Organize', clubs: 4 },
      { stage: 4, label: 'Officer Info', clubs: 1 },
      { stage: 6, label: 'Constitution & Bylaws', clubs: 1 },
    ])
  })
})

describe('region membership comes from the logical date’s program year', () => {
  it('a June close (collected in July) uses the closing PY’s regions', () => {
    const history: DistrictRegionHistory = structuredClone(HISTORY)
    history.districts['61']!.byProgramYear['2025-2026'] = '99'
    const june = structuredClone(D61)
    june.programYear = '2025-2026'
    const out = buildReportsRollups(
      input({
        snapshotDate: '2026-06-30',
        reports: [june],
        regionHistory: history,
      })
    )
    expect(out.programYear).toBe('2025-2026')
    expect(out.districts['61']?.region).toBe('99')
    expect(Object.keys(out.regions ?? {})).toEqual(['99'])
  })

  it('no history: regions null with the reason; districts and world still build', () => {
    const out = buildReportsRollups(input({ regionHistory: null }))
    expect(out.regions).toBeNull()
    expect(out.regionMembership).toBeNull()
    expect(out.regionMembershipNote).toMatch(/district-region-history/)
    expect(out.world.octoberDues?.clubs).toBe(161)
    expect(out.districts['61']?.region).toBeNull()
  })

  it('a history without the PY: regions null with the reason', () => {
    const history = structuredClone(HISTORY)
    history.programYears = history.programYears.filter(p => p !== '2026-2027')
    const out = buildReportsRollups(input({ regionHistory: history }))
    expect(out.regions).toBeNull()
    expect(out.regionMembershipNote).toMatch(/2026-2027/)
  })

  it('a district the history does not place counts in the world, unassigned', () => {
    const out = buildReportsRollups(
      input({ districtIds: ['61', '777'], reports: [D61, cloneAs('777')] })
    )
    expect(out.districts['777']?.region).toBeNull()
    expect(out.scope.unassignedDistricts).toEqual(['777'])
    expect(out.world.octoberDues?.clubs).toBe(322)
    expect(out.regions?.['05']?.octoberDues?.clubs).toBe(161)
  })
})

describe('no person names, and no club names either', () => {
  it('no name, club name or location in the input reaches the output', () => {
    const named = cloneAs('86')
    const planted = 'Planted Person Name'
    for (const section of Object.values(named.sections)) {
      if (!section || !('records' in section)) continue
      for (const r of section.records as Record<string, unknown>[]) {
        for (const k of ['name', 'clubName', 'location']) {
          if (k in r) r[k] = planted
        }
      }
    }
    const out = buildReportsRollups(
      input({ districtIds: ['61', '86'], reports: [D61, named] })
    )
    expect(JSON.stringify(out)).not.toContain(planted)
  })
})
