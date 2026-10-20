/**
 * Region club explorer (#1808) — the pure layer over a clubs-by-region shard
 * (#1800, PR #2124). Fixture: the recorded `clubs-by-region` files from the
 * staging bucket, 2026-10-16 (Region 05 = District 61, 161 clubs, 2 of them
 * without coordinates).
 */
import { describe, it, expect } from 'vitest'
import { ClubsByRegionShardSchema } from '@taverns-red/shared-contracts'
import recorded from '../../../../packages/shared-contracts/src/__tests__/__fixtures__/recorded-clubs-by-region.json'
import { buildModeModel } from '../../components/map/pinModes'
import { buildPinFeatures } from '../../components/map/pinLayer'
import { applyRegionExtendedFacets } from '../../components/map/regionModels'
import {
  REGION_METRICS,
  applyRegionFilters,
  parseRegionMetric,
  regionClubMetric,
  regionSummary,
  searchRegionClubs,
  sortRegionClubs,
  toRegionClubs,
  wantsExtendedFilters,
} from '../regionClubs'

const shard05 = ClubsByRegionShardSchema.parse(recorded.shards['05'])
const shard01 = ClubsByRegionShardSchema.parse(recorded.shards['01'])
const clubs = toRegionClubs(shard05)

describe('toRegionClubs', () => {
  it('maps every shard row onto the club shape the map stack reads', () => {
    expect(clubs).toHaveLength(161)
    const sainteFoy = clubs.find(c => c.clubId === '5097')!
    expect(sainteFoy).toMatchObject({
      clubName: 'Club Toastmasters de Sainte-Foy',
      districtId: '61',
      divisionId: 'I',
      areaId: '92',
      currentStatus: 'thriving',
      distinguishedLevel: 'Distinguished',
      isProvisionallyDistinguished: false,
      clubStatus: 'Active',
      membershipBase: 57,
      coordinates: { lat: 46.83998, lng: -71.28312 },
    })
    // One-point trends at the shard's own (logical) date.
    expect(sainteFoy.membershipTrend).toEqual([
      { date: '2026-10-16', count: 54 },
    ])
    expect(sainteFoy.dcpGoalsTrend).toEqual([
      { date: '2026-10-16', goalsAchieved: 6 },
    ])
  })

  // #2153 — Find-A-Club's ungeocoded sentinel is exactly (0, 0). Older
  // shards still carry it, so the ingest and the pin layer both drop it.
  it('treats a (0, 0) row as unmapped, never a null-island pin (#2153)', () => {
    const row = shard01.clubs.find(c => c.id === '7787643')!
    const [club] = toRegionClubs({
      ...shard01,
      clubs: [{ ...row, lat: 0, lng: 0 }],
    })
    expect(club!.coordinates).toBeUndefined()
    const located = clubs.find(c => c.coordinates)!
    const pins = buildPinFeatures(
      [located, { ...located, clubId: 'x', coordinates: { lat: 0, lng: 0 } }],
      buildModeModel('health')
    )
    expect(pins.features).toHaveLength(1)
  })

  it('keeps a club without coordinates as a row, off the map', () => {
    const genetec = clubs.find(c => c.clubId === '28678752')!
    expect(genetec.coordinates).toBeUndefined()
    const pins = buildPinFeatures(clubs, buildModeModel('health'))
    expect(pins.features).toHaveLength(159)
  })

  // #2175 — a located online-only club keeps its row but gets no pin.
  it('gives a flagged online-only club a row and no pin (#2174, #2175)', () => {
    const online = toRegionClubs({
      ...shard05,
      clubs: shard05.clubs.map(c =>
        c.id === '5097' ? { ...c, meetsOnline: true as const } : c
      ),
    })
    const sainteFoy = online.find(c => c.clubId === '5097')!
    expect(sainteFoy.coordinates).toBeDefined()
    expect(sainteFoy.meetsOnline).toBe(true)
    const pins = buildPinFeatures(online, buildModeModel('health'))
    expect(pins.features).toHaveLength(158)
    expect(pins.features.map(f => f.properties.id)).not.toContain('5097')
  })

  it('colours by the shared health classification (#1120)', () => {
    const model = buildModeModel('health')
    const counts = { t: 0, v: 0, i: 0 }
    for (const c of clubs) {
      const k = model.categoryOf(c).key
      if (k === 'thriving') counts.t++
      if (k === 'vulnerable') counts.v++
      if (k === 'intervention-required') counts.i++
    }
    // = world.json shards["05"].health
    expect(counts).toEqual({ t: 31, v: 48, i: 82 })
  })
})

describe('regionSummary', () => {
  it('counts clubs, members and intervention-required clubs', () => {
    expect(regionSummary(clubs)).toEqual({
      clubs: 161,
      members: 2229,
      interventionRequired: 82,
    })
  })
})

describe('parseRegionMetric', () => {
  it('defaults to membership and whitelists the rest', () => {
    expect(parseRegionMetric(null)).toBe('membership')
    expect(parseRegionMetric('netGrowth')).toBe('netGrowth')
    expect(parseRegionMetric('dcpGoals')).toBe('dcpGoals')
    expect(parseRegionMetric('<script>')).toBe('membership')
    expect(REGION_METRICS.map(m => m.id)).toEqual([
      'membership',
      'netGrowth',
      'dcpGoals',
    ])
  })
})

describe('sortRegionClubs', () => {
  const ids = (metric: Parameters<typeof sortRegionClubs>[1]) =>
    sortRegionClubs(clubs, metric)
      .slice(0, 3)
      .map(c => `${c.clubId}:${regionClubMetric(c, metric)}`)

  it('ranks highest first by the selected metric, ties by club id', () => {
    expect(ids('membership')).toEqual(['5097:54', '9750:39', '6207:38'])
    expect(ids('netGrowth')).toEqual(['28678752:6', '28680300:6', '7258:4'])
    expect(ids('dcpGoals')).toEqual(['4544358:7', '5097:6', '5842:6'])
  })

  it('agrees with the pipeline’s own top-50 seed for a single-region scope', () => {
    // world.json's top list spans every region; its Region 05 rows must sit
    // in the same order as the explorer ranks them.
    const seed = recorded.world.top.membership
      .filter(c => c.region === '05')
      .map(c => c.id)
    const ours = sortRegionClubs(clubs, 'membership')
      .slice(0, seed.length)
      .map(c => c.clubId)
    expect(ours).toEqual(seed)
  })
})

describe('searchRegionClubs', () => {
  it('matches the club name, ignoring case and accents', () => {
    expect(searchRegionClubs(clubs, 'ottawa')).toHaveLength(13)
    expect(searchRegionClubs(clubs, 'SAINTE-FOY').map(c => c.clubId)).toContain(
      '5097'
    )
    expect(searchRegionClubs(clubs, 'quebec')).toEqual(
      searchRegionClubs(clubs, 'québec')
    )
  })

  it('matches the club number, with or without leading zeros', () => {
    expect(searchRegionClubs(clubs, '5097').map(c => c.clubId)).toEqual([
      '5097',
    ])
    expect(searchRegionClubs(clubs, '00005097').map(c => c.clubId)).toEqual([
      '5097',
    ])
  })

  it('is the whole list for an empty query', () => {
    expect(searchRegionClubs(clubs, '  ')).toHaveLength(161)
  })
})

describe('applyRegionFilters', () => {
  // Region 05 has one district in the fixture; two real shards together
  // stand in for a multi-district region.
  const two = [...clubs, ...toRegionClubs(shard01)]

  it('filters by district, health status and size band from the URL', () => {
    expect(
      applyRegionFilters(two, new URLSearchParams('district=49'))
    ).toHaveLength(66)
    expect(
      applyRegionFilters(clubs, new URLSearchParams('status=intervention'))
    ).toHaveLength(82)
    const big = applyRegionFilters(
      clubs,
      new URLSearchParams('size=30plus'),
      applyRegionExtendedFacets
    )
    expect(big.length).toBeGreaterThan(0)
    expect(big.every(c => c.membershipTrend[0]!.count >= 30)).toBe(true)
  })

  it('says when a URL needs the on-demand filter chunk', () => {
    expect(wantsExtendedFilters(new URLSearchParams('size=30plus'))).toBe(true)
    expect(wantsExtendedFilters(new URLSearchParams('status=thriving'))).toBe(
      false
    )
  })

  it('ANDs across keys and ORs within one', () => {
    const p = new URLSearchParams('district=61,49&status=thriving')
    const out = applyRegionFilters(two, p)
    expect(out).toHaveLength(31 + 5)
    expect(out.every(c => c.currentStatus === 'thriving')).toBe(true)
  })
})
