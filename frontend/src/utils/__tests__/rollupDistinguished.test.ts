/* #2580: the pipeline's confirmed / qualifying-today pair per level, read
 * from region-rollups.json. Absent is not zero. */
import { describe, it, expect } from 'vitest'
import type { RegionRollups } from '@taverns-red/shared-contracts'
import {
  districtProvisionalMap,
  regionDistinguishedCounts,
  worldDistinguishedCounts,
} from '../rollupDistinguished'

const tier = { confirmed: 0, provisional: 0 }
const counts = (confirmed: number, provisional: number) => ({
  confirmed,
  provisional,
  byTier: {
    distinguished: { confirmed, provisional },
    select: tier,
    presidents: tier,
    smedley: tier,
  },
})

const rollups = {
  world: { distinguishedCounts: counts(109, 757) },
  regions: {
    '05': { distinguishedCounts: counts(12, 40) },
    '06': {},
  },
  districts: {
    '61': { distinguishedCounts: counts(3, 6) },
    '57': { distinguishedCounts: counts(0, 0) },
    '99': {},
    U: { distinguishedCounts: null },
  },
} as unknown as RegionRollups

describe('rollupDistinguished (#2580)', () => {
  it('reads the world pair', () => {
    expect(worldDistinguishedCounts(rollups)).toEqual({
      confirmed: 109,
      provisional: 757,
    })
  })

  it('reads a region pair, and null when absent', () => {
    expect(regionDistinguishedCounts(rollups, '05')).toEqual({
      confirmed: 12,
      provisional: 40,
    })
    expect(regionDistinguishedCounts(rollups, '06')).toBeNull()
    expect(regionDistinguishedCounts(rollups, '77')).toBeNull()
  })

  it('maps district id to provisional, leaving out districts with no figure', () => {
    const m = districtProvisionalMap(rollups)
    expect(m.get('61')).toBe(6)
    expect(m.get('57')).toBe(0)
    expect(m.has('99')).toBe(false)
    expect(m.has('U')).toBe(false)
  })

  it('reads an explicit null world or region as no figure, not zero (#2563)', () => {
    const nulled = {
      world: { distinguishedCounts: null },
      regions: { '05': { distinguishedCounts: null } },
      districts: {},
    } as unknown as RegionRollups
    expect(worldDistinguishedCounts(nulled)).toBeNull()
    expect(regionDistinguishedCounts(nulled, '05')).toBeNull()
  })

  it('returns nothing without a file', () => {
    expect(worldDistinguishedCounts(null)).toBeNull()
    expect(regionDistinguishedCounts(undefined, '05')).toBeNull()
    expect(districtProvisionalMap(null).size).toBe(0)
  })
})
