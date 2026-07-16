/**
 * useLatestAsOfDate — the GLOBAL freshness inputs for pages that render the
 * data-freshness pill but don't already fetch a per-district snapshot (#1310).
 *
 * The landing/region pages read the as-of date (`sourceCsvDate`) from their
 * rankings query, and Division/Area/Club read it from their per-district
 * snapshot. But the eight district detail/subnav pages share a single
 * presentational `DistrictDetailHeader` (and five of them fetch no snapshot with
 * an as-of date), and AwardsPage's standings carry no `sourceCsvDate`. Rather
 * than add a heavy snapshot fetch to each, they read the GLOBAL as-of date here
 * — one shared, cached source so every page's pill agrees.
 *
 * - `asOfDate` comes from `rankings.json` (`date` = `metadata.sourceCsvDate`),
 *   the lightest CDN index that carries the dashboard "as of" date.
 * - `latestSnapshotDate` comes from the CDN manifest — the pinned month-end.
 *   A consumer compares its own district-latest against this so a district whose
 *   newest snapshot LAGS the global scrape never mislabels reconciliation.
 *
 * Caching, precisely (#1321 — the previous note here overclaimed):
 * - The **manifest** query is module-cached in `services/cdn.ts`, and every page
 *   already fetches it inside another queryFn, so it costs nothing.
 * - The **rankings** query is NOT module-cached. It shares the
 *   `['district-rankings', 'latest']` key + `fetchCdnRankings` queryFn +
 *   staleTime with `useDistrictRanking`, so it's a cache hit on the pages that
 *   already read rankings — but on a page that reads none (Division/Area), it is
 *   a real ~126KB fetch to read one string. `v1/rankings.json` is served
 *   uncompressed; the durable fix is to carry `sourceCsvDate` on the 152-byte
 *   `v1/latest.json` manifest instead. See the follow-up issue.
 */
import { useQuery } from '@tanstack/react-query'
import { fetchCdnRankings, fetchCdnManifest } from '../services/cdn'
import {
  snapshotDateFromManifest,
  type SnapshotDate,
} from '../types/snapshotDate'

export interface LatestAsOfDate {
  /** Global dashboard "as of" date (sourceCsvDate) — undefined until loaded. */
  asOfDate: string | undefined
  /** Global pinned latest-snapshot (month-end) date — undefined until loaded. */
  latestSnapshotDate: SnapshotDate | undefined
}

export function useLatestAsOfDate(): LatestAsOfDate {
  const { data: rankings } = useQuery({
    // Shares `useDistrictRanking`'s key/queryFn/staleTime so the two don't fetch
    // the same 126KB rankings.json under competing keys (#1321).
    queryKey: ['district-rankings', 'latest'],
    queryFn: fetchCdnRankings,
    staleTime: 15 * 60 * 1000,
  })
  const { data: manifest } = useQuery({
    queryKey: ['cdn-manifest'],
    queryFn: fetchCdnManifest,
    staleTime: 15 * 60 * 1000,
  })

  return {
    asOfDate: rankings?.asOfDate,
    latestSnapshotDate: snapshotDateFromManifest(manifest),
  }
}

/** The freshness facts a `DataControlsBar` needs, already reconciled. */
export interface GlobalFreshness {
  /** The global as-of date, or undefined when the viewed snapshot isn't latest. */
  asOfDate: string | undefined
  /** True when the viewed snapshot is the district's latest AND the global one. */
  isLatest: boolean
}

/**
 * Resolve the freshness pill's inputs for a district-scoped page (#1321).
 *
 * Owns the rule that was previously hand-written at each pill: the global as-of
 * date only describes the viewed snapshot when that snapshot is BOTH the
 * district's latest AND the global pinned month-end. A district whose data lags
 * the global scrape must NOT show the global as-of date, or its pill claims a
 * freshness (and a month-end reconciliation) that its own data doesn't have.
 *
 * Returning `asOfDate: undefined` for the non-latest case is load-bearing —
 * `computeFreshness` displays `asOfDate ?? snapshotDate` unconditionally, so
 * handing it a global date while viewing a historical snapshot would print the
 * global date over that snapshot's own.
 *
 * @param districtLatestSnapshotDate - the district's OWN newest snapshot date.
 * @param isLatestSnapshot - whether the page is viewing that newest snapshot.
 */
export function useGlobalFreshness(params: {
  districtLatestSnapshotDate: SnapshotDate | undefined
  isLatestSnapshot: boolean
}): GlobalFreshness {
  const { asOfDate, latestSnapshotDate: globalLatestSnapshot } =
    useLatestAsOfDate()
  // The `!!districtLatestSnapshotDate` term matters for callers whose
  // `isLatestSnapshot` doesn't already imply it (a bare `undefined ===
  // undefined` would otherwise read as "latest").
  const isLatest =
    params.isLatestSnapshot &&
    !!params.districtLatestSnapshotDate &&
    params.districtLatestSnapshotDate === globalLatestSnapshot
  return { asOfDate: isLatest ? asOfDate : undefined, isLatest }
}
