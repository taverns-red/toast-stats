import { describe, it, expect } from 'vitest'
import {
  CLUB_STRENGTH_LAST_PROGRAM_YEAR_START,
  isClubStrengthAwardShown,
} from '../clubStrengthAward'

// #2907 — one cut-off for the retired Club Strength Award.
describe('isClubStrengthAwardShown (#2907)', () => {
  it('last program year shown starts in 2024', () => {
    expect(CLUB_STRENGTH_LAST_PROGRAM_YEAR_START).toBe(2024)
  })

  it.each(['2019-2020', '2023-2024', '2024-2025'])('shows %s', py => {
    expect(isClubStrengthAwardShown(py)).toBe(true)
  })

  it.each(['2025-2026', '2026-2027', '2030-2031'])('hides %s', py => {
    expect(isClubStrengthAwardShown(py)).toBe(false)
  })

  it('hides a label it cannot read rather than guessing', () => {
    expect(isClubStrengthAwardShown('')).toBe(false)
    expect(isClubStrengthAwardShown('current')).toBe(false)
  })
})
