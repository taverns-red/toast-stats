import { describe, it, expect } from 'vitest'
import {
  aprilRenewalsByClub,
  countConfirmedDistinguishedClubs,
} from './confirmedDistinguished.js'

describe('countConfirmedDistinguishedClubs (#304, #2221)', () => {
  const club = {
    'Club Number': '01570163',
    'Goals Met': '7',
    'Mem. Base': '32',
    'Mem. dues on time Apr': '1',
  }

  it('reads the "Apr. Ren." count joined on the canonical club id', () => {
    expect(
      countConfirmedDistinguishedClubs(
        [club],
        [{ Club: '1570163', 'Apr. Ren.': '26' }],
        '2025-2026'
      )
    ).toBe(1)
  })

  it('never reads the on-time flag: a club with no district row is not confirmed', () => {
    expect(countConfirmedDistinguishedClubs([club], [], '2025-2026')).toBe(0)
  })

  it('ignores rows without a Club column (an all-districts summary row)', () => {
    expect(
      aprilRenewalsByClub([{ DISTRICT: '61', 'Apr. Ren.': '99' }]).size
    ).toBe(0)
  })
})

describe('countConfirmedDistinguishedClubs requires a Club Success Plan (#2323)', () => {
  // D80 club 357 on 2026-08-20: 5 goals, 22 April renewals, CSP = N.
  const base = {
    'Club Number': '00000357',
    'Goals Met': '5',
    'Mem. Base': '109',
  }
  const renewals = [{ Club: '357', 'Apr. Ren.': '22' }]

  it("does not count a club whose CSP is 'N'", () => {
    expect(
      countConfirmedDistinguishedClubs(
        [{ ...base, CSP: 'N' }],
        renewals,
        '2026-2027'
      )
    ).toBe(0)
  })

  it("counts the same club when its CSP is 'Y'", () => {
    expect(
      countConfirmedDistinguishedClubs(
        [{ ...base, CSP: 'Y' }],
        renewals,
        '2026-2027'
      )
    ).toBe(1)
  })

  it('treats a missing CSP column (pre-2025-2026 data) as submitted, like the club-level path', () => {
    expect(
      countConfirmedDistinguishedClubs([base], renewals, '2024-2025')
    ).toBe(1)
  })
})
