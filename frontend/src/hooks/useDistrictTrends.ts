/**
 * Per-district membership series for the region districts table's sparkline
 * column (#1815). One small program-year time-series file per district
 * (~1.5 KB gzipped; the same CDN object the district Trends page reads) for
 * the page's own program year (R3), bounded by its pinned date.
 *
 * Tolerant per row: a district whose file is missing gets `null` (the cell
 * says so), and never blocks the others (Lesson: aggregates degrade per
 * row). Waits for the table's rows, so it never delays the first paint.
 */
import { useQueries } from '@tanstack/react-query'
import { fetchTimeSeriesProgramYear } from '../services/cdnTimeSeries'
import { districtTrendSeries } from '../utils/districtTrendSeries'

export function useDistrictTrends(
  districtIds: readonly string[],
  /** "YYYY-YYYY", the page's program year (R3). */
  programYear: string,
  /** The page's pinned snapshot date; undefined = latest. */
  snapshotDate: string | undefined
): ReadonlyMap<string, number[] | null> {
  const results = useQueries({
    queries: districtIds.map(id => ({
      queryKey: ['timeSeries-py', id, programYear] as const,
      queryFn: async () => {
        try {
          return await fetchTimeSeriesProgramYear(id, programYear)
        } catch {
          return null
        }
      },
      staleTime: 15 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    })),
  })
  const map = new Map<string, number[] | null>()
  districtIds.forEach((id, i) => {
    const file = results[i]?.data
    if (file === undefined) return // still loading: no entry yet
    map.set(
      id,
      file ? districtTrendSeries(file.dataPoints, snapshotDate) : null
    )
  })
  return map
}
