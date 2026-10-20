/**
 * World education model (#1811) over the #1801 rollup's `world` block and
 * its per-region blocks. Fixtures: staging `derived/education-rollup/`
 * recorded 2026-10-17 — the world block is whole, the regions are trimmed
 * to 01 and 03 (2026-27: every district available; 2022-23: Region 01 with
 * D09, D32 and D96 "no-file", Region 03 with D23).
 *
 * Read as the rollup computed it, never re-summed from region rows: the
 * world block also counts the districts in no region (`regionsUnassigned`),
 * so a sum of the regions would undercount. Absent is never 0.
 */
import { describe, it, expect } from 'vitest'
import {
  EducationRollupIndexSchema,
  EducationRollupProgramYearSchema,
  type EducationRollupProgramYear,
} from '@taverns-red/shared-contracts'
import { buildWorldEducation, worldEducationTrend } from '../worldEducation'
import current from '../../__tests__/fixtures/education-rollup-2026-2027.recorded.json'
import older from '../../__tests__/fixtures/education-rollup-2022-2023.recorded.json'
import recordedIndex from '../../__tests__/fixtures/education-rollup-index.recorded.json'

const py2627 = EducationRollupProgramYearSchema.parse(current)
const py2223 = EducationRollupProgramYearSchema.parse(older)
const index = EducationRollupIndexSchema.parse(recordedIndex)

const available = (r: ReturnType<typeof buildWorldEducation>) => {
  if (r.status !== 'available') throw new Error(`not available: ${r.reason}`)
  return r
}

describe('buildWorldEducation', () => {
  it('reads the world block: totals, KPIs, coverage and the source', () => {
    const w = available(buildWorldEducation({ rollup: py2627 }))
    expect(w.summary.totals).toEqual({
      awards: 26497,
      pathways: 25847,
      legacy: 0,
      dtm: 403,
      other: 247,
    })
    expect(w.kpis).toEqual({
      awards: 26497,
      membersWithAward: 22370,
      dtms: 403,
      tripleCrownAchievers: 801,
      clubsWithAward: 8542,
    })
    expect(w.coverage).toEqual({ available: 94, notAvailable: 0 })
    expect(w.source).toEqual({ source: 'reports', sourceDate: '2026-10-16' })
    expect(w.summary.otherByCode).toEqual([
      { code: 'PWMENTORPGM', count: 231 },
      { code: 'EOM', count: 16 },
    ])
  })

  it('keeps the matrix Pathways only, adding up to the Pathways total', () => {
    const s = available(buildWorldEducation({ rollup: py2627 })).summary
    const cells = s.paths.reduce((n, p) => n + p.total, 0)
    expect(cells).toBe(25847)
  })

  it('one row per region, read from its block, linking order by number', () => {
    const w = available(buildWorldEducation({ rollup: py2627 }))
    expect(w.regions).not.toBeNull()
    expect(w.regions!.map(r => r.id)).toEqual(['01', '03'])
    expect(w.regions![0]).toEqual({
      id: '01',
      status: 'available',
      totals: { awards: 1562, pathways: 1539, legacy: 0, dtm: 12, other: 11 },
      clubsWithAward: 577,
      membersWithAward: 1313,
      districts: { available: 7, notAvailable: 0 },
    })
    expect(w.unassigned).toEqual(['U'])
  })

  it('a region missing districts says how many; the world says so too', () => {
    const w = available(buildWorldEducation({ rollup: py2223 }))
    expect(w.coverage).toEqual({ available: 124, notAvailable: 4 })
    const r01 = w.regions!.find(r => r.id === '01')!
    expect(r01.districts).toEqual({ available: 6, notAvailable: 3 })
    // Not measured in a PY with an unmeasured district stays null, not 0.
    expect(w.kpis.membersWithAward).toBeNull()
  })

  it('a region with no district available is "not available", never zeros', () => {
    const r01 = py2223.regions!['01']!
    const rollup: EducationRollupProgramYear = {
      ...py2223,
      regions: {
        ...py2223.regions!,
        '01': {
          ...r01,
          totals: { awards: 0, pathways: 0, legacy: 0, dtm: 0, other: 0 },
          pathwaysMatrix: {},
          legacyByCode: {},
          otherByCode: {},
          clubsWithAward: 0,
          membersWithAward: null,
          tripleCrownAchievers: null,
          districtsAvailable: [],
          districtsNotAvailable: [
            ...r01.districtsAvailable,
            ...r01.districtsNotAvailable,
          ].sort(),
        },
      },
    }
    const w = available(buildWorldEducation({ rollup }))
    expect(w.regions!.find(r => r.id === '01')).toEqual({
      id: '01',
      status: 'not-available',
      districts: { available: 0, notAvailable: 9 },
    })
  })

  it('a PY before region history still has the world, with no region rows', () => {
    const w = available(
      buildWorldEducation({ rollup: { ...py2627, regions: null } })
    )
    expect(w.kpis.awards).toBe(26497)
    expect(w.regions).toBeNull()
  })

  it('no rollup is not available', () => {
    expect(buildWorldEducation({ rollup: null })).toEqual({
      status: 'not-available',
      reason: 'no-rollup',
    })
  })
})

describe('worldEducationTrend', () => {
  it('the world totals per PY, oldest first', () => {
    const t = worldEducationTrend(index)
    expect(t).toHaveLength(24)
    expect(t[0]).toEqual({
      programYear: '2003-2004',
      totals: index.programYears[0]!.world,
    })
    expect(t.at(-1)!.programYear).toBe('2026-2027')
    expect(t.at(-1)!.totals!.awards).toBe(26497)
  })

  it('an omitted PY is a "not available" year in place, never a zero', () => {
    const t = worldEducationTrend({
      ...index,
      programYears: index.programYears.filter(
        p => p.programYear !== '2010-2011'
      ),
      omittedProgramYears: [
        { programYear: '2010-2011', reason: 'no reports at any date' },
      ],
    })
    expect(t).toHaveLength(24)
    expect(t.find(y => y.programYear === '2010-2011')).toEqual({
      programYear: '2010-2011',
      totals: null,
    })
    expect(t.map(y => y.programYear)).toEqual(
      [...t.map(y => y.programYear)].sort()
    )
  })

  it('no index is no years', () => {
    expect(worldEducationTrend(null)).toEqual([])
  })
})
