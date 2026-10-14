import type { QueryClient } from '@tanstack/react-query'
import { districtCachedDatesQueryOptions } from '../hooks/useDistrictData'
import { districtStatisticsQueryOptions } from '../hooks/useMembershipData'

/**
 * Start a route's first-paint data reads from the entry (#1901 option A).
 *
 * The club route's LCP element (`h1.club-hero__title`) waits on
 * snapshot index → `district_N.json`. Both reads used to start only after the
 * lazy route chunk mounted, so they ran in series behind it. Called from
 * `main.tsx` before the first render, this starts them while the route chunk
 * downloads.
 *
 * It seeds the SAME query entries the page reads (shared option factories),
 * so a page that mounts mid-flight attaches to the in-flight request and one
 * that mounts later gets a cache hit — never a second download.
 *
 * Scope, deliberately narrow:
 * - Only `/district/:id/club/:clubId` (not `/history`): the route this was
 *   measured on.
 * - The snapshot is the district's newest date, which is what the page reads
 *   when the URL carries no `?py=` / `?date=`. A deep link may read another
 *   date, so it gets the index only — a guessed snapshot would be ~50 KB of
 *   wasted bytes.
 *
 * Fire-and-forget: `prefetchQuery` never throws, and a failed prefetch leaves
 * the page's own query to fetch (and retry) as before.
 */
const CLUB_ROUTE = /^\/district\/([A-Za-z0-9]+)\/club\/[^/]+\/?$/

export function prefetchRouteData(
  client: QueryClient,
  location: { pathname: string; search: string }
): void {
  const match = CLUB_ROUTE.exec(location.pathname)
  const districtId = match?.[1]
  if (!districtId) return

  const params = new URLSearchParams(location.search)
  const isDeepLink = params.has('py') || params.has('date')

  const datesQuery = districtCachedDatesQueryOptions(districtId)
  void client.prefetchQuery(datesQuery).then(() => {
    if (isDeepLink) return
    const latest = client.getQueryData(datesQuery.queryKey)?.dateRange?.endDate
    if (!latest) return
    return client.prefetchQuery(
      districtStatisticsQueryOptions(districtId, latest)
    )
  })
}
