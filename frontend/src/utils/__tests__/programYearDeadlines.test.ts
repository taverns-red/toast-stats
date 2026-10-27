import { describe, it, expect } from 'vitest'
import {
  cspDueDate,
  getOfficerTrainingRounds,
} from '@taverns-red/analytics-core'
import {
  PROGRAM_YEAR_DEADLINE_RULES,
  areaVisitDeadlines,
  deadlinesForProgramYear,
  nextDeadlines,
} from '../programYearDeadlines'
import { getAreaVisitDeadlines } from '../areaRecognitionState'

const ids = (list: { id: string }[]) => list.map(d => d.id)

describe('deadlinesForProgramYear (#2298)', () => {
  it('lists every cited deadline of 2026-2027 in date order', () => {
    expect(
      deadlinesForProgramYear('2026-2027').map(d => [d.id, d.date])
    ).toEqual([
      ['training-r1-close', '2026-08-31'],
      ['csp', '2026-09-30'],
      ['dues-october', '2026-10-01'],
      ['training-r2-open', '2026-11-01'],
      ['visits-r1', '2026-11-30'],
      ['training-r2-close', '2027-02-28'],
      ['dues-april', '2027-04-01'],
      ['visits-r2', '2027-05-31'],
    ])
  })

  it('closes Round 2 training on Feb 29 in a leap year', () => {
    const r2 = deadlinesForProgramYear('2027-2028').find(
      d => d.id === 'training-r2-close'
    )
    expect(r2?.date).toBe('2028-02-29')
  })

  it('has no Club Success Plan deadline before the CSP was required', () => {
    expect(ids(deadlinesForProgramYear('2024-2025'))).not.toContain('csp')
    expect(ids(deadlinesForProgramYear('2025-2026'))).toContain('csp')
  })

  it('reuses the training-round and CSP rules rather than copying them', () => {
    const list = deadlinesForProgramYear('2026-2027')
    const date = (id: string) => list.find(d => d.id === id)?.date
    const [r1, r2] = getOfficerTrainingRounds('2026-2027')
    expect(date('training-r1-close')).toBe(r1.end)
    expect(date('training-r2-open')).toBe(r2.start)
    expect(date('training-r2-close')).toBe(r2.end)
    expect(date('csp')).toBe(cspDueDate({}, '2026-2027'))
  })

  it('is the source of the area visit deadlines the gate uses', () => {
    expect(areaVisitDeadlines('2026-2027')).toEqual({
      r1: '2026-11-30',
      r2: '2027-05-31',
    })
    expect(getAreaVisitDeadlines('2026-10-26')).toEqual(
      areaVisitDeadlines('2026-2027')
    )
    expect(getAreaVisitDeadlines('2027-06-30')).toEqual(
      areaVisitDeadlines('2026-2027')
    )
  })

  it('cites a TI source on every rule', () => {
    expect(PROGRAM_YEAR_DEADLINE_RULES.length).toBeGreaterThan(0)
    for (const rule of PROGRAM_YEAR_DEADLINE_RULES) {
      expect(rule.source).toMatch(/Item \d{3,4}|toastmasters\.org/)
    }
  })

  it('rejects a malformed program year', () => {
    expect(() => deadlinesForProgramYear('2026')).toThrow()
  })
})

describe('nextDeadlines (#2298)', () => {
  it('returns the next two deadlines with days left', () => {
    expect(
      nextDeadlines('2026-2027', '2026-10-26').map(d => [d.id, d.daysLeft])
    ).toEqual([
      ['training-r2-open', 6],
      ['visits-r1', 35],
    ])
  })

  it('counts a deadline as upcoming on its own day (0 days left)', () => {
    const [first] = nextDeadlines('2026-2027', '2026-11-30')
    expect(first?.id).toBe('visits-r1')
    expect(first?.daysLeft).toBe(0)
  })

  it('drops a deadline the day after it passes', () => {
    expect(ids(nextDeadlines('2026-2027', '2026-12-01'))).toEqual([
      'training-r2-close',
      'dues-april',
    ])
  })

  it('starts the program year with its first deadline (Jul 1)', () => {
    const [first] = nextDeadlines('2026-2027', '2026-07-01')
    expect(first?.id).toBe('training-r1-close')
    expect(first?.daysLeft).toBe(61)
  })

  it('keeps the last deadline through its day, then has none left', () => {
    expect(ids(nextDeadlines('2026-2027', '2027-05-31'))).toEqual(['visits-r2'])
    expect(nextDeadlines('2026-2027', '2027-06-01')).toEqual([])
    expect(nextDeadlines('2026-2027', '2027-06-30')).toEqual([])
  })

  it('reads the program year it is given, not the date (R3)', () => {
    // A date past the year's end: the page's year has nothing left, and
    // the next year's deadlines are not borrowed.
    expect(nextDeadlines('2025-2026', '2026-07-15')).toEqual([])
  })

  it('honours the limit', () => {
    expect(nextDeadlines('2026-2027', '2026-07-01', 1)).toHaveLength(1)
  })
})
