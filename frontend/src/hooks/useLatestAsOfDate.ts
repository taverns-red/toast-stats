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
 * Both queries are cached (manifest is additionally module-cached), so this is a
 * cache hit wherever rankings/manifest were already loaded.
 */
import { useQuery } from '@tanstack/react-query'
import { fetchCdnRankings, fetchCdnManifest } from '../services/cdn'

export interface LatestAsOfDate {
  /** Global dashboard "as of" date (sourceCsvDate) — undefined until loaded. */
  asOfDate: string | undefined
  /** Global pinned latest-snapshot (month-end) date — undefined until loaded. */
  latestSnapshotDate: string | undefined
}

export function useLatestAsOfDate(): LatestAsOfDate {
  const { data: rankings } = useQuery({
    queryKey: ['latest-as-of-date'],
    queryFn: fetchCdnRankings,
    staleTime: 15 * 60 * 1000,
  })
  const { data: manifest } = useQuery({
    queryKey: ['cdn-manifest'],
    queryFn: fetchCdnManifest,
    staleTime: 15 * 60 * 1000,
  })

  return {
    asOfDate: rankings?.date,
    latestSnapshotDate: manifest?.latestSnapshotDate,
  }
}
