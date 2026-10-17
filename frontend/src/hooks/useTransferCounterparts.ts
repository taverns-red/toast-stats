/* useTransferCounterparts (#1806) — joins a diff's realignment transfers
   (#1443) to the club-district history (#1782), so the Changes feed can say
   "transferred to District 201" instead of "moved to another district".

   Lazy by construction: nothing is fetched until the diff carries a transfer
   event, and then only the distinct shards holding those clubs (a shard is
   keyed by the club id's last two digits). The service module itself is
   dynamically imported, so no page carries it in its fixed weight. Any shard
   that fails to load simply contributes nothing — the label stays as the
   engine wrote it (the #1443 detection thresholds are untouched).

   Bounded per view (#2063): a big realignment diff touches ~59 of the 100
   shards (~0.67 MB gz on the D36/D220 case). Up front the hook loads at most
   TRANSFER_COUNTERPART_SHARD_BUDGET shards, taken in display order (moved in,
   then moved out, as the page lists them). Rows whose shard is outside the
   loaded batches are reported as `deferred`; `loadMore()` adds one more
   batch, on the reader's request. */

import { useCallback, useMemo, useState } from 'react'
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

/**
 * History shards fetched per batch. The largest shard measured on the prod
 * CDN is 12,838 B gzipped (2026-10-17), so a batch is ≤ ~462 KB — inside the
 * 500 KB per-view budget of #2063, with ~8% headroom for shard growth.
 */
export const TRANSFER_COUNTERPART_SHARD_BUDGET = 36

type Direction = 'in' | 'out'

function transferDirection(event: DiffEvent): Direction | null {
  if (event.category === 'club-transferred-in') return 'in'
  if (event.category === 'club-transferred-out') return 'out'
  return null
}

export interface TransferCounterparts {
  /** Canonical club id → the district on the other side of its transfer. */
  counterparts: ReadonlyMap<string, string>
  /** Canonical ids of transferred clubs whose shard is not yet loaded. */
  deferred: ReadonlySet<string>
  /** Load the next batch of shards (no-op when nothing is deferred). */
  loadMore: () => void
}

/**
 * The district on the other side of every transfer in `diff` the history can
 * name. `districtId` is the page's route district (R3), used only to refuse a
 * self-referencing counterpart.
 */
export function useTransferCounterparts(
  diff: Pick<SnapshotDiff, 'events' | 'rosterDiscontinuity'> | undefined,
  districtId: string
): TransferCounterparts {
  // Display order: the page lists the moved-in group before the moved-out
  // one, each in event order — so the first batch covers the first rows.
  const transfers = useMemo(() => {
    const rows = (diff?.events ?? []).flatMap(e => {
      const direction = transferDirection(e)
      const clubId = normalizeClubId(e.clubId)
      return direction && clubId ? [{ clubId, direction }] : []
    })
    return [
      ...rows.filter(r => r.direction === 'in'),
      ...rows.filter(r => r.direction === 'out'),
    ]
  }, [diff?.events])

  // Batches loaded so far, tied to the transfers they were counted for: a new
  // diff starts again from one batch.
  const [batches, setBatches] = useState({ for: transfers, count: 1 })
  const batchCount = batches.for === transfers ? batches.count : 1
  const loadMore = useCallback(
    () => setBatches({ for: transfers, count: batchCount + 1 }),
    [transfers, batchCount]
  )

  const { shardKeys, deferred } = useMemo(() => {
    const ordered = [
      ...new Set(transfers.map(t => clubDistrictHistoryShardKey(t.clubId))),
    ]
    const loaded = ordered.slice(
      0,
      batchCount * TRANSFER_COUNTERPART_SHARD_BUDGET
    )
    const loadedSet = new Set(loaded)
    return {
      shardKeys: loaded,
      deferred: new Set(
        transfers
          .filter(t => !loadedSet.has(clubDistrictHistoryShardKey(t.clubId)))
          .map(t => t.clubId)
      ) as ReadonlySet<string>,
    }
  }, [transfers, batchCount])

  // `combine` is structurally shared, so this array is referentially stable
  // until a shard actually lands — safe as a memo dependency.
  const shardData = useQueries({
    queries: shardKeys.map(clubDistrictHistoryShardQuery),
    combine: results => results.map(r => r.data),
  })

  const pys = diff?.rosterDiscontinuity

  const counterparts = useMemo(() => {
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

  return { counterparts, deferred, loadMore }
}
