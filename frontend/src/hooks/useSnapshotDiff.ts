import { useQuery } from '@tanstack/react-query'
import {
  fetchCdnDistrictSnapshot,
  fetchCdnRevisionDistrictSnapshot,
} from '../services/cdn'
import { diffSnapshots } from '@taverns-red/analytics-core'
import type {
  PerDistrictData,
  SnapshotDiff,
} from '@taverns-red/shared-contracts'
import { diffAreaDivisionStatus } from '../utils/diffAreaDivisionStatus'
import {
  diffClubStatus,
  countClubStatusTotals,
  type ClubStatusTotals,
} from '../utils/diffClubStatus'
import type { SnapshotDate } from '../types/snapshotDate'
import { pointToken, type SnapshotPoint } from '../utils/snapshotPoints'

/**
 * Resolve the default "since the previous recorded date" pair from a district's
 * recorded snapshot dates. `to` is the latest date, `from` is the one before it
 * (index `[-2]`). Returns null when fewer than two dates exist (the page shows a
 * disabled / explanatory state).
 *
 * Dates are assumed already sorted ascending — the per-district snapshot index
 * is stored that way. The page owns this pair and passes it to useSnapshotDiff
 * as props (R3 — never re-derive from response data).
 *
 * NOT changed for #1443, deliberately: across a district realignment this
 * default pair straddles the boundary (last June vs first July), which is what
 * makes the diff hard to read. Whether the default should skip such a pair is
 * a product call, not an engine one — so the diff now LABELS the boundary
 * (`SnapshotDiff.rosterDiscontinuity`) and the default stays as it is.
 *
 * @see docs/design/what-changed-feature.md §5
 */
export function previousRecordedDate<T extends string>(
  dates: readonly T[]
): { from: T; to: T } | null {
  if (dates.length < 2) return null
  return {
    from: dates[dates.length - 2]!,
    to: dates[dates.length - 1]!,
  }
}

/**
 * The engine's `SnapshotDiff` plus the frontend-computed per-status club
 * counts (#2425) the What Changed "Active clubs" tile reads. Optional so a
 * diff without it renders the tile's "status not recorded" state, never a 0.
 */
export type SnapshotDiffView = SnapshotDiff & {
  clubStatusTotals?: ClubStatusTotals
}

/**
 * Fetch two dated district snapshots and compute the diff between them.
 *
 * Keyed by the (districtId, from, to) triple so each pair caches independently.
 * The dated file is the `PerDistrictData` wrapper — the diff engine consumes its
 * `.data` (`DistrictStatisticsFile`). Disabled until all three are present, or
 * while `options.enabled` is false (#2740: the clubs route fetches the pair
 * only once the diff is needed; every other caller keeps the eager default).
 */
/**
 * One side of the pair: a dated snapshot, or a month-end reconciliation
 * revision (`snapshots/<monthEnd>/revisions/<asOf>/`, #2475). Both are the same
 * `PerDistrictData`, so the diff engine below never learns which it got.
 */
function fetchPoint(p: SnapshotDate | SnapshotPoint, districtId: string) {
  if (typeof p === 'string' || !p.asOf) {
    return fetchCdnDistrictSnapshot<PerDistrictData>(
      typeof p === 'string' ? p : p.date,
      districtId
    )
  }
  return fetchCdnRevisionDistrictSnapshot<PerDistrictData>(
    p.date,
    p.asOf,
    districtId
  )
}

const keyOf = (p: SnapshotDate | SnapshotPoint | undefined) =>
  typeof p === 'object' ? pointToken(p) : p

export function useSnapshotDiff(
  districtId: string | undefined,
  from: SnapshotDate | SnapshotPoint | undefined,
  to: SnapshotDate | SnapshotPoint | undefined,
  options: { enabled?: boolean } = {}
) {
  return useQuery<SnapshotDiffView, Error>({
    queryKey: ['snapshot-diff', districtId, keyOf(from), keyOf(to)],
    queryFn: async () => {
      const [fromSnap, toSnap] = await Promise.all([
        fetchPoint(from!, districtId!),
        fetchPoint(to!, districtId!),
      ])
      // Club-scoped diff (analytics-core engine) + area/division recognition
      // transitions and club operational-status transitions (both frontend
      // source-of-truth, #1014/#1247). The page buckets events by category, so
      // the streams coexist in one flat `events` list.
      const diff = diffSnapshots(fromSnap.data, toSnap.data)
      const areaDivision = diffAreaDivisionStatus(fromSnap.data, toSnap.data)
      const clubStatus = diffClubStatus(fromSnap.data, toSnap.data)
      // Spread the engine's diff, override ONLY `events` (and add the
      // #2425 status counts alongside). Everything else the
      // engine decided rides through untouched — including
      // `rosterDiscontinuity` (#1443), the district-realignment context the
      // page keys its explanatory note off. Adding another merged stream must
      // keep that spread, not rebuild the object field by field.
      return {
        ...diff,
        events: [...diff.events, ...areaDivision, ...clubStatus],
        // #2425 — per-status counts for the "Active clubs" tile, from the
        // same status field the club-status events read (R3).
        clubStatusTotals: countClubStatusTotals(fromSnap.data, toSnap.data),
      }
    },
    enabled: (options.enabled ?? true) && !!districtId && !!from && !!to,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  })
}
