/* usePredecessorHistory (#2427) — the prior-year record of a new district's
   current clubs, under the districts they came from.

   Built from the readers the club pages already use, through their query
   cache (no fetch code of its own):
   - every roster club's club-district history shard (#1782), through the
     one shard query every history reader shares (#2073);
   - the district snapshot index (`snapshotIndexQueryOptions`, already read
     by the Overview's date index), resolved per predecessor with
     `yearEndDateFor`, the lookup `useClubHistory` uses;
   - each predecessor's year-end snapshot, through the
     `['districtStatistics', id, date]` query (one fetch per predecessor).

   Heavy by nature (D201's 158 clubs sit in 80 shards, ~1.1 MB gzipped), so
   it is `enabled` only once the reader asks for it. Statuses:
   - `idle` — not enabled; nothing fetched;
   - `loading` — shards (`loaded` of `total`) or snapshots in flight;
   - `not-new` — a current club was already in this district last year: the
     district has prior-year data of its own, so there is nothing to show;
   - `unavailable` — a shard or the index is missing; a partial join would
     misplace clubs, so nothing is shown;
   - `ready` — `groups` and `total` hold the aggregates. A predecessor whose
     year-end snapshot is missing is listed with `yearEndDate: null`. */

import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  clubDistrictHistoryShardKey,
  type ClubDistrictHistoryShard,
  type ClubStatisticsFile,
} from '@taverns-red/shared-contracts'
import { clubDistrictHistoryShardQuery } from './clubDistrictHistoryQuery'
import { snapshotIndexQueryOptions } from './snapshotIndexQuery'
import { districtStatisticsQueryOptions } from './useMembershipData'
import { findClubInShard } from '../utils/clubDistrictHistory'
import { yearEndDateFor } from '../utils/yearEndSnapshot'
import {
  aggregatePredecessor,
  joinRosterToPredecessors,
  totalAggregates,
  type PredecessorAggregate,
} from '../utils/predecessorHistory'
import type { ProgramYear } from '../utils/programYear'

export interface PredecessorGroupSummary extends PredecessorAggregate {
  /** The year-end snapshot read, or null when none could be read. */
  yearEndDate: string | null
}

export interface PredecessorHistoryState {
  status: 'idle' | 'loading' | 'not-new' | 'unavailable' | 'ready'
  loaded: number
  total: number
  groups: PredecessorGroupSummary[]
  totals: PredecessorAggregate | null
  newCharters: number
}

const EMPTY: Omit<PredecessorHistoryState, 'status'> = {
  loaded: 0,
  total: 0,
  groups: [],
  totals: null,
  newCharters: 0,
}

/** The clubs array of a dated snapshot envelope, or null when unusable. */
function yearEndClubs(snapshot: unknown): ClubStatisticsFile[] | null {
  const env = snapshot as
    { status?: string; data?: { clubs?: unknown } } | undefined
  if (!env || env.status === 'failed') return null
  const clubs = env.data?.clubs
  return Array.isArray(clubs) ? (clubs as ClubStatisticsFile[]) : null
}

export function usePredecessorHistory({
  districtId,
  priorYear,
  clubIds,
  enabled,
}: {
  districtId: string
  /** The program year before the one on screen (R3: from the page). */
  priorYear: ProgramYear
  clubIds: readonly string[]
  enabled: boolean
}): PredecessorHistoryState {
  const shardKeys = useMemo(
    () => [...new Set(clubIds.map(clubDistrictHistoryShardKey))].sort(),
    [clubIds]
  )
  const shards = useQueries({
    queries: (enabled ? shardKeys : []).map(clubDistrictHistoryShardQuery),
    combine: results => results.map(r => r.data),
  })

  const loaded = shards.filter(s => s !== undefined).length
  const shardsReady = enabled && loaded === shardKeys.length
  const shardMissing = shards.some(s => s === null)

  const join = useMemo(() => {
    if (!shardsReady || shardMissing) return null
    const byKey = new Map<string, ClubDistrictHistoryShard>()
    shardKeys.forEach((k, i) => {
      const s = shards[i]
      if (s) byKey.set(k, s)
    })
    return joinRosterToPredecessors(
      clubIds,
      id => {
        const shard = byKey.get(clubDistrictHistoryShardKey(id))
        return shard ? findClubInShard(shard, id) : undefined
      },
      districtId,
      priorYear.label
    )
  }, [
    shardsReady,
    shardMissing,
    shardKeys,
    shards,
    clubIds,
    districtId,
    priorYear.label,
  ])

  const isNew = join !== null && !join.hadThisDistrict
  const indexQuery = useQuery({
    ...snapshotIndexQueryOptions(),
    enabled: isNew,
  })

  const yearEnds = useMemo(
    () =>
      isNew && indexQuery.data
        ? join.groups.map(g =>
            yearEndDateFor(indexQuery.data, g.districtId, priorYear.year)
          )
        : [],
    [isNew, join, indexQuery.data, priorYear.year]
  )

  const snapshots = useQueries({
    queries: yearEnds.flatMap(ye =>
      ye ? [districtStatisticsQueryOptions(ye.districtId, ye.date)] : []
    ),
    combine: results =>
      results.map(r => ({ pending: r.isPending, data: r.data as unknown })),
  })

  return useMemo((): PredecessorHistoryState => {
    if (!enabled) return { status: 'idle', ...EMPTY }
    const total = shardKeys.length
    if (shardMissing) return { status: 'unavailable', ...EMPTY, loaded, total }
    if (!join) return { status: 'loading', ...EMPTY, loaded, total }
    if (join.hadThisDistrict) return { status: 'not-new', ...EMPTY }
    if (indexQuery.isError || indexQuery.data === null)
      return { status: 'unavailable', ...EMPTY, loaded, total }
    if (!indexQuery.data || snapshots.some(s => s.pending))
      return { status: 'loading', ...EMPTY, loaded, total }

    let next = 0
    const groups = join.groups.map((g, i): PredecessorGroupSummary => {
      const ye = yearEnds[i]
      const snap = ye ? snapshots[next++] : undefined
      const clubs = snap ? yearEndClubs(snap.data) : null
      return {
        ...aggregatePredecessor(g.districtId, g.clubIds, clubs),
        yearEndDate: clubs && ye ? ye.date : null,
      }
    })
    return {
      status: 'ready',
      loaded,
      total,
      groups,
      totals: totalAggregates(groups),
      newCharters: join.newCharterIds.length,
    }
  }, [
    enabled,
    shardKeys.length,
    shardMissing,
    loaded,
    join,
    indexQuery.isError,
    indexQuery.data,
    snapshots,
    yearEnds,
  ])
}
