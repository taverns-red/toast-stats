import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  DistinguishedCountsSchema,
  RegionRollupsReaderSchema,
  RegionRollupsSchema,
  type DistinguishedCounts,
  type RegionRollups,
} from '../index.js'

/**
 * #2553 (epic #2555): one `{ confirmed, provisional, byTier }` Distinguished
 * count per level. Confirmed is the headline; provisional is shown beside it
 * and never added in, so the two are disjoint sets of clubs.
 */

const COUNTS: DistinguishedCounts = {
  confirmed: 4,
  provisional: 3,
  byTier: {
    distinguished: { confirmed: 2, provisional: 1 },
    select: { confirmed: 1, provisional: 1 },
    presidents: { confirmed: 1, provisional: 0 },
    smedley: { confirmed: 0, provisional: 1 },
  },
}

/** The rollup as plain records, so a block can take the new key. */
type LooseRollups = {
  world: Record<string, unknown>
  regions: Record<string, Record<string, unknown>> | null
  districts: Record<string, Record<string, unknown>>
}

const RECORDED = JSON.parse(
  readFileSync(
    new URL('./__fixtures__/recorded-region-rollups.json', import.meta.url),
    'utf-8'
  )
) as RegionRollups

describe('DistinguishedCountsSchema (#2553)', () => {
  it('parses the shape unchanged', () => {
    expect(DistinguishedCountsSchema.parse(COUNTS)).toEqual(COUNTS)
  })

  it('rejects a total that is not the sum of its tiers', () => {
    const bad = structuredClone(COUNTS)
    bad.confirmed = 5
    expect(DistinguishedCountsSchema.safeParse(bad).success).toBe(false)
    const bad2 = structuredClone(COUNTS)
    bad2.provisional = 0
    expect(DistinguishedCountsSchema.safeParse(bad2).success).toBe(false)
  })

  it('rejects a negative or fractional count', () => {
    const bad = structuredClone(COUNTS)
    bad.byTier.select.confirmed = -1
    expect(DistinguishedCountsSchema.safeParse(bad).success).toBe(false)
    const frac = structuredClone(COUNTS)
    frac.byTier.select.provisional = 0.5
    expect(DistinguishedCountsSchema.safeParse(frac).success).toBe(false)
  })

  it('rejects a missing tier', () => {
    const bad = structuredClone(COUNTS) as unknown as {
      byTier: Record<string, unknown>
    }
    delete bad.byTier['smedley']
    expect(DistinguishedCountsSchema.safeParse(bad).success).toBe(false)
  })
})

describe('region-rollups distinguishedCounts — ADR 0019 expand (#2553)', () => {
  it('old output (no distinguishedCounts) still parses with the writer and reader', () => {
    expect(RegionRollupsSchema.safeParse(RECORDED).success).toBe(true)
    expect(RegionRollupsReaderSchema.safeParse(RECORDED).success).toBe(true)
  })

  it('new output carries distinguishedCounts on world, region and district blocks', () => {
    const next = structuredClone(RECORDED) as unknown as LooseRollups
    next.world.distinguishedCounts = COUNTS
    for (const region of Object.values(next.regions ?? {}))
      region.distinguishedCounts = COUNTS
    for (const district of Object.values(next.districts))
      district.distinguishedCounts = COUNTS
    const parsed = RegionRollupsSchema.parse(next) as unknown as LooseRollups
    expect(parsed.world.distinguishedCounts).toEqual(COUNTS)
    const read = RegionRollupsReaderSchema.parse(
      next
    ) as unknown as LooseRollups
    expect(read.districts['68']!.distinguishedCounts).toEqual(COUNTS)
  })

  it('null means the inputs were not collected, apart from a measured 0', () => {
    const next = structuredClone(RECORDED) as unknown as LooseRollups
    next.world.distinguishedCounts = null
    expect(RegionRollupsSchema.safeParse(next).success).toBe(true)
  })

  it('the existing `distinguished` block is untouched (expand only)', () => {
    expect(RECORDED.world.distinguished).toBeDefined()
    const next = structuredClone(RECORDED) as unknown as LooseRollups
    next.world.distinguishedCounts = COUNTS
    expect(RegionRollupsSchema.parse(next).world.distinguished).toEqual(
      RECORDED.world.distinguished
    )
  })
})
