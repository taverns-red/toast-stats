/**
 * Zod contract for the district club shards (#1901, mobile epic #1827).
 *
 * The club page renders one club, but it read `district_<id>_analytics.json`
 * to get it: 3.65 MB decoded for District 61 on 2026-10-12, ~155 KB gzip on
 * the wire, and growing with every day of the program year (each club carries
 * a daily membership and DCP-goal trend). The shards split that file's
 * `allClubs` by the last digit of the club id, so the page reads ~10 % of the
 * district's clubs: ≤ 120 KB decoded / ≤ 9 KB gzip for D61.
 *
 * - Path: `snapshots/<date>/analytics/district_<id>_clubs_<D>.json`, D = 0-9
 *   (`districtClubShardPath`). Written by collector-cli compute-analytics next
 *   to the analytics file, from the same `allClubs` array, so a shard is never
 *   newer or older than its district file.
 * - All ten shards are written for every district that has an analytics
 *   file, empty ones included. A reader treats a missing shard as "not built
 *   for this date" and falls back to the district file; it never reads a
 *   missing shard as "the club is not in this district".
 * - Each club is the analytics file's `ClubTrend` unchanged (passthrough), so
 *   the reader's type is the same one it already uses.
 *
 * @module district-club-shard.schema
 */

import { z } from 'zod'
import { normalizeClubId } from '../naming/clubId.js'

export const DISTRICT_CLUB_SHARD_VERSION = '1.0.0'

/** The ten shard keys, in order. */
export const DISTRICT_CLUB_SHARD_KEYS = [
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
] as const

export type DistrictClubShardKey = (typeof DISTRICT_CLUB_SHARD_KEYS)[number]

const ShardKey = z.enum(DISTRICT_CLUB_SHARD_KEYS)

/**
 * The shard holding a club: the last digit of its canonical id. Padding and
 * CSV debris do not move a club between shards ("00003045", "'3045" → "5").
 * Null when the id has no digit. Writer, gate and reader share this function.
 */
export function districtClubShardKey(
  clubId: unknown
): DistrictClubShardKey | null {
  const digits = normalizeClubId(clubId).replace(/\D/g, '')
  if (digits === '') return null
  return digits.slice(-1) as DistrictClubShardKey
}

/** Object path of one shard, relative to the bucket root. */
export function districtClubShardPath(
  snapshotDate: string,
  districtId: string,
  shard: DistrictClubShardKey
): string {
  return `snapshots/${snapshotDate}/analytics/district_${districtId}_clubs_${shard}.json`
}

const SHARD_PATH =
  /^snapshots\/(\d{4}-\d{2}-\d{2})\/analytics\/district_([A-Za-z0-9]+)_clubs_(\d)\.json$/

/** Inverse of `districtClubShardPath`; null for any other path. */
export function parseDistrictClubShardPath(path: string): {
  snapshotDate: string
  districtId: string
  shard: DistrictClubShardKey
} | null {
  const m = SHARD_PATH.exec(path)
  if (!m) return null
  return {
    snapshotDate: m[1]!,
    districtId: m[2]!,
    shard: m[3] as DistrictClubShardKey,
  }
}

const TrendPoint = z.object({ date: z.string() }).passthrough()

/**
 * The fields the club page cannot render without. Everything else on the
 * analytics `ClubTrend` is kept as-is (passthrough).
 */
export const DistrictClubShardClubSchema = z
  .object({
    clubId: z.string().min(1),
    clubName: z.string(),
    membershipTrend: z.array(
      TrendPoint.extend({ count: z.number() }).passthrough()
    ),
    dcpGoalsTrend: z.array(
      TrendPoint.extend({ goalsAchieved: z.number() }).passthrough()
    ),
    currentStatus: z.string(),
    distinguishedLevel: z.string(),
  })
  .passthrough()

export const DistrictClubShardSchema = z.object({
  _format: z.object({
    version: z.string(),
    type: z.literal('district-club-shard'),
  }),
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  districtId: z.string().min(1),
  shard: ShardKey,
  shardCount: z.literal(DISTRICT_CLUB_SHARD_KEYS.length),
  clubs: z.array(DistrictClubShardClubSchema),
})

export type DistrictClubShardClub = z.infer<typeof DistrictClubShardClubSchema>
export type DistrictClubShard = z.infer<typeof DistrictClubShardSchema>
