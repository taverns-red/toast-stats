import { describe, expect, it } from 'vitest'

import { classifyReinstatement } from './reinstatement.js'

/**
 * #3007 phase 1: the reinstatement rule, from Toastmasters' club reinstatement
 * FAQ. The expectations below come from the FAQ's table, not from what the
 * implementation happens to return.
 *
 * Real District 61 cases (asOf 2026-11-17) are named in `describe` titles.
 */

const suspended = (suspendDate: string) =>
  ({ status: 'suspended', suspendDate }) as const
const closed = (lastSeen: string) => ({ status: 'closed', lastSeen }) as const

describe('base program year', () => {
  it.each([
    ['2026-11-17', '2026-2027'],
    ['2027-01-15', '2026-2027'],
    ['2027-03-31', '2026-2027'],
    ['2026-07-01', '2026-2027'],
    ['2026-09-30', '2026-2027'],
    // April 1 to June 30: the reinstatement counts toward NEXT year's base.
    ['2026-04-01', '2026-2027'],
    ['2026-06-30', '2026-2027'],
    ['2027-04-01', '2027-2028'],
    ['2026-03-31', '2025-2026'],
  ])('asOf %s -> %s', (asOf, expected) => {
    expect(
      classifyReinstatement(closed('2026-01-01'), asOf).baseProgramYear
    ).toBe(expected)
    expect(
      classifyReinstatement(suspended('2026-10-01'), asOf).baseProgramYear
    ).toBe(expected)
  })
})

describe('suspended on Sept 30 (FAQ: "Reinstatement during the October renewal cycle will increase the club base")', () => {
  it('D61: three clubs suspended 2026-09-30, asOf 2026-11-17 -> adds', () => {
    expect(
      classifyReinstatement(suspended('2026-09-30'), '2026-11-17')
    ).toEqual({
      eligible: true,
      oldestPeriod: false,
      addsToBase: true,
      baseProgramYear: '2026-2027',
      reason: 'suspended_sept30_october_cycle',
    })
  })

  it('TI records the cycle as 2026-10-01 in real data: same answer', () => {
    const r = classifyReinstatement(suspended('2026-10-01'), '2026-11-17')
    expect(r.addsToBase).toBe(true)
    expect(r.reason).toBe('suspended_sept30_october_cycle')
  })

  it('the October cycle runs from Oct 1 to Mar 31', () => {
    expect(
      classifyReinstatement(suspended('2026-09-30'), '2026-10-01').addsToBase
    ).toBe(true)
    expect(
      classifyReinstatement(suspended('2026-09-30'), '2027-03-31').addsToBase
    ).toBe(true)
  })

  it('on April 1 the base year rolls to the next year, so it no longer matches', () => {
    const r = classifyReinstatement(suspended('2026-09-30'), '2027-04-01')
    expect(r.eligible).toBe(true)
    expect(r.addsToBase).toBe(false)
    expect(r.reason).toBe('suspend_date_unexpected')
    expect(r.baseProgramYear).toBe('2027-2028')
  })

  it('a suspend date after asOf is never a guess', () => {
    const r = classifyReinstatement(suspended('2026-10-01'), '2026-09-15')
    expect(r.addsToBase).toBe(false)
    expect(r.reason).toBe('suspend_date_after_as_of')
  })
})

describe('suspended on Mar 31 before the base year (FAQ: "On October 1, the club will enter a closed status and a reinstatement after this date will not increase the club base")', () => {
  it("D61: Tunney's / HULL suspended 2026-03-31, asOf 2026-11-17 -> does not add", () => {
    expect(
      classifyReinstatement(suspended('2026-03-31'), '2026-11-17')
    ).toEqual({
      eligible: true,
      oldestPeriod: false,
      addsToBase: false,
      baseProgramYear: '2026-2027',
      reason: 'suspended_mar31_after_oct1',
    })
  })

  it.each(['2026-04-01', '2026-06-30', '2026-07-01', '2026-09-30'])(
    'before Oct 1 (asOf %s) -> adds',
    asOf => {
      const r = classifyReinstatement(suspended('2026-03-31'), asOf)
      expect(r.addsToBase).toBe(true)
      expect(r.reason).toBe('suspended_mar31_before_oct1')
      expect(r.baseProgramYear).toBe('2026-2027')
    }
  )

  it('on Oct 1 itself -> does not add', () => {
    const r = classifyReinstatement(suspended('2026-03-31'), '2026-10-01')
    expect(r.addsToBase).toBe(false)
    expect(r.reason).toBe('suspended_mar31_after_oct1')
  })

  it('stays eligible until the next window closes', () => {
    expect(
      classifyReinstatement(suspended('2026-03-31'), '2027-01-15').eligible
    ).toBe(true)
  })
})

describe('suspend dates near the cycle ends (TI is off by a day or two)', () => {
  it.each(['2026-09-27', '2026-09-28', '2026-10-01', '2026-10-03'])(
    '%s maps to the Sept 30 cycle',
    d => {
      expect(classifyReinstatement(suspended(d), '2026-11-17').reason).toBe(
        'suspended_sept30_october_cycle'
      )
    }
  )

  it.each(['2026-03-28', '2026-03-30', '2026-04-01', '2026-04-03'])(
    '%s maps to the Mar 31 cycle',
    d => {
      expect(classifyReinstatement(suspended(d), '2026-11-17').reason).toBe(
        'suspended_mar31_after_oct1'
      )
    }
  )

  it.each([
    '2026-09-26',
    '2026-10-04',
    '2026-03-27',
    '2026-04-04',
    '2026-06-15',
  ])('%s is not a cycle end -> no guess', d => {
    const r = classifyReinstatement(suspended(d), '2026-11-17')
    expect(r.eligible).toBe(true)
    expect(r.addsToBase).toBe(false)
    expect(r.reason).toBe('suspend_date_unexpected')
  })

  it('a suspension from an earlier year does not match this base year', () => {
    expect(
      classifyReinstatement(suspended('2025-09-30'), '2026-11-17').reason
    ).toBe('suspend_date_unexpected')
  })

  it('an unparseable suspend date is "unexpected", not a crash', () => {
    expect(
      classifyReinstatement(suspended('Susp 10/01/26'), '2026-11-17').reason
    ).toBe('suspend_date_unexpected')
  })
})

describe('closed clubs: four renewal periods, counting back from the current one', () => {
  // asOf 2026-11-17 is in Oct 2026 - Mar 2027. The four periods are
  // Oct26-Mar27, Apr26-Sep26, Oct25-Mar26, Apr25-Sep25 (the oldest). The
  // closure is the day after the last sighting.
  it('D61: closed, last seen 2025-03-31 -> eligible, oldest period, does not add', () => {
    expect(classifyReinstatement(closed('2025-03-31'), '2026-11-17')).toEqual({
      eligible: true,
      oldestPeriod: true,
      addsToBase: false,
      baseProgramYear: '2026-2027',
      reason: 'closed_does_not_add',
    })
  })

  it('last seen 2025-03-30 closed on Mar 31 2025, one day outside', () => {
    const r = classifyReinstatement(closed('2025-03-30'), '2026-11-17')
    expect(r.eligible).toBe(false)
    expect(r.oldestPeriod).toBe(false)
    expect(r.addsToBase).toBe(false)
    expect(r.reason).toBe('closed_outside_window')
  })

  it.each(['2025-04-01', '2025-09-29'])(
    'last seen %s is still in the oldest period',
    d => {
      const r = classifyReinstatement(closed(d), '2026-11-17')
      expect(r.eligible).toBe(true)
      expect(r.oldestPeriod).toBe(true)
    }
  )

  it('last seen 2025-09-30 (closed Oct 1) moves up to the next period', () => {
    const r = classifyReinstatement(closed('2025-09-30'), '2026-11-17')
    expect(r.eligible).toBe(true)
    expect(r.oldestPeriod).toBe(false)
  })

  it('a recent closure is eligible, not oldest', () => {
    const r = classifyReinstatement(closed('2026-11-16'), '2026-11-17')
    expect(r.eligible).toBe(true)
    expect(r.oldestPeriod).toBe(false)
  })

  it('a sighting on asOf itself counts', () => {
    expect(
      classifyReinstatement(closed('2026-11-17'), '2026-11-17').eligible
    ).toBe(true)
  })

  it('a sighting after asOf is not eligible', () => {
    const r = classifyReinstatement(closed('2026-11-18'), '2026-11-17')
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('closed_last_seen_after_as_of')
  })

  it('the window holds until Mar 31 and slides on Apr 1', () => {
    expect(
      classifyReinstatement(closed('2025-03-31'), '2027-03-31').eligible
    ).toBe(true)
    expect(
      classifyReinstatement(closed('2025-03-31'), '2027-04-01').eligible
    ).toBe(false)
    const slid = classifyReinstatement(closed('2025-09-30'), '2027-04-01')
    expect(slid.eligible).toBe(true)
    expect(slid.oldestPeriod).toBe(true)
  })

  it('works in the Apr-Sep half too (asOf 2026-06-15)', () => {
    // Periods: Apr26-Sep26, Oct25-Mar26, Apr25-Sep25, Oct24-Mar25 (oldest).
    const oldest = classifyReinstatement(closed('2024-09-30'), '2026-06-15')
    expect(oldest.eligible).toBe(true)
    expect(oldest.oldestPeriod).toBe(true)
    expect(
      classifyReinstatement(closed('2024-09-29'), '2026-06-15').eligible
    ).toBe(false)
    expect(
      classifyReinstatement(closed('2026-06-15'), '2026-06-15').baseProgramYear
    ).toBe('2026-2027')
  })

  it('a closed club never adds to the base, in any month', () => {
    for (const asOf of [
      '2026-05-01',
      '2026-08-01',
      '2026-11-17',
      '2027-02-01',
    ]) {
      expect(classifyReinstatement(closed('2026-04-15'), asOf).addsToBase).toBe(
        false
      )
    }
  })
})

describe('input checks', () => {
  it('rejects an asOf that is not an ISO date', () => {
    expect(() =>
      classifyReinstatement(closed('2025-03-31'), '11/17/2026')
    ).toThrow(RangeError)
  })

  it('treats an unparseable lastSeen as not eligible', () => {
    const r = classifyReinstatement(closed(''), '2026-11-17')
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('closed_last_seen_invalid')
  })
})
