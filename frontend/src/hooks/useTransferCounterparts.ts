/* useTransferCounterparts (#1806) — joins a diff's realignment transfers
   (#1443) to the club-district history (#1782), so the Changes feed can say
   "transferred to District 201" instead of "moved to another district".

   Lazy by construction: nothing is fetched until the diff carries a transfer
   event, and then only the distinct shards holding those clubs (a shard is
   keyed by the club id's last two digits). The service module itself is
   dynamically imported, so no page carries it in its fixed weight. Any shard
   that fails to load simply contributes nothing — the label stays as the
   engine wrote it (the #1443 detection thresholds are untouched). */

import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import {
  clubDistrictHistoryShardKey,
  normalizeClubId,
  type DiffEvent,
  type SnapshotDiff,
} from '@taverns-red/shared-contracts'
import {
  findClubInShard,
  transferCounterpartDistrict,
} from '../utils/clubDistrictHistory'
import { clubDistrictHistoryShardQuery } from './clubDistrictHistoryQuery'

function transferDirection(event: DiffEvent): 'in' | 'out' | null {
  if (event.category === 'club-transferred-in') return 'in'
  if (event.category === 'club-transferred-out') return 'out'
  return null
}

/**
 * Canonical club id → the district on the other side of its transfer, for
 * every transfer in `diff` the history can name. `districtId` is the page's
 * route district (R3), used only to refuse a self-referencing counterpart.
 */
export function useTransferCounterparts(
  diff: Pick<SnapshotDiff, 'events' | 'rosterDiscontinuity'> | undefined,
  districtId: string
): ReadonlyMap<string, string> {
  const transfers = useMemo(
    () =>
      (diff?.events ?? []).flatMap(e => {
        const direction = transferDirection(e)
        const clubId = normalizeClubId(e.clubId)
        return direction && clubId ? [{ clubId, direction }] : []
      }),
    [diff?.events]
  )

  const shardKeys = useMemo(
    () =>
      [
        ...new Set(transfers.map(t => clubDistrictHistoryShardKey(t.clubId))),
      ].sort(),
    [transfers]
  )

  // `combine` is structurally shared, so this array is referentially stable
  // until a shard actually lands — safe as a memo dependency.
  const shardData = useQueries({
    queries: shardKeys.map(clubDistrictHistoryShardQuery),
    combine: results => results.map(r => r.data),
  })

  const pys = diff?.rosterDiscontinuity

  return useMemo(() => {
    const map = new Map<string, string>()
    if (!pys) return map
    const byKey = new Map(shardKeys.map((k, i) => [k, shardData[i]]))
    for (const { clubId, direction } of transfers) {
      const shard = byKey.get(clubDistrictHistoryShardKey(clubId))
      const club = shard && findClubInShard(shard, clubId)
      if (!club) continue
      const other = transferCounterpartDistrict(
        club,
        direction,
        pys,
        districtId
      )
      if (other) map.set(clubId, other)
    }
    return map
  }, [transfers, shardKeys, shardData, pys, districtId])
}
