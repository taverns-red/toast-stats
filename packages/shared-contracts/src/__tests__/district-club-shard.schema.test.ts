/**
 * District club shards (#1901): `snapshots/<date>/analytics/
 * district_<id>_clubs_<D>.json`, one per last club-id digit, so the club page reads
 * ~10 clubs instead of the whole district analytics file.
 */
import { describe, it, expect } from 'vitest'
import {
  DISTRICT_CLUB_SHARD_KEYS,
  DistrictClubShardSchema,
  districtClubShardKey,
  districtClubShardPath,
  parseDistrictClubShardPath,
} from '../index.js'

const club = (clubId: string) => ({
  clubId,
  clubName: `Club ${clubId}`,
  divisionId: 'A',
  divisionName: 'Division A',
  areaId: '01',
  areaName: 'Area 01',
  membershipTrend: [{ date: '2026-10-12', count: 12 }],
  dcpGoalsTrend: [{ date: '2026-10-12', goalsAchieved: 3 }],
  currentStatus: 'thriving',
  riskFactors: [],
  distinguishedLevel: 'NotDistinguished',
  coordinates: { lat: 45.4, lng: -75.7 },
})

const shard = (over: Record<string, unknown> = {}) => ({
  _format: { version: '1.0.0', type: 'district-club-shard' },
  snapshotDate: '2026-10-12',
  districtId: '61',
  shard: '7',
  shardCount: 10,
  clubs: [club('7238597')],
  ...over,
})

describe('districtClubShardKey', () => {
  it('is the last digit of the canonical club id', () => {
    expect(districtClubShardKey('7238597')).toBe('7')
    expect(districtClubShardKey('3040')).toBe('0')
  })

  it('ignores padding and CSV debris, so every id form lands in one shard', () => {
    expect(districtClubShardKey('00003045')).toBe('5')
    expect(districtClubShardKey("'3045")).toBe('5')
    expect(districtClubShardKey(3045)).toBe('5')
  })

  it('returns null for an id with no digits', () => {
    expect(districtClubShardKey('')).toBeNull()
    expect(districtClubShardKey(undefined)).toBeNull()
    expect(districtClubShardKey('abc')).toBeNull()
  })

  it('has exactly ten keys, 0-9', () => {
    expect(DISTRICT_CLUB_SHARD_KEYS).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
    ])
  })
})

describe('districtClubShardPath / parseDistrictClubShardPath', () => {
  it('builds the per-date shard path', () => {
    expect(districtClubShardPath('2026-10-12', '61', '7')).toBe(
      'snapshots/2026-10-12/analytics/district_61_clubs_7.json'
    )
  })

  it('round-trips through the parser', () => {
    expect(
      parseDistrictClubShardPath(
        'snapshots/2026-10-12/analytics/district_U_clubs_0.json'
      )
    ).toEqual({ snapshotDate: '2026-10-12', districtId: 'U', shard: '0' })
  })

  it('rejects anything that is not a shard path', () => {
    for (const p of [
      'snapshots/2026-10-12/analytics/district_61_analytics.json',
      'snapshots/2026-10-12/analytics/district_61_clubs_10.json',
      'snapshots/2026-10-12/analytics/district_61_clubs_x.json',
      'snapshots/2026-10-12/analytics/clubs/district_61_7.json',
    ]) {
      expect(parseDistrictClubShardPath(p)).toBeNull()
    }
  })
})

describe('DistrictClubShardSchema', () => {
  it('accepts a real-shape shard and keeps every ClubTrend field', () => {
    const parsed = DistrictClubShardSchema.parse(shard())
    expect(parsed.clubs[0]).toEqual(club('7238597'))
  })

  it('accepts an empty shard (a small district may have no club ending in 4)', () => {
    expect(
      DistrictClubShardSchema.safeParse(shard({ clubs: [] })).success
    ).toBe(true)
  })

  it('rejects a shard key outside 0-9 and a wrong shard count', () => {
    expect(
      DistrictClubShardSchema.safeParse(shard({ shard: '10' })).success
    ).toBe(false)
    expect(
      DistrictClubShardSchema.safeParse(shard({ shardCount: 8 })).success
    ).toBe(false)
  })

  it('rejects a club without its trends', () => {
    const { membershipTrend: _m, ...noTrend } = club('7238597')
    expect(
      DistrictClubShardSchema.safeParse(shard({ clubs: [noTrend] })).success
    ).toBe(false)
  })
})
