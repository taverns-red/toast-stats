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
      inactivePeriod: 1,
      lastChanceBy: '2029-03-31',
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

  it('a Sept 30 suspension two years back is past its October cycle: does not add (#3103)', () => {
    const r = classifyReinstatement(suspended('2025-09-30'), '2027-06-15')
    expect(r.addsToBase).toBe(false)
    expect(r.reason).toBe('suspended_sept30_past_october_cycle')
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
      inactivePeriod: 2,
      lastChanceBy: '2028-09-30',
    })
  })

  it.each(['2026-07-01', '2026-08-15', '2026-09-30'])(
    'Jul 1 to Sep 30 (asOf %s) -> adds to this year’s club base',
    asOf => {
      const r = classifyReinstatement(suspended('2026-03-31'), asOf)
      expect(r.addsToBase).toBe(true)
      expect(r.reason).toBe('suspended_mar31_before_oct1')
      expect(r.baseProgramYear).toBe('2026-2027')
    }
  )

  // Ron, 2026-11-20 (#3103): talk only about THIS year's club base. Before
  // the July 1 base date a reinstatement doesn't change this year's base.
  it.each(['2026-04-01', '2026-05-15', '2026-06-30'])(
    'Apr 1 to Jun 30 (asOf %s) -> does not change this year’s club base',
    asOf => {
      const r = classifyReinstatement(suspended('2026-03-31'), asOf)
      expect(r.eligible).toBe(true)
      expect(r.addsToBase).toBe(false)
      expect(r.reason).toBe('suspended_mar31_before_july1')
    }
  )

  it('the boundary: 06-30 does not add, 07-01 adds', () => {
    expect(
      classifyReinstatement(suspended('2026-03-31'), '2026-06-30').addsToBase
    ).toBe(false)
    expect(
      classifyReinstatement(suspended('2026-03-31'), '2026-07-01').addsToBase
    ).toBe(true)
  })

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

  it('a suspension from two years back has closed: does not add (#3103)', () => {
    const r = classifyReinstatement(suspended('2024-09-30'), '2026-11-17')
    expect(r.addsToBase).toBe(false)
    expect(r.reason).toBe('suspended_sept30_past_october_cycle')
  })

  it('an unparseable suspend date is "unexpected", not a crash (the only case left, #3103)', () => {
    expect(
      classifyReinstatement(suspended('Susp 10/01/26'), '2026-11-17').reason
    ).toBe('suspend_date_unexpected')
  })
})

/**
 * #3103 — the five-period rule (Ron, District 61 director, 2026-11-20; TI Club
 * FAQ: "Clubs that have been inactive for five (5) renewal periods must be
 * chartered as new clubs"). Period 1 is the renewal period after the
 * suspension deadline; suspended and closed periods both count. Eligible
 * while the period containing asOf is period 5 or lower.
 *
 * The expectations are worked out from the ruling by hand, period by period,
 * not read back from the implementation. Periods: 1 = the one after the
 * deadline, so Sept 30 2024 -> 1 Oct24-Mar25, 2 Apr-Sep25, 3 Oct25-Mar26,
 * 4 Apr-Sep26, 5 Oct26-Mar27 (last chance 2027-03-31).
 */
const closedWithSuspend = (lastSeen: string, suspendDate: string) =>
  ({ status: 'closed', lastSeen, suspendDate }) as const
const closedWithDeadline = (lastSeen: string, suspensionDeadline: string) =>
  ({ status: 'closed', lastSeen, suspensionDeadline }) as const

describe('five inactive periods: the period arithmetic at the boundaries (#3103)', () => {
  it.each([
    // Sept 30 2024: period 5 is Oct 2026 - Mar 2027.
    ['2024-09-30', '2024-10-01', 1, '2027-03-31'],
    ['2024-09-30', '2025-03-31', 1, '2027-03-31'],
    ['2024-09-30', '2025-04-01', 2, '2027-03-31'],
    ['2024-09-30', '2026-09-30', 4, '2027-03-31'],
    ['2024-09-30', '2026-10-01', 5, '2027-03-31'],
    ['2024-09-30', '2027-03-31', 5, '2027-03-31'],
    // Mar 31 2025: period 1 is Apr-Sep 2025, period 5 Apr-Sep 2027.
    ['2025-03-31', '2025-04-01', 1, '2027-09-30'],
    ['2025-03-31', '2025-09-30', 1, '2027-09-30'],
    ['2025-03-31', '2025-10-01', 2, '2027-09-30'],
    ['2025-03-31', '2027-09-30', 5, '2027-09-30'],
  ])(
    'deadline %s, asOf %s -> period %i, last chance %s',
    (deadline, asOf, period, lastChance) => {
      // A suspended club, so the roster sighting doesn't get in the way.
      const r = classifyReinstatement(suspended(deadline), asOf)
      expect(r.eligible).toBe(true)
      expect(r.inactivePeriod).toBe(period)
      expect(r.lastChanceBy).toBe(lastChance)
    }
  )

  it.each([
    ['2024-09-30', '2027-04-01'],
    ['2025-03-31', '2027-10-01'],
  ])('deadline %s: period 6 starts %s and the club is out', (d, asOf) => {
    const r = classifyReinstatement(closedWithDeadline('2025-06-30', d), asOf)
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('closed_outside_window')
    expect(r.inactivePeriod).toBeUndefined()
    expect(r.lastChanceBy).toBeUndefined()
  })

  it('a suspended club carries its period too: Sept 30 2026 is period 1 on 2026-11-19', () => {
    const r = classifyReinstatement(suspended('2026-09-30'), '2026-11-19')
    expect(r.inactivePeriod).toBe(1)
    expect(r.lastChanceBy).toBe('2029-03-31')
  })

  it('TI’s day-after stamps (10-01, 04-01) count as the deadline', () => {
    expect(
      classifyReinstatement(suspended('2026-10-01'), '2026-11-19')
        .inactivePeriod
    ).toBe(1)
    const r = classifyReinstatement(
      closedWithSuspend('2026-06-30', '2026-04-01'),
      '2026-11-19'
    )
    expect(r.inactivePeriod).toBe(2)
    expect(r.lastChanceBy).toBe('2028-09-30')
  })

  it('oldestPeriod is always false now; nothing relies on it (expand only, ADR 0019)', () => {
    for (const input of [
      suspended('2026-09-30'),
      closed('2025-03-31'),
      closedWithDeadline('2025-03-31', '2024-09-30'),
    ]) {
      expect(classifyReinstatement(input, '2026-11-19').oldestPeriod).toBe(
        false
      )
    }
  })
})

describe('the June 30 cap: District 61 closed clubs on 2026-11-19, from status history (#3103)', () => {
  // report.md §3. lastSeen is capped at the June 30 program-year artifact,
  // so it can't tell these apart; the suspension deadline can.
  it.each(['3778', '7070084', '7857', '9547'])(
    '%s: Suspended from 2025-04-30, last on the roster 2025-06-30 -> Mar 31 2025, period 4',
    () => {
      const r = classifyReinstatement(
        closedWithDeadline('2025-06-30', '2025-03-31'),
        '2026-11-19'
      )
      expect(r).toEqual({
        eligible: true,
        oldestPeriod: false,
        addsToBase: false,
        baseProgramYear: '2026-2027',
        reason: 'closed_does_not_add',
        inactivePeriod: 4,
        lastChanceBy: '2027-09-30',
      })
    }
  )

  it.each(['1314924', '28675862', '3492', '700580', '7852257'])(
    '%s: Suspended through 2025-03-31, gone 2025-04-30 -> Sept 30 2024, period 5',
    () => {
      const r = classifyReinstatement(
        closedWithDeadline('2025-03-31', '2024-09-30'),
        '2026-11-19'
      )
      expect(r.eligible).toBe(true)
      expect(r.inactivePeriod).toBe(5)
      expect(r.lastChanceBy).toBe('2027-03-31')
    }
  )

  it('Sept 30 2025 suspension closed in April (1025927): TI date gives period 3', () => {
    const r = classifyReinstatement(
      closedWithSuspend('2026-04-29', '2025-09-30'),
      '2026-11-19'
    )
    expect(r.inactivePeriod).toBe(3)
    expect(r.lastChanceBy).toBe('2028-03-31')
  })

  it('a Mar 31 2024 suspension (last seen 2024-06-30) is period 6: excluded', () => {
    const r = classifyReinstatement(
      closedWithDeadline('2024-06-30', '2024-03-31'),
      '2026-11-19'
    )
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('closed_outside_window')
  })
})

describe('off-cycle suspend dates: period 1 contains the day after the suspend date (#3103)', () => {
  it('suspended 2026-10-08 (D51 7787247): period 1, like the Sept 30 suspensions, so it adds', () => {
    const r = classifyReinstatement(suspended('2026-10-08'), '2026-11-19')
    expect(r.reason).toBe('suspended_sept30_october_cycle')
    expect(r.addsToBase).toBe(true)
    expect(r.eligible).toBe(true)
    expect(r.inactivePeriod).toBe(1)
    expect(r.lastChanceBy).toBe('2029-03-31')
  })

  it('closed, TI date 2025-10-17 (D21 28676909): period 1 is Oct 2025 - Mar 2026, so period 3', () => {
    const r = classifyReinstatement(
      closedWithSuspend('2026-06-30', '2025-10-17'),
      '2026-11-19'
    )
    expect(r.inactivePeriod).toBe(3)
    expect(r.lastChanceBy).toBe('2028-03-31')
  })

  it('suspended on the last day of a period (2026-06-29, D51 7912519): the next day is still Apr-Sep, period 2', () => {
    const r = classifyReinstatement(
      closedWithSuspend('2026-06-30', '2026-06-29'),
      '2026-11-19'
    )
    expect(r.inactivePeriod).toBe(2)
  })

  it('closed, TI date 2024-06-15, last seen 2024-06-30: period 1 is Apr-Sep 2024, so period 6 and out', () => {
    const r = classifyReinstatement(
      closedWithSuspend('2024-06-30', '2024-06-15'),
      '2026-11-19'
    )
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('closed_outside_window')
  })

  it('a suspend date after asOf gives no period, never a guess', () => {
    const r = classifyReinstatement(suspended('2026-11-20'), '2026-11-19')
    expect(r.inactivePeriod).toBeUndefined()
    expect(r.lastChanceBy).toBeUndefined()
  })
})

describe('off-cycle suspensions and the club base: same as the deadline before their period (Ron, 2026-11-20, #3103)', () => {
  // The period containing the day after the suspend date is the suspension
  // period. The club adds, or doesn't, exactly like the deadline
  // suspensions for that period, with the same reinstate-by date.
  it.each(['2026-07-01', '2026-08-01', '2026-09-30'])(
    'suspended 2026-06-15 is treated like Mar 31 2026: adds when reinstated Jul 1 to Sept 30 (asOf %s)',
    asOf => {
      const r = classifyReinstatement(suspended('2026-06-15'), asOf)
      expect(r.addsToBase).toBe(true)
      expect(r.reason).toBe('suspended_mar31_before_oct1')
      expect(r.inactivePeriod).toBe(1)
    }
  )

  it('suspended 2026-06-15, asOf 2026-06-16: like Mar 31 2026 before Jul 1, does not change this year’s base', () => {
    const r = classifyReinstatement(suspended('2026-06-15'), '2026-06-16')
    expect(r.addsToBase).toBe(false)
    expect(r.reason).toBe('suspended_mar31_before_july1')
  })

  it('suspended 2026-06-15, asOf 2026-10-01: like Mar 31 2026 after Oct 1, does not add', () => {
    const r = classifyReinstatement(suspended('2026-06-15'), '2026-10-01')
    expect(r.addsToBase).toBe(false)
    expect(r.reason).toBe('suspended_mar31_after_oct1')
    expect(r.inactivePeriod).toBe(2)
  })

  it.each([
    ['2026-09-26', 'suspended_mar31_after_oct1', false],
    ['2026-10-04', 'suspended_sept30_october_cycle', true],
    ['2026-03-27', 'suspended_sept30_past_october_cycle', false],
    ['2026-04-04', 'suspended_mar31_after_oct1', false],
    ['2026-11-10', 'suspended_sept30_october_cycle', true],
  ])(
    '%s on 2026-11-17 -> %s (adds: %s), never "unexpected"',
    (d, reason, adds) => {
      const r = classifyReinstatement(suspended(d), '2026-11-17')
      expect(r.eligible).toBe(true)
      expect(r.reason).toBe(reason)
      expect(r.addsToBase).toBe(adds)
    }
  )

  it('a Sept 30 stamp on the snapshot dated Sept 30 itself is in the October cycle, not unknown', () => {
    // The month-end close dated 09-30 already carries TI's 10-01 stamps.
    const r = classifyReinstatement(suspended('2026-10-01'), '2026-09-30')
    expect(r.reason).toBe('suspended_sept30_october_cycle')
    expect(r.addsToBase).toBe(true)
  })
})

describe('no suspend date and no deadline: eligibility from lastSeen bounds, period absent (#3103)', () => {
  // A club listed in program year P was suspended no earlier than the start
  // of P (TI drops the previous year's suspensions at the rollover) and no
  // later than the day after lastSeen. Eligible when even the earliest
  // reading is period 5 or lower; out when even the latest is past 5.
  it('last seen 2025-06-30 (3778 without the legacy file): eligible, no period, no last chance', () => {
    const r = classifyReinstatement(closed('2025-06-30'), '2026-11-19')
    expect(r.eligible).toBe(true)
    expect(r.reason).toBe('closed_does_not_add')
    expect(r.inactivePeriod).toBeUndefined()
    expect(r.lastChanceBy).toBeUndefined()
    expect('inactivePeriod' in r).toBe(false)
  })

  it('last seen 2025-03-31: eligible on 2026-11-19 (period 5 at most)', () => {
    const r = classifyReinstatement(closed('2025-03-31'), '2026-11-19')
    expect(r.eligible).toBe(true)
    expect(r.inactivePeriod).toBeUndefined()
  })

  it('last seen 2024-06-30: period 6 at the least, excluded', () => {
    const r = classifyReinstatement(closed('2024-06-30'), '2026-11-19')
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('closed_outside_window')
  })

  it('when the bounds straddle period 5 the club stays listed: TI decides', () => {
    // 2027-04-01: a Sept 30 2024 suspension is period 6, a Mar 31 2025 one
    // period 5. lastSeen 2025-06-30 can't tell them apart.
    const r = classifyReinstatement(closed('2025-06-30'), '2027-04-01')
    expect(r.eligible).toBe(true)
    expect(r.inactivePeriod).toBeUndefined()
  })

  it('a recent closure is eligible', () => {
    expect(
      classifyReinstatement(closed('2026-11-16'), '2026-11-17').eligible
    ).toBe(true)
  })

  it('a sighting on asOf itself means the club was on the roster that day, so not closed yet (#3064 review)', () => {
    const r = classifyReinstatement(closed('2026-11-17'), '2026-11-17')
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('closed_last_seen_after_as_of')
  })

  it('a sighting after asOf is not eligible', () => {
    const r = classifyReinstatement(closed('2026-11-18'), '2026-11-17')
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('closed_last_seen_after_as_of')
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
