/**
 * District club shards (#1901).
 *
 * Splits a district analytics file's `allClubs` into ten
 * `district_<id>_clubs_<D>.json` files, D = the last digit of the canonical
 * club id, in the same `analytics/` directory. The club page reads one shard
 * (~10 % of the district's clubs) instead of the whole file.
 *
 * - Built from the same in-memory `allClubs` the analytics file was written
 *   from, so the two never disagree. Each club is passed through unchanged.
 * - All ten shards are written, empty ones included: a missing shard means
 *   "not built", never "no club ends in this digit".
 * - Compact JSON (the analytics file is pretty-printed; the shards are read
 *   on phones).
 * - Flat names in `analytics/`, so the daily `analytics/*.json` upload and
 *   `process-dates.sh`'s per-file upload carry them with no script change.
 */
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
  DISTRICT_CLUB_SHARD_KEYS,
  DISTRICT_CLUB_SHARD_VERSION,
  districtClubShardKey,
  type DistrictClubShard,
  type DistrictClubShardKey,
} from '@taverns-red/shared-contracts'

/** The file name of one shard inside `snapshots/<date>/analytics/`. */
export function districtClubShardFileName(
  districtId: string,
  shard: DistrictClubShardKey
): string {
  return `district_${districtId}_clubs_${shard}.json`
}

/**
 * Write the ten shards for one district. Returns the written paths in key
 * order. Throws if a club id has no digit (it could not be found by any
 * reader), so the district's compute fails loudly instead of losing a club.
 */
export async function writeDistrictClubShards(
  analyticsDir: string,
  snapshotDate: string,
  districtId: string,
  clubs: ReadonlyArray<{ clubId: string }>
): Promise<string[]> {
  const byKey = new Map<DistrictClubShardKey, Array<{ clubId: string }>>(
    DISTRICT_CLUB_SHARD_KEYS.map(k => [k, []])
  )
  for (const club of clubs) {
    const key = districtClubShardKey(club.clubId)
    if (key === null) {
      throw new Error(
        `District ${districtId} ${snapshotDate}: club id "${club.clubId}" has no digit; cannot shard`
      )
    }
    byKey.get(key)!.push(club)
  }

  await fs.mkdir(analyticsDir, { recursive: true })
  const written: string[] = []
  for (const shard of DISTRICT_CLUB_SHARD_KEYS) {
    const body: DistrictClubShard = {
      _format: {
        version: DISTRICT_CLUB_SHARD_VERSION,
        type: 'district-club-shard',
      },
      snapshotDate,
      districtId,
      shard,
      shardCount: DISTRICT_CLUB_SHARD_KEYS.length,
      clubs: byKey.get(shard)! as DistrictClubShard['clubs'],
    }
    const filePath = path.join(
      analyticsDir,
      districtClubShardFileName(districtId, shard)
    )
    const tempPath = `${filePath}.tmp.${process.pid}`
    await fs.writeFile(tempPath, JSON.stringify(body), 'utf-8')
    await fs.rename(tempPath, filePath)
    written.push(filePath)
  }
  return written
}
