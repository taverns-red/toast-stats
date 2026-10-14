/**
 * District club shards (#1901) — stub for the red commit; the next commit
 * implements it.
 */
import { z } from 'zod'

export const DISTRICT_CLUB_SHARD_VERSION = '1.0.0'
export const DISTRICT_CLUB_SHARD_KEYS: readonly string[] = []
export type DistrictClubShardKey = string
export function districtClubShardKey(_clubId: unknown): string | null {
  return null
}
export function districtClubShardPath(
  _snapshotDate: string,
  _districtId: string,
  _shard: string
): string {
  return ''
}
export function parseDistrictClubShardPath(_path: string): {
  snapshotDate: string
  districtId: string
  shard: string
} | null {
  return null
}
export const DistrictClubShardClubSchema = z.never()
export const DistrictClubShardSchema = z.never()
export type DistrictClubShardClub = z.infer<typeof DistrictClubShardClubSchema>
export type DistrictClubShard = z.infer<typeof DistrictClubShardSchema>
