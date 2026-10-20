/**
 * A district's education awards per program year (#1807), read from the
 * #1801 rollup index's `trend.districts`. Fixtures are recorded: the
 * staging index of 2026-10-17 (`education-rollup-index.recorded.json`) and
 * the D61 / D17 trend rows of the 2026-10-18 index.
 *
 * Absent is never 0: a year the rollup marks `null` stays not available;
 * a year the number was not a district at all (D17 was retired 2008-11) is
 * left out, and the gap is reported so the page can say so.
 */
import { describe, expect, it } from 'vitest'
import {
  EducationRollupIndexSchema,
  type EducationRollupIndex,
} from '@taverns-red/shared-contracts'
import recordedIndex from '../../__tests__/fixtures/education-rollup-index.recorded.json'
import recordedTrend from '../../__tests__/fixtures/education-rollup-trend-d61-d17.recorded.json'
import { districtEducationTrend, skipsProgramYears } from '../educationTrend'

const base = EducationRollupIndexSchema.parse(recordedIndex)
const index: EducationRollupIndex = EducationRollupIndexSchema.parse({
  ...base,
  trend: {
    ...base.trend,
    districts: { ...base.trend.districts, ...recordedTrend.districts },
  },
})

describe('districtEducationTrend (#1807)', () => {
  it('lists every program year the district has, oldest first', () => {
    const years = districtEducationTrend(index, '61')
    expect(years).toHaveLength(24)
    expect(years[0]).toEqual({
      programYear: '2003-2004',
      totals: { awards: 733, pathways: 0, legacy: 722, dtm: 11, other: 0 },
    })
    expect(years.at(-1)?.programYear).toBe('2026-2027')
    const pys = years.map(y => y.programYear)
    expect(pys).toEqual([...pys].sort())
  })

  it('keeps a year without a ledger as not available, never 0', () => {
    const years = districtEducationTrend(index, '17')
    const first = years.find(y => y.programYear === '2003-2004')
    expect(first).toEqual({ programYear: '2003-2004', totals: null })
    expect(years.filter(y => y.totals === null)).toHaveLength(5)
  })

  it('leaves out the years the number was not a district', () => {
    const pys = districtEducationTrend(index, '17').map(y => y.programYear)
    expect(pys).not.toContain('2008-2009')
    expect(pys).toContain('2007-2008')
    expect(pys).toContain('2011-2012')
  })

  it('reads a one-digit district id as the rollup’s padded key', () => {
    expect(districtEducationTrend(index, '2')).toEqual(
      districtEducationTrend(index, '02')
    )
    expect(districtEducationTrend(index, '02').length).toBeGreaterThan(0)
  })

  it('is empty with no index or an unknown district', () => {
    expect(districtEducationTrend(null, '61')).toEqual([])
    expect(districtEducationTrend(index, '9999')).toEqual([])
  })
})

describe('skipsProgramYears', () => {
  it('is true when consecutive rows are more than one PY apart', () => {
    expect(skipsProgramYears(districtEducationTrend(index, '17'))).toBe(true)
    expect(skipsProgramYears(districtEducationTrend(index, '61'))).toBe(false)
    expect(skipsProgramYears([])).toBe(false)
  })
})
