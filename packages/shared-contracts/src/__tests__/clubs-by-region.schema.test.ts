import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  CLUBS_BY_REGION_DIR,
  CLUBS_BY_REGION_SHARD_FORMAT,
  CLUBS_BY_REGION_WORLD_FILE_NAME,
  CLUBS_BY_REGION_WORLD_FORMAT,
  ClubsByRegionClubSchema,
  ClubsByRegionShardSchema,
  ClubsByRegionWorldSchema,
  clubsByRegionShardFileName,
  type ClubsByRegionShard,
  type ClubsByRegionWorld,
} from '../index.js'

/**
 * #1800 (epic #1781) — `snapshots/{date}/clubs-by-region/<region>.json`, one
 * shard per region with every club the region and world explorers (#1808,
 * #1809) draw or list, plus `clubs-by-region/world.json`: per-region counts,
 * the top-N seed lists and one map point per located club.
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
) as { world: ClubsByRegionWorld; shards: Record<string, ClubsByRegionShard> }

const shard = (key: string) => structuredClone(RECORDED.shards[key]!)

describe('ClubsByRegion schemas (#1800)', () => {
  it('parses the recorded world file and every recorded shard unchanged', () => {
    expect(ClubsByRegionWorldSchema.parse(RECORDED.world)).toEqual(
      RECORDED.world
    )
    expect(RECORDED.world._format).toEqual(CLUBS_BY_REGION_WORLD_FORMAT)
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
    const bad = structuredClone(RECORDED.world)
    ;(bad.points as unknown[]).push(['1', 1, 2, '61'])
    expect(ClubsByRegionWorldSchema.safeParse(bad).success).toBe(false)
  })
})
