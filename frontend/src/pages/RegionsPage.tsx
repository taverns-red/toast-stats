import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchCdnRankings, fetchCdnRankingsForDate } from '../services/cdn'
import { aggregateRegions } from '../utils/aggregateRegions'
import { RegionsLeaderboard } from '../components/RegionsLeaderboard'
import { RegionFinder } from '../components/RegionFinder'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import { EmptyState } from '../components/ErrorDisplay'
import { useUrlState } from '../hooks/useUrlState'
import { useProgramYearControls } from '../hooks/useProgramYearControls'
import { DataControlsBar } from '../components/DataControlsBar'
import { computeFreshness } from '../utils/dataFreshness'

/* Region selection is URL state (#979) so it survives reload, back, and shared
   links — `?region=07`. Module-level options keep a stable reference so
   useUrlState's value memo isn't busted each render. `null` ("All regions")
   serialises to '' and is dropped from the URL, keeping the default clean. */
const REGION_URL_OPTIONS = {
  parse: (raw: string): string | null => raw || null,
  serialize: (value: string | null): string => value ?? '',
}

/* RegionsPage (#496) — overview of all 14 numbered regions.

   Composes the Sprint A utility + Sprint B components against the
   shared rankings.json feed. No new data; no pipeline changes; the
   /regions surface is purely a client-side grouping of the existing
   per-district feed.

   DNAR (District-Not-Assigned-Region) districts are filtered OUT of
   the table. When non-zero, they're surfaced as a small footnote so the
   count is visible without polluting the leaderboard. */

const RegionsPage: React.FC = () => {
  // PY selector state (#1301) — the page owns program year/date (R3) and
  // threads the selected snapshot date into its own rankings query so
  // switching the year re-queries.
  const {
    selectedProgramYear,
    setSelectedProgramYear,
    selectedDate,
    setSelectedDate,
    availableProgramYears,
    cachedDates,
    effectiveDate,
    isLatestSnapshot,
    isDatesPending,
  } = useProgramYearControls()

  const { data, isLoading, error } = useQuery({
    queryKey: ['district-rankings', effectiveDate ?? 'latest'],
    queryFn: async () => {
      if (effectiveDate) return fetchCdnRankingsForDate(effectiveDate)
      const cdn = await fetchCdnRankings()
      return { rankings: cdn.rankings, date: cdn.date }
    },
    staleTime: 15 * 60 * 1000,
    // Keep the prior snapshot visible while a PY switch re-queries, so the
    // leaderboard doesn't flash back to the full-page skeleton.
    placeholderData: prev => prev,
  })

  // Freshness pill: show the "as of" date and flag month-end reconciliation
  // when viewing the latest snapshot (#1296).
  const freshness = computeFreshness({
    asOfDate: data?.date,
    snapshotDate: effectiveDate,
    isLatest: isLatestSnapshot,
  })

  const [selectedRegion, setSelectedRegion] = useUrlState<string | null>(
    'region',
    null,
    REGION_URL_OPTIONS
  )

  const rollups = useMemo(
    () => (data?.rankings ? aggregateRegions(data.rankings) : []),
    [data]
  )

  // Available region ids for the finder, sorted numerically (01, 02, … 14).
  const regionIds = useMemo(
    () => rollups.map(r => r.region).sort((a, b) => Number(a) - Number(b)),
    [rollups]
  )

  // Derive (don't sync) the effective selection: a stale selection that a
  // refetch dropped self-heals to "All" at render time, so the user is never
  // stranded on an empty grid — and no setState-in-effect.
  const effectiveRegion =
    selectedRegion && regionIds.includes(selectedRegion) ? selectedRegion : null

  // Filter step (R11): "All" (null) shows every region; a selection isolates
  // one row in the leaderboard so the user can jump straight to it instead of
  // scanning all 14 (#685).
  const displayedRollups = useMemo(
    () =>
      effectiveRegion
        ? rollups.filter(r => r.region === effectiveRegion)
        : rollups,
    [rollups, effectiveRegion]
  )

  const dnarCount = useMemo(
    () =>
      data?.rankings
        ? data.rankings.filter(r => !/^\d+$/.test(r.region)).length
        : 0,
    [data]
  )

  if (isLoading) return <LoadingSkeleton variant="card" />
  if (error || !data) {
    return (
      <EmptyState
        title="Could not load regions"
        message="The rankings file is unavailable. Try again in a moment."
        icon="data"
      />
    )
  }

  return (
    <div className="app-shell__page">
      <header className="districts-page-header">
        <div className="districts-page-header__intro">
          <p className="districts-page-header__eyebrow">
            All regions · 14 worldwide
          </p>
          <h1 className="districts-page-header__title">Regions</h1>
          <p className="districts-page-header__lede">
            Aggregate ranking of all 14 Toastmasters regions. Click any region
            to drill into its districts.
          </p>
        </div>
        <div className="districts-page-header__actions">
          <DataControlsBar
            latestSnapshotDate={effectiveDate}
            asOfDate={freshness.displayDate}
            reconcilingMonthLabel={freshness.reconcilingMonthLabel}
            availableProgramYears={availableProgramYears}
            selectedProgramYear={selectedProgramYear}
            onProgramYearChange={setSelectedProgramYear}
            availableDates={cachedDates}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            freshnessPending={isDatesPending}
          />
        </div>
      </header>

      <RegionFinder
        regions={regionIds}
        selected={effectiveRegion}
        onSelect={setSelectedRegion}
      />

      <section className="my-6" aria-labelledby="regions-table-heading">
        <h2 id="regions-table-heading" className="sr-only">
          Region leaderboard
        </h2>
        <RegionsLeaderboard rollups={displayedRollups} />
      </section>

      {dnarCount > 0 && (
        <p className="text-xs text-gray-500 theme-dark:text-gray-400 mt-6 italic">
          {dnarCount} district{dnarCount === 1 ? '' : 's'} not yet assigned to a
          region — not shown above.
        </p>
      )}
    </div>
  )
}

export default RegionsPage
