/* useDistrictRanking — fetch the single district's row out of the shared
   rankings cache. Returns null while loading or if not found.
   Used to surface district-level fields that aren't carried in the
   per-club analytics (e.g. payment breakdowns: new / april / october /
   late / charter) plus the raw integers the trophy-case countdown derives
   from (#840).

   ## Scoped to the DISPLAYED snapshot, not to `latest` (#1396)

   This hook took no date and always read `v1/rankings.json`, so a district
   Overview showing a PAST program year rendered the CURRENT year's Payment
   Composition while every card beside it was correctly year-scoped. The
   parent owns the date; passing it is R3. The date is part of the query key
   — omitting it would make each new year a cache HIT on the previous one,
   which looks exactly like a working fix and isn't.

   `date` stays optional: with none, this is the old latest path AND it keeps
   sharing `['district-rankings', 'latest']` + `fetchCdnRankings` with
   `useLatestAsOfDate` (#1321), which genuinely wants the latest as-of date.
   A page that passes a date no longer shares that entry, so it pays for a
   second rankings fetch — the honest price of showing the year it claims to
   show. (The durable fix for the duplication is #1321's follow-up: carry
   `sourceCsvDate` on the 152-byte `v1/latest.json` manifest so
   `useLatestAsOfDate` stops reading rankings.json at all.) */

import { useQuery } from '@tanstack/react-query'
import { fetchCdnRankings, fetchCdnRankingsForDate } from '../services/cdn'
import type { DistrictRanking } from '../types/districts'
import type { SnapshotDate } from '../types/snapshotDate'

export function useDistrictRanking(
  districtId: string | undefined,
  /** The snapshot the page is displaying. Omit only for a genuine
      "whatever is newest" read. */
  date?: SnapshotDate | undefined
): {
  ranking: DistrictRanking | null
  isLoading: boolean
} {
  const { data, isLoading } = useQuery({
    queryKey: ['district-rankings', date ?? 'latest'],
    queryFn: date ? () => fetchCdnRankingsForDate(date) : fetchCdnRankings,
    staleTime: 15 * 60 * 1000,
  })

  // `fetchCdnRankingsForDate` silently falls back to the CURRENT
  // `v1/rankings.json` when a per-date file 404s, and signals that by leaving
  // `snapshotDate` unset. Serving that under a past date is the very bug this
  // hook was fixed for, so report "no row" rather than another year's row.
  // (Every date the page can select comes from the CDN dates index, so a miss
  // here means a pipeline gap, not a routine state.)
  const isFallback = date !== undefined && data?.snapshotDate !== date

  const ranking =
    data?.rankings && districtId && !isFallback
      ? (data.rankings.find(r => r.districtId === districtId) ?? null)
      : null

  return { ranking, isLoading }
}
