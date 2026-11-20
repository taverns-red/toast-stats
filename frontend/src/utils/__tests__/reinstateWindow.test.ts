/**
 * #3111 — the five-period reinstate window, drawn from the pipeline's
 * `lastChanceBy` (the last day of period 5) and `inactivePeriod` (#3103,
 * `classifyReinstatement` in analytics-core). Periods run October 1 to
 * March 31 and April 1 to September 30; period 1 is the one after the
 * suspension deadline, period 5 ends on `lastChanceBy`.
 */
import { describe, expect, it } from 'vitest'
import { classifyReinstatement } from '@taverns-red/analytics-core'
import {
  MERGE_PERIOD5_LINE,
  reinstatePeriodLine,
  reinstateWindowPeriods,
  reinstateWindowSummary,
} from '../reinstateWindow'

describe('reinstateWindowPeriods', () => {
  it('a March 31 last chance: period 1 starts the October 1 after the Sep 30 suspension', () => {
    const periods = reinstateWindowPeriods('2027-03-31')
    expect(periods).toEqual([
      {
        number: 1,
        start: '2024-10-01',
        end: '2025-03-31',
        range: 'Oct 2024 – Mar 2025',
        status: 'suspended',
      },
      {
        number: 2,
        start: '2025-04-01',
        end: '2025-09-30',
        range: 'Apr 2025 – Sep 2025',
        status: 'closed',
      },
      {
        number: 3,
        start: '2025-10-01',
        end: '2026-03-31',
        range: 'Oct 2025 – Mar 2026',
        status: 'closed',
      },
      {
        number: 4,
        start: '2026-04-01',
        end: '2026-09-30',
        range: 'Apr 2026 – Sep 2026',
        status: 'closed',
      },
      {
        number: 5,
        start: '2026-10-01',
        end: '2027-03-31',
        range: 'Oct 2026 – Mar 2027',
        status: 'closed',
      },
    ])
  })

  it('a September 30 last chance: period 1 starts the April 1 after the Mar 31 suspension', () => {
    const periods = reinstateWindowPeriods('2027-09-30')
    expect(periods?.map(p => [p.start, p.end])).toEqual([
      ['2025-04-01', '2025-09-30'],
      ['2025-10-01', '2026-03-31'],
      ['2026-04-01', '2026-09-30'],
      ['2026-10-01', '2027-03-31'],
      ['2027-04-01', '2027-09-30'],
    ])
    expect(periods?.[0]?.range).toBe('Apr 2025 – Sep 2025')
  })

  it.each(['2027-03-30', '2027-10-01', 'not a date', ''])(
    'no window for a last chance that is not a period end (%s)',
    value => {
      expect(reinstateWindowPeriods(value)).toBeNull()
    }
  )

  /* The window must agree with the rule it draws: for the two D61 clubs in
     the brief, on 2026-11-19, the period the pipeline names contains asOf. */
  it.each([
    ['2024-09-30', 5, '2027-03-31', '2024-10-01'],
    ['2026-09-30', 1, '2029-03-31', '2026-10-01'],
    ['2026-03-31', 2, '2028-09-30', '2026-04-01'],
  ])(
    'agrees with classifyReinstatement for a club suspended %s',
    (suspendDate, period, lastChance, firstStart) => {
      const asOf = '2026-11-19'
      const r = classifyReinstatement(
        { status: 'suspended', suspendDate },
        asOf
      )
      expect(r.inactivePeriod).toBe(period)
      expect(r.lastChanceBy).toBe(lastChance)
      const periods = reinstateWindowPeriods(r.lastChanceBy!)!
      expect(periods[0]!.start).toBe(firstStart)
      const now = periods[r.inactivePeriod! - 1]!
      expect(now.start <= asOf && asOf <= now.end).toBe(true)
    }
  )
})

describe('reinstateWindowSummary (the screen reader sentence)', () => {
  it('names the period and the last chance', () => {
    expect(reinstateWindowSummary(5, '2027-03-31')).toBe(
      'Period 5 of 5, last chance March 31, 2027.'
    )
    expect(reinstateWindowSummary(1, '2029-03-31')).toBe(
      'Period 1 of 5, last chance March 31, 2029.'
    )
  })
})

describe('reinstatePeriodLine (the Can reinstate row line)', () => {
  it('periods 1 to 4: the approved pattern', () => {
    expect(
      reinstatePeriodLine({ inactivePeriod: 1, lastChanceBy: '2029-03-31' })
    ).toBe('Period 1 of 5. Last chance: March 31, 2029.')
    expect(
      reinstatePeriodLine({ inactivePeriod: 4, lastChanceBy: '2027-09-30' })
    ).toBe('Period 4 of 5. Last chance: September 30, 2027.')
  })

  it('period 5: one line in the draft, two when the merge is switched off', () => {
    const row = { inactivePeriod: 5, lastChanceBy: '2027-03-31' }
    expect(MERGE_PERIOD5_LINE).toBe(true)
    expect(reinstatePeriodLine(row)).toBe(
      'Period 5 of 5. Last chance: must reinstate by March 31, 2027, or charter as a new club.'
    )
    expect(reinstatePeriodLine(row, { mergePeriod5: false })).toBe(
      'Period 5 of 5. Last chance: March 31, 2027. Last chance: must reinstate by March 31, 2027, or charter as a new club.'
    )
  })

  it('no line without a period or a last chance', () => {
    expect(reinstatePeriodLine({})).toBe('')
    expect(reinstatePeriodLine({ inactivePeriod: 3 })).toBe('')
    expect(reinstatePeriodLine({ lastChanceBy: '2027-03-31' })).toBe('')
  })
})
