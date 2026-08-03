import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchCdnRankings, fetchCdnRankingsForDate } from '../services/cdn'
import type { DistrictsResponse } from '../types/districts'
import type { SnapshotDate } from '../types/snapshotDate'

/**
 * React Query hook to fetch available districts.
 * Derives district list from CDN rankings data (#173).
 *
 * ## Scoped to the DISPLAYED snapshot, not to `latest` (#1398)
 *
 * This hook read the undated `fetchCdnRankings()` — the CURRENT program year
 * only. Districts are realigned between years, so the roster is not stable:
 * the 2025-06-30 snapshot carries 132 districts and `v1/rankings.json` carries
 * 94. `DistrictDetailPage` reads this list as an EXISTENCE GATE, so all 38
 * districts realigned away since (D27 among them) were judged not to exist on
 * any year's URL and their visitors landed on the limited Global-Rankings page.
 * The parent owns the date; passing it is R3. Sibling of #1396, one hook over.
 *
 * The date is part of the query key — omitting it would make each new year a
 * cache HIT on the previous one, which looks exactly like a working fix and
 * isn't. `date ?? 'latest'` keeps the undated path on its own entry (nothing
 * else keys on `['districts']` — checked; unlike #1396's `useLatestAsOfDate`
 * coupling, this key has a single owner).
 *
 * Two deliberate non-choices:
 *
 * - **The cdn.ts latest-fallback is allowed to stand here**, unlike in
 *   `useDistrictRanking`, which suppresses it. `fetchCdnRankingsForDate`
 *   silently serves `v1/rankings.json` when a per-date file 404s. There, the
 *   wrong year's *numbers* are a silent data lie, so "no row" is the honest
 *   answer. Here the list is a navigational index behind an existence gate:
 *   falling back to the current roster is exactly today's behaviour, whereas
 *   an empty list would send EVERY district — current year included — to the
 *   Global-Rankings fallback. Degrading to the status quo beats a
 *   self-inflicted outage. (All per-date rankings files exist, so this path
 *   means a pipeline gap, not a routine state.)
 * - **No `placeholderData: prev => prev`.** Holding the previous year's roster
 *   across a year switch renders the old year's district set under the new
 *   year's heading until the fetch lands — a transient copy of this very bug.
 *
 * Consumer audit (#1398): only `DistrictDetailPage` gates on membership of this
 * list. The other eleven consumers use it solely to resolve `districtName` for
 * a heading/breadcrumb, and every district absent from the current roster is
 * numerically named (only `F` and `U` are not, and both exist in both years),
 * so `District {id}` renders identically whether the list is dated or not.
 * `ErrorPage` (404 recovery) and `ClubHistoryPage` (inherently all-years)
 * genuinely want the current roster and stay undated on purpose. If a second
 * gate is ever added to one of those pages, it must pass its date too.
 *
 * @param date - The snapshot the page is displaying. Omit only for a genuine
 *               "which districts exist now" read.
 */
export const useDistricts = (
  date?: SnapshotDate | undefined
): UseQueryResult<DistrictsResponse, Error> => {
  return useQuery<DistrictsResponse, Error>({
    queryKey: ['districts', date ?? 'latest'],
    queryFn: async () => {
      const { rankings } = date
        ? await fetchCdnRankingsForDate(date)
        : await fetchCdnRankings()
      return {
        districts: rankings.map(r => ({
          id: r.districtId,
          name: r.districtName,
        })),
      }
    },
    staleTime: 15 * 60 * 1000, // 15 minutes
    retry: 2,
  })
}
