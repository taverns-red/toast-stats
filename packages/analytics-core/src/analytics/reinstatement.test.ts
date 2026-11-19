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

  it('on April 1 the October cycle is over: the FAQ says the club has closed, so it names that reason (#3011)', () => {
    const r = classifyReinstatement(suspended('2026-09-30'), '2027-04-01')
    expect(r.eligible).toBe(true)
    expect(r.addsToBase).toBe(false)
    expect(r.reason).toBe('suspended_sept30_past_october_cycle')
    expect(r.baseProgramYear).toBe('2027-2028')
  })

  it('the Oct 1 stamp counts the same way once the cycle is over (#3011)', () => {
    expect(
      classifyReinstatement(suspended('2026-10-01'), '2027-06-15').reason
    ).toBe('suspended_sept30_past_october_cycle')
  })

  it('a Sept 30 suspension two years back is still "unexpected", not past-cycle (#3011)', () => {
    expect(
      classifyReinstatement(suspended('2025-09-30'), '2027-06-15').reason
    ).toBe('suspend_date_unexpected')
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

  it('a suspension from two years back does not match this base year', () => {
    // 2025-09-30 against asOf 2026-11-17 is the past-cycle case (#3011).
    expect(
      classifyReinstatement(suspended('2024-09-30'), '2026-11-17').reason
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

  it('a sighting on asOf itself means the club was on the roster that day, so not closed yet (#3064 review)', () => {
    // A rebuild reads a closed index built later than the date it computes:
    // a club seen on asOf had not closed by asOf.
    const r = classifyReinstatement(closed('2026-11-17'), '2026-11-17')
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('closed_last_seen_after_as_of')
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

  it('the window slides on Oct 1: lastSeen 2024-09-30 is oldest on Sep 30 and gone on Oct 1 (#3011)', () => {
    // asOf 2026-09-30 is in Apr-Sep 2026: the four periods start Oct 2024.
    const before = classifyReinstatement(closed('2024-09-30'), '2026-09-30')
    expect(before.eligible).toBe(true)
    expect(before.oldestPeriod).toBe(true)
    // asOf 2026-10-01 is in Oct 2026-Mar 2027: the four periods start Apr 2025.
    const after = classifyReinstatement(closed('2024-09-30'), '2026-10-01')
    expect(after.eligible).toBe(false)
    expect(after.reason).toBe('closed_outside_window')
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

describe('closed clubs with a known suspend date: closure by the FAQ, not by lastSeen (#3064 review)', () => {
  // A club suspended Mar 31 closes on Oct 1 (FAQ). When it left the roster
  // early (lastSeen 2026-06-30), the day after lastSeen (Jul 1) is one period
  // too early. asOf 2028-09-30 is in Apr-Sep 2028: the four periods are
  // Apr28-Sep28, Oct27-Mar28, Apr27-Sep27 and Oct26-Mar27 (the oldest).
  const closedWithSuspend = (lastSeen: string, suspendDate: string) =>
    ({ status: 'closed', lastSeen, suspendDate }) as const

  it('suspended 2026-03-31, last seen 2026-06-30: closed Oct 1 2026, in the oldest period', () => {
    const r = classifyReinstatement(
      closedWithSuspend('2026-06-30', '2026-03-31'),
      '2028-09-30'
    )
    expect(r.eligible).toBe(true)
    expect(r.oldestPeriod).toBe(true)
    expect(r.reason).toBe('closed_does_not_add')
  })

  it('without the suspend date the same club falls one period earlier, outside the window', () => {
    const r = classifyReinstatement(closed('2026-06-30'), '2028-09-30')
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('closed_outside_window')
  })

  it('TI’s Apr 1 stamp for the Mar 31 cycle closes on the same Oct 1', () => {
    const r = classifyReinstatement(
      closedWithSuspend('2026-06-30', '2026-04-01'),
      '2028-09-30'
    )
    expect(r.eligible).toBe(true)
    expect(r.oldestPeriod).toBe(true)
  })

  it('a Sep 30 suspension closes on Apr 1 of the next year', () => {
    // asOf 2029-03-31 is in Oct28-Mar29: the oldest period is Apr27-Sep27.
    // Closure Apr 1 2027 is inside; the day after lastSeen (Jan 1 2027) is not.
    const r = classifyReinstatement(
      closedWithSuspend('2026-12-31', '2026-09-30'),
      '2029-03-31'
    )
    expect(r.eligible).toBe(true)
    expect(r.oldestPeriod).toBe(true)
  })

  it('a sighting later than the FAQ closure wins: the club was still on the roster', () => {
    const r = classifyReinstatement(
      closedWithSuspend('2026-11-30', '2026-03-31'),
      '2028-09-30'
    )
    expect(r.eligible).toBe(true)
    expect(r.oldestPeriod).toBe(true)
    // 2026-12-01 is in Oct26-Mar27 as well; a later sighting moves it on.
    expect(
      classifyReinstatement(
        closedWithSuspend('2027-03-31', '2026-03-31'),
        '2028-09-30'
      ).oldestPeriod
    ).toBe(false)
  })

  it('a suspend date at no cycle end falls back to the day after lastSeen', () => {
    const r = classifyReinstatement(
      closedWithSuspend('2026-06-30', '2026-05-15'),
      '2028-09-30'
    )
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('closed_outside_window')
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
