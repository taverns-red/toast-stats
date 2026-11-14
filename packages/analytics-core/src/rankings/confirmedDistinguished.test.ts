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

describe('pre-April snapshots use their own "Apr. Ren." running count (#2561)', () => {
  // TI's "Apr. Ren." resets after the June close and is a running count for
  // the new program year; it is not last April's figure carried forward.
  // Real D61 club 3045 ran 10, 9 then 5 across 2025-06-30, 2026-06-30 and
  // 2026-10-15. The fixture uses 25 for the prior close (above the 20-member
  // rung) so the two inputs decide differently.
  // DCP FAQ: https://www.toastmasters.org/footer/faq/Distinguished%20Club%20Program
  const clubRow = {
    'Club Number': '00003045',
    'Goals Met': '7',
    'Mem. Base': '20',
    CSP: 'Y',
  }
  const priorJuneClose = [{ Club: '3045', 'Apr. Ren.': '25' }]
  const novemberSnapshot = [{ Club: '3045', 'Apr. Ren.': '5' }]

  it('counts a November snapshot from its own renewals (5), not the prior June close (25)', () => {
    expect(
      countConfirmedDistinguishedClubs([clubRow], novemberSnapshot, '2026-2027')
    ).toBe(0)
  })

  it('the prior June close alone would confirm the club, so the two inputs genuinely differ', () => {
    expect(
      countConfirmedDistinguishedClubs([clubRow], priorJuneClose, '2025-2026')
    ).toBe(1)
  })
})
