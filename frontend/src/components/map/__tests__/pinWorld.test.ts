/**
 * World territory modes (#1809): Region and District over every club.
 *
 * The region map's district mode colours by club-to-club adjacency, which is
 * quadratic in clubs — fine for a region's ~1k, minutes for the world's
 * ~15k. At world scale the neighbours are found between territory centroids
 * instead (a few hundred keys), so the mode builds in milliseconds.
 */
import { describe, expect, it } from 'vitest'
import { ClubsByRegionShardSchema } from '@taverns-red/shared-contracts'
import recorded from '../../../../../packages/shared-contracts/src/__tests__/__fixtures__/recorded-clubs-by-region.json'
import type { RegionClub } from '../../../utils/regionClubs'
import { mergeWorldShards } from '../../../utils/worldClubs'
import { CATEGORICAL12, legendChips, SUSPENDED } from '../pinModes'
import {
  assignCentroidColours,
  worldDistrictModel,
  worldRegionModel,
} from '../pinWorld'

const shards = (['01', '05', '12', 'unassigned'] as const).map(k =>
  ClubsByRegionShardSchema.parse(
    (recorded.shards as Record<string, unknown>)[k]
  )
)
const all = mergeWorldShards(shards)

describe('worldRegionModel', () => {
  const model = worldRegionModel(all)

  it('has one category per region, unassigned last, coded with its number', () => {
    expect(model.mode).toBe('region')
    expect(model.kind).toBe('categorical')
    const named = model.categories.filter(c => c.key !== SUSPENDED.key)
    expect(named.map(c => [c.key, c.label, c.code])).toEqual([
      ['01', 'Region 01', '01'],
      ['05', 'Region 05', '05'],
      ['12', 'Region 12', '12'],
      ['unassigned', 'Unassigned', ''],
    ])
    for (const c of named) expect(CATEGORICAL12).toContain(c.fill)
    expect(new Set(named.map(c => c.fill)).size).toBe(named.length)
  })

  it('puts each club in its region and writes ?region=', () => {
    const chips = legendChips(model, all)
    const byKey = Object.fromEntries(chips.map(c => [c.key, c.count]))
    expect(byKey['05']).toBe(161)
    expect(byKey['01']).toBe(66)
    expect(model.facet?.param).toBe('region')
    expect(model.facet?.valueOf(chips[0]!)).toBe(chips[0]!.key)
  })
})

describe('worldDistrictModel', () => {
  it('has one category per district and writes ?district=', () => {
    const model = worldDistrictModel(all)
    const named = model.categories.filter(c => c.key !== SUSPENDED.key)
    expect(named.map(c => c.label)).toContain('District 61')
    expect(model.facet?.param).toBe('district')
  })
})

describe('assignCentroidColours', () => {
  /** A synthetic world: `keys` territories of `per` clubs on a grid. */
  function grid(keys: number, per: number): RegionClub[] {
    const out: RegionClub[] = []
    for (let k = 0; k < keys; k++) {
      const lat = -60 + (k % 12) * 10
      const lng = -170 + Math.floor(k / 12) * 25
      for (let i = 0; i < per; i++)
        out.push({
          clubId: `${k}-${i}`,
          districtId: String(k),
          coordinates: { lat: lat + (i % 7) * 0.1, lng: lng + (i % 5) * 0.1 },
        } as RegionClub)
    }
    return out
  }

  it('gives touching territories different colours', () => {
    const clubs = grid(30, 4)
    const colours = assignCentroidColours(clubs, c => c.districtId)
    // Territory 0 and 1 sit 10° apart on the same meridian: neighbours.
    expect(colours.get('0')).not.toBe(colours.get('1'))
    for (const fill of colours.values()) expect(CATEGORICAL12).toContain(fill)
  })

  it('builds for ~15k clubs in 130 districts well inside a frame budget', () => {
    const clubs = grid(130, 116) // 15,080 clubs
    const t0 = performance.now()
    const colours = assignCentroidColours(clubs, c => c.districtId)
    const ms = performance.now() - t0
    expect(colours.size).toBe(130)
    // Linear in clubs; the quadratic club-to-club rule takes minutes here.
    expect(ms).toBeLessThan(250)
  })
})
