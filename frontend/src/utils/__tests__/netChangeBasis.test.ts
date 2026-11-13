import { describe, it, expect } from 'vitest'
import {
  PROGRAM_YEAR_START_BASIS,
  PROGRAM_YEAR_START_BASIS_TITLE,
  sinceSnapshotBasis,
} from '../netChangeBasis'

describe('netChangeBasis (#2712)', () => {
  it('never claims a July 1 count we cannot prove', () => {
    expect(PROGRAM_YEAR_START_BASIS).not.toMatch(/july|jul 1|1 jul/i)
    expect(PROGRAM_YEAR_START_BASIS_TITLE).not.toMatch(/july|jul 1|1 jul/i)
  })

  it('names a snapshot basis by its date', () => {
    expect(sinceSnapshotBasis('Jul 23')).toBe('since Jul 23')
  })
})
