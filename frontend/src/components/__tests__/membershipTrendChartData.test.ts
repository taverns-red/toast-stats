/* Membership trend chart data builder (#1705).
 *
 * Spec (Ron): show the whole program year; when the current year is in
 * progress, show it up to the latest date against the full year of each
 * prior year. Points align by position in the program year
 * (calculateProgramYearDay), not by month index. D15 (2026-10-09): the
 * current-year line is anchored on the prior PY's 06-30 close, so the
 * July 1–~25 rollover gap is not left empty.
 *
 * Fixture shapes mirror time-series/district_61/{PY}.json on the CDN
 * (curl 2026-10-12): the prior PY is month-ends Jul–Feb then dailies to
 * 06-30; the current PY starts 07-26.
 */
import { describe, it, expect } from 'vitest'
import { buildMembershipTrendChartData } from '../membershipTrendChartData'
import { calculateProgramYearDay } from '../../utils/programYear'

const MONTH_ENDS_2025_26 = [
  '2025-07-31',
  '2025-08-31',
  '2025-09-30',
  '2025-10-31',
  '2025-11-30',
  '2025-12-31',
  '2026-01-31',
  '2026-02-28',
  '2026-03-31',
  '2026-04-30',
  '2026-05-31',
  '2026-06-30',
]
const PRIOR = {
  label: '2025-2026',
  data: MONTH_ENDS_2025_26.map((date, i) => ({ date, count: 2800 + i })),
}
const CURRENT = [
  { date: '2026-07-26', count: 2937 },
  { date: '2026-08-31', count: 2950 },
  { date: '2026-09-30', count: 2990 },
  { date: '2026-10-11', count: 3012 },
]

describe('buildMembershipTrendChartData (#1705)', () => {
  const built = buildMembershipTrendChartData(CURRENT, [PRIOR], '2026-2027')
  const current = built.series.find(s => s.isCurrent)!
  const prior = built.series.find(s => !s.isCurrent)!

  it('x-domain covers the whole program year (Jul → Jun) when a prior PY is complete', () => {
    expect(built.domain[0]).toBe(0)
    expect(built.domain[1]).toBe(calculateProgramYearDay('2026-06-30'))
  })

  it('the prior series renders all 12 of its points', () => {
    expect(prior.points).toHaveLength(12)
    expect(prior.points.map(p => p.date)).toEqual(MONTH_ENDS_2025_26)
  })

  it('the in-progress current series ends at its latest point (October), not padded to June', () => {
    const last = current.points[current.points.length - 1]!
    expect(last.date).toBe('2026-10-11')
    expect(last.day).toBe(calculateProgramYearDay('2026-10-11'))
    expect(current.inProgress).toBe(true)
  })

  it('aligns by position in the program year: 30 Sep plots at the same x for every year', () => {
    const sepPrior = prior.points.find(p => p.date === '2025-09-30')!
    const sepCurrent = current.points.find(p => p.date === '2026-09-30')!
    expect(sepPrior.day).toBe(sepCurrent.day)
    const row = built.rows.find(r => r.day === sepCurrent.day)!
    expect(row[current.key]).toBe(2990)
    expect(row[prior.key]).toBe(2802)
  })

  it('D15: anchors the current line on the prior PY 06-30 close at the start of the year', () => {
    const first = current.points[0]!
    expect(first).toMatchObject({
      day: 0,
      date: '2026-06-30',
      count: 2811,
      anchor: true,
    })
    expect(current.points.filter(p => p.anchor)).toHaveLength(1)
  })

  it('does not anchor when the predecessor PY has no 06-30 close', () => {
    const partialPrior = { label: '2025-2026', data: PRIOR.data.slice(0, 8) }
    const b = buildMembershipTrendChartData(
      CURRENT,
      [partialPrior],
      '2026-2027'
    )
    const c = b.series.find(s => s.isCurrent)!
    expect(c.points[0]!.date).toBe('2026-07-26')
    expect(c.points.some(p => p.anchor)).toBe(false)
  })

  it('does not anchor on an older PY that is not the predecessor', () => {
    const older = { ...PRIOR, label: '2024-2025' }
    const b = buildMembershipTrendChartData(CURRENT, [older], '2026-2027')
    expect(b.series.find(s => s.isCurrent)!.points.some(p => p.anchor)).toBe(
      false
    )
  })

  it('a completed selected PY renders in full and is not marked in progress', () => {
    const completed = PRIOR.data
    const b = buildMembershipTrendChartData(completed, [], '2025-2026')
    const c = b.series.find(s => s.isCurrent)!
    expect(c.inProgress).toBe(false)
    expect(c.points).toHaveLength(12)
    expect(b.domain[1]).toBe(calculateProgramYearDay('2026-06-30'))
  })

  it('orders the current series first and keeps prior labels', () => {
    expect(built.series[0]!.isCurrent).toBe(true)
    expect(prior.label).toBe('2025-2026')
    expect(current.label).toBe('2026-2027')
  })
})
