import { describe, it, expect } from 'vitest'
import { countUnassignedDistricts, formatRegionCount } from '../regionCount'

/* #2653, decision D11: the site's region count names the districts that no
   region holds. */
describe('formatRegionCount (#2653)', () => {
  it('adds the districts not assigned', () => {
    expect(formatRegionCount(14, 3)).toBe(
      '14 regions + 3 districts not assigned'
    )
  })

  it('uses the singular for one district', () => {
    expect(formatRegionCount(14, 1)).toBe(
      '14 regions + 1 district not assigned'
    )
  })

  it('says just the regions when none is unassigned', () => {
    expect(formatRegionCount(14, 0)).toBe('14 regions')
  })

  it('takes both numbers from the caller, never a literal', () => {
    expect(formatRegionCount(2, 5)).toBe('2 regions + 5 districts not assigned')
    expect(formatRegionCount(1, 0)).toBe('1 region')
  })
})

describe('countUnassignedDistricts (#2653)', () => {
  it('counts rows whose region is not a number', () => {
    expect(
      countUnassignedDistricts([
        { region: '01' },
        { region: '14' },
        { region: 'DNAR' },
        { region: '' },
      ])
    ).toBe(2)
  })

  it('is zero when every district has a region', () => {
    expect(countUnassignedDistricts([{ region: '07' }])).toBe(0)
  })
})
