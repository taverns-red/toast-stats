import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  CLUBS_BY_REGION_DIR,
  CLUBS_BY_REGION_SHARD_FORMAT,
  CLUBS_BY_REGION_WORLD_FILE_NAME,
  CLUBS_BY_REGION_WORLD_FORMAT,
  CLUBS_BY_REGION_WORLD_POINTS_FILE_NAME,
  CLUBS_BY_REGION_WORLD_POINTS_FORMAT,
  ClubsByRegionClubSchema,
  ClubsByRegionShardSchema,
  ClubsByRegionWorldPointsSchema,
  ClubsByRegionWorldSchema,
  clubsByRegionShardFileName,
  type ClubsByRegionShard,
  type ClubsByRegionWorld,
  type ClubsByRegionWorldPoints,
} from '../index.js'

/**
 * #1800 (epic #1781) — `snapshots/{date}/clubs-by-region/<region>.json`, one
 * shard per region with every club the region and world explorers (#1808,
 * #1809) draw or list; `clubs-by-region/world.json`, the small summary
 * (per-region counts and the top-N seed rows) the world list renders first;
 * and `clubs-by-region/world-points.json`, one map point per located club,
 * loaded lazily by the clustered map.
 *
 * The fixture is the builder's own output over recorded staging inputs
 * (`packages/analytics-core/src/rollup/__tests__/fixtures/clubs-by-region/`,
 * the 2026-10-16 daily), not a hand-written shape.
 */
const RECORDED = JSON.parse(
  readFileSync(
    new URL('./__fixtures__/recorded-clubs-by-region.json', import.meta.url),
    'utf-8'
  )
) as {
  world: ClubsByRegionWorld
  worldPoints: ClubsByRegionWorldPoints
  shards: Record<string, ClubsByRegionShard>
}

const shard = (key: string) => structuredClone(RECORDED.shards[key]!)

describe('ClubsByRegion schemas (#1800)', () => {
  it('parses the recorded world file and every recorded shard unchanged', () => {
    expect(ClubsByRegionWorldSchema.parse(RECORDED.world)).toEqual(
      RECORDED.world
    )
    expect(RECORDED.world._format).toEqual(CLUBS_BY_REGION_WORLD_FORMAT)
    expect(ClubsByRegionWorldPointsSchema.parse(RECORDED.worldPoints)).toEqual(
      RECORDED.worldPoints
    )
    expect(RECORDED.worldPoints._format).toEqual(
      CLUBS_BY_REGION_WORLD_POINTS_FORMAT
    )
    expect(Object.keys(RECORDED.shards).sort()).toEqual([
      '01',
      '05',
      '12',
      'unassigned',
    ])
    for (const s of Object.values(RECORDED.shards)) {
      expect(ClubsByRegionShardSchema.parse(s)).toEqual(s)
      expect(s._format).toEqual(CLUBS_BY_REGION_SHARD_FORMAT)
    }
  })

  it('names the files under one directory per date', () => {
    expect(CLUBS_BY_REGION_DIR).toBe('clubs-by-region')
    expect(CLUBS_BY_REGION_WORLD_FILE_NAME).toBe('world.json')
    expect(CLUBS_BY_REGION_WORLD_POINTS_FILE_NAME).toBe('world-points.json')
    expect(RECORDED.world.pointsPath).toBe('clubs-by-region/world-points.json')
    expect(clubsByRegionShardFileName('05')).toBe('05.json')
    expect(RECORDED.world.shards!['05']!.path).toBe('clubs-by-region/05.json')
  })

  it('keeps a club without coordinates as a row with null lat/lng, never dropped', () => {
    const unmapped = RECORDED.shards['05']!.clubs.filter(c => c.lat === null)
    expect(unmapped.length).toBe(RECORDED.shards['05']!.counts.unmapped)
    expect(unmapped.length).toBeGreaterThan(0)
    expect(unmapped.every(c => c.lng === null)).toBe(true)
  })

  it('rejects a contact field on a club row: explorers never get email, phone or links', () => {
    for (const extra of [
      { email: 'a@b.c' },
      { phone: '555' },
      { website: 'https://x' },
      { meetingDay: 'Tuesday' },
    ]) {
      const bad = shard('05')
      Object.assign(bad.clubs[0]!, extra)
      expect(ClubsByRegionShardSchema.safeParse(bad).success).toBe(false)
    }
  })

  it('rejects half a coordinate pair and an out-of-range latitude', () => {
    const row = shard('05').clubs.find(c => c.lat !== null)!
    expect(
      ClubsByRegionClubSchema.safeParse({ ...row, lng: null }).success
    ).toBe(false)
    expect(ClubsByRegionClubSchema.safeParse({ ...row, lat: 91 }).success).toBe(
      false
    )
  })

  it('rejects a health code outside the shared rule', () => {
    const bad = shard('05')
    ;(bad.clubs[0] as { h: string }).h = 'healthy'
    expect(ClubsByRegionShardSchema.safeParse(bad).success).toBe(false)
  })

  it('accepts meetsOnline: true on a row and nothing else (#1809, #2175)', () => {
    // The world explorer hides online-only clubs' pins (#2174); shards
    // written before the flag lands carry no key, so it stays optional.
    const row = shard('05').clubs[0]!
    expect(
      ClubsByRegionClubSchema.safeParse({ ...row, meetsOnline: true }).success
    ).toBe(true)
    expect(
      ClubsByRegionClubSchema.safeParse({ ...row, meetsOnline: false }).success
    ).toBe(false)
    expect(ClubsByRegionClubSchema.safeParse(row).success).toBe(true)
  })

  it('rejects a program year that is not YYYY-YYYY', () => {
    const bad = shard('05')
    bad.programYear = '2026-27'
    expect(ClubsByRegionShardSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a shard with no districts', () => {
    const bad = shard('05')
    bad.districtIds = []
    expect(ClubsByRegionShardSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a world map point that is not [id, lat, lng, district, health]', () => {
    const bad = structuredClone(RECORDED.worldPoints)
    ;(bad.points as unknown[]).push(['1', 1, 2, '61'])
    expect(ClubsByRegionWorldPointsSchema.safeParse(bad).success).toBe(false)
  })

  it('keeps the map points out of world.json: the list renders before the map loads', () => {
    const bad = structuredClone(RECORDED.world) as unknown as Record<
      string,
      unknown
    >
    bad['points'] = RECORDED.worldPoints.points
    expect(ClubsByRegionWorldSchema.safeParse(bad).success).toBe(false)
  })
})
