/**
 * The world club explorer's pure layer (#1809) over the clubs-by-region
 * files (#1800): world.json first (summary + top-50 seed rows), then the
 * region shards, fetched in parallel, only when the page needs every club.
 *
 * Fixture: the builder's own output over the recorded staging 2026-10-16
 * daily — world.json plus the 01, 05, 12 and unassigned shards.
 */
import { describe, expect, it } from 'vitest'
import {
  ClubsByRegionShardSchema,
  ClubsByRegionWorldSchema,
} from '@taverns-red/shared-contracts'
import recorded from '../../../../packages/shared-contracts/src/__tests__/__fixtures__/recorded-clubs-by-region.json'
import { toRegionClubs } from '../regionClubs'
import {
  activeWorldFilterCount,
  applyWorldFilters,
  mergeWorldShards,
  needsWorldShards,
  onlineOnlyClubs,
  worldRegionLabel,
  worldShardKeys,
  worldSummary,
  worldTopClubs,
} from '../worldClubs'

const world = ClubsByRegionWorldSchema.parse(recorded.world)
const shard = (k: string) =>
  ClubsByRegionShardSchema.parse(
    (recorded.shards as Record<string, unknown>)[k]
  )
const params = (qs = '') => new URLSearchParams(qs)

describe('worldShardKeys', () => {
  it('lists every shard of the date, regions in order, unassigned last', () => {
    expect(worldShardKeys(world, params())).toEqual([
      '01',
      '05',
      '12',
      'unassigned',
    ])
  })

  it('fetches only the regions ?region= names (on demand)', () => {
    expect(worldShardKeys(world, params('region=05,12'))).toEqual(['05', '12'])
  })

  it('ignores a ?region= value the date has no shard for', () => {
    expect(worldShardKeys(world, params('region=05,99,..%2Fx'))).toEqual(['05'])
  })

  it('is empty without a world file or without shards', () => {
    expect(worldShardKeys(null, params())).toEqual([])
    expect(worldShardKeys({ ...world, shards: null }, params())).toEqual([])
  })
})

describe('worldSummary', () => {
  it('reads the totals from world.json, no shard needed', () => {
    const intervention = Object.values(world.shards!).reduce(
      (n, e) => n + e.health.interventionRequired,
      0
    )
    expect(worldSummary(world, params())).toEqual({
      clubs: 318,
      districts: 4,
      interventionRequired: intervention,
    })
  })

  it('narrows to the ?region= shards’ own counts', () => {
    const e = world.shards!['05']!
    expect(worldSummary(world, params('region=05'))).toEqual({
      clubs: e.clubs,
      districts: e.districtIds.length,
      interventionRequired: e.health.interventionRequired,
    })
  })
})

describe('worldTopClubs', () => {
  it('maps the seed rows in the pipeline’s order, at most 50', () => {
    const top = worldTopClubs(world, 'membership')
    expect(top).toHaveLength(50)
    expect(top[0]!.clubId).toBe(world.top.membership[0]!.id)
    expect(top[0]!.districtId).toBe(world.top.membership[0]!.d)
    expect(top.map(c => c.clubId)).toEqual(world.top.membership.map(c => c.id))
  })

  it('has a seed for each metric', () => {
    expect(worldTopClubs(world, 'dcpGoals')[0]!.clubId).toBe(
      world.top.dcpGoals[0]!.id
    )
    expect(worldTopClubs(null, 'netGrowth')).toEqual([])
  })
})

describe('mergeWorldShards', () => {
  it('joins the loaded shards and skips the ones not loaded', () => {
    const clubs = mergeWorldShards([shard('05'), undefined, shard('01'), null])
    expect(clubs).toHaveLength(161 + 66)
    expect(clubs.every(c => c.regionId === '05' || c.regionId === '01')).toBe(
      true
    )
  })

  it('keeps a club once if two shards list it', () => {
    const s = shard('05')
    expect(mergeWorldShards([s, s])).toHaveLength(161)
  })
})

describe('row adapter (#2174 via #2175)', () => {
  it('carries the region and the online-only flag', () => {
    const s = shard('05')
    s.clubs[0] = { ...s.clubs[0]!, meetsOnline: true }
    const [first, second] = toRegionClubs(s)
    expect(first!.regionId).toBe('05')
    expect(first!.meetsOnline).toBe(true)
    expect(second!.meetsOnline).toBeUndefined()
  })

  it('files a club the history does not place under unassigned', () => {
    expect(toRegionClubs(shard('unassigned'))[0]!.regionId).toBe('unassigned')
  })
})

describe('onlineOnlyClubs', () => {
  it('picks the clubs with no pin because they meet online only', () => {
    const s = shard('05')
    s.clubs[3] = { ...s.clubs[3]!, meetsOnline: true }
    expect(onlineOnlyClubs(toRegionClubs(s)).map(c => c.clubId)).toEqual([
      s.clubs[3]!.id,
    ])
  })
})

describe('applyWorldFilters', () => {
  const all = mergeWorldShards([shard('01'), shard('05'), shard('12')])

  it('filters by region, AND with the region explorer’s keys', () => {
    const r05 = applyWorldFilters(all, params('region=05'))
    expect(r05).toHaveLength(161)
    const r05i = applyWorldFilters(all, params('region=05&status=intervention'))
    expect(r05i.length).toBe(world.shards!['05']!.health.interventionRequired)
  })

  it('counts region as one of the Filters', () => {
    expect(activeWorldFilterCount(params('region=05&district=61'))).toBe(2)
    expect(activeWorldFilterCount(params('q=x&sort=dcpGoals'))).toBe(0)
  })
})

describe('needsWorldShards', () => {
  const base = { query: '', mapOpen: false, isPhone: true, lazyMode: false }

  it('a phone list with no filters renders from world.json alone', () => {
    expect(
      needsWorldShards({ ...base, params: params('sort=netGrowth') })
    ).toBe(false)
  })

  it('the map, a search, a filter or a territory mode needs the clubs', () => {
    expect(
      needsWorldShards({ ...base, params: params(), isPhone: false })
    ).toBe(true)
    expect(needsWorldShards({ ...base, params: params(), mapOpen: true })).toBe(
      true
    )
    expect(
      needsWorldShards({ ...base, params: params(), query: 'sainte' })
    ).toBe(true)
    expect(needsWorldShards({ ...base, params: params('region=05') })).toBe(
      true
    )
    expect(needsWorldShards({ ...base, params: params('growth=gain') })).toBe(
      true
    )
    expect(
      needsWorldShards({ ...base, params: params(), lazyMode: true })
    ).toBe(true)
  })
})

describe('worldRegionLabel', () => {
  it('names regions and the unassigned shard', () => {
    expect(worldRegionLabel('05')).toBe('Region 05')
    expect(worldRegionLabel('unassigned')).toBe('Unassigned')
  })
})
