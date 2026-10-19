/**
 * Region education model (#1810) over the #1801 rollup. Fixtures: staging
 * `derived/education-rollup/` recorded 2026-10-17, trimmed to Regions 01 and
 * 03 (2026-27: Region 01 all seven districts available; 2022-23: Region 01
 * with D09, D32 and D96 "no-file").
 *
 * Everything is read from the rollup; nothing is re-summed except the
 * level × path matrix into rows. A district without a ledger is a row that
 * says so, never a row of zeros (Lesson: the absence signal is not 0).
 */
import { describe, it, expect } from 'vitest'
import {
  EducationRollupIndexSchema,
  EducationRollupProgramYearSchema,
} from '@taverns-red/shared-contracts'
import { buildRegionEducation, regionEducationTrend } from '../regionEducation'
import current from '../../__tests__/fixtures/education-rollup-2026-2027.recorded.json'
import older from '../../__tests__/fixtures/education-rollup-2022-2023.recorded.json'
import recordedIndex from '../../__tests__/fixtures/education-rollup-index.recorded.json'

const py2627 = EducationRollupProgramYearSchema.parse(current)
const py2223 = EducationRollupProgramYearSchema.parse(older)
const index = EducationRollupIndexSchema.parse(recordedIndex)

const available = (r: ReturnType<typeof buildRegionEducation>) => {
  if (r.status !== 'available') throw new Error(`not available: ${r.reason}`)
  return r
}

describe('buildRegionEducation', () => {
  it('reads the region block: totals, KPIs and the source', () => {
    const r = available(buildRegionEducation({ rollup: py2627, region: '01' }))
    expect(r.summary.totals).toEqual({
      awards: 1562,
      pathways: 1539,
      legacy: 0,
      dtm: 12,
      other: 11,
    })
    expect(r.kpis).toEqual({
      awards: 1562,
      membersWithAward: 1313,
      dtms: 12,
      tripleCrownAchievers: 53,
      clubsWithAward: 577,
    })
    expect(r.source).toEqual({ source: 'reports', sourceDate: '2026-10-16' })
    expect(r.summary.otherByCode).toEqual([{ code: 'PWMENTORPGM', count: 11 }])
  })

  it('turns the Pathways-only matrix into path and level rows that add up', () => {
    const r = available(buildRegionEducation({ rollup: py2627, region: '01' }))
    const s = r.summary
    // 11 canonical paths, then the other codes the ledger carried.
    expect(s.paths.map(p => p.path)).toEqual([
      'DL',
      'EC',
      'EH',
      'IP',
      'LD',
      'MS',
      'PI',
      'PM',
      'SR',
      'TC',
      'VC',
      'BT',
      'CES',
    ])
    expect(s.paths.find(p => p.path === 'PM')).toMatchObject({
      title: 'Presentation Mastery',
      levels: [217, 122, 109, 60, 38],
      total: 546,
    })
    expect(s.levelTotals).toEqual([557, 325, 297, 195, 165])
    expect(s.levelTotals.reduce((a, b) => a + b, 0)).toBe(s.totals.pathways)
    expect(s.levels.at(-1)).toEqual({ key: 'DTM', count: 12, byPath: [] })
  })

  it('one row per district of the region, numeric order, each from its own block', () => {
    const r = available(buildRegionEducation({ rollup: py2627, region: '01' }))
    expect(r.districts.map(d => d.id)).toEqual([
      '02',
      '21',
      '49',
      '101',
      '205',
      '206',
      '207',
    ])
    expect(r.districts[0]).toEqual({
      id: '02',
      status: 'available',
      totals: { awards: 285, pathways: 280, legacy: 0, dtm: 5, other: 0 },
      clubsWithAward: 114,
      membersWithAward: 248,
    })
    expect(r.coverage).toEqual({ available: 7, notAvailable: 0 })
  })

  it('a district without a ledger is "not available" with its reason, not zeros', () => {
    const r = available(buildRegionEducation({ rollup: py2223, region: '01' }))
    const na = r.districts.filter(d => d.status === 'not-available')
    expect(na).toEqual([
      { id: '09', status: 'not-available', reason: 'no-file' },
      { id: '32', status: 'not-available', reason: 'no-file' },
      { id: '96', status: 'not-available', reason: 'no-file' },
    ])
    expect(r.coverage).toEqual({ available: 6, notAvailable: 3 })
    // Measured nowhere in a year-end archive PY: null, never 0.
    expect(r.kpis.membersWithAward).toBeNull()
    expect(r.kpis.tripleCrownAchievers).toBeNull()
    expect(r.kpis.awards).toBe(4245)
  })

  it('says why when there is nothing to show', () => {
    expect(buildRegionEducation({ rollup: null, region: '01' })).toEqual({
      status: 'not-available',
      reason: 'no-rollup',
    })
    expect(
      buildRegionEducation({
        rollup: { ...py2627, regions: null },
        region: '01',
      })
    ).toEqual({ status: 'not-available', reason: 'no-regions' })
    expect(buildRegionEducation({ rollup: py2627, region: '15' })).toEqual({
      status: 'not-available',
      reason: 'region-absent',
    })
  })
})

describe('regionEducationTrend', () => {
  it('the region’s program years, oldest first, straight from the index', () => {
    const t = regionEducationTrend(index, '01')
    expect(t.map(y => y.programYear)).toEqual([
      '2016-2017',
      '2017-2018',
      '2018-2019',
      '2019-2020',
      '2020-2021',
      '2021-2022',
      '2022-2023',
      '2023-2024',
      '2024-2025',
      '2025-2026',
      '2026-2027',
    ])
    expect(t[0]?.totals).toEqual({
      awards: 4321,
      pathways: 0,
      legacy: 4225,
      dtm: 96,
      other: 0,
    })
    expect(t.at(-1)?.totals.awards).toBe(1562)
  })

  it('is empty without an index or for a region it does not carry', () => {
    expect(regionEducationTrend(null, '01')).toEqual([])
    expect(regionEducationTrend(index, '99')).toEqual([])
  })
})
