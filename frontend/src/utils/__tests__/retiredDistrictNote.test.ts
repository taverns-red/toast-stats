import { describe, it, expect } from 'vitest'
import { retiredDistrictNote } from '../retiredDistrictNote'

describe('retiredDistrictNote', () => {
  it('prints a July 1 retirement as Ron wrote it', () => {
    expect(retiredDistrictNote('124', '2026-07-01')).toBe(
      'District 124 was retired on July 1, 2026.'
    )
  })

  it('prints the row’s own date, whatever the day', () => {
    expect(retiredDistrictNote('09', '2025-03-15')).toBe(
      'District 09 was retired on March 15, 2025.'
    )
  })
})
