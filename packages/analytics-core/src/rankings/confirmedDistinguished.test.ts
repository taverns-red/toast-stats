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
