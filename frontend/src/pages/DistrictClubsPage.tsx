import React, { useCallback, useMemo, useState } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useDistricts } from '../hooks/useDistricts'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useDistrictAnalytics } from '../hooks/useDistrictAnalytics'
import { useDistrictCachedDates } from '../hooks/useDistrictData'
import { previousRecordedDate, useSnapshotDiff } from '../hooks/useSnapshotDiff'
import { useDistrictProgramYearControls } from '../hooks/useDistrictProgramYearControls'
import { DistrictDetailHeader } from '../components/DistrictDetailHeader'
import { SubpageBreadcrumb } from '../components/SubpageBreadcrumb'
import { DistrictSubnav } from '../components/DistrictSubnav'
import { ClubsTable } from '../components/ClubsTable'
import { useUrlStringSet } from '../hooks/useUrlStringSet'
import { ProspectiveClubsPanel } from '../components/ProspectiveClubsPanel'
import ErrorBoundary from '../components/ErrorBoundary'
import { ErrorDisplay } from '../components/ErrorDisplay'
import { isDistrictSlotPending } from '../utils/districtSlotPending'
import type { SortDirection, SortField } from '../components/filters/types'
import type { FilterState } from '../components/filters/types'
import {
  paramsToFilterState,
  filterStateToParams,
  FILTER_PARAM_KEYS,
  PRESET_PARAM,
  PRESET_CLOSE_TO_DISTINGUISHED,
  paramsToPresetActive,
  SINCE_PARAM,
  paramsToSinceLastYearMode,
} from '../utils/clubFilterUrl'
import { usePriorYearClubGoals } from '../hooks/usePriorYearClubGoals'
import type { SinceLastYearMode } from '../utils/sinceLastYear'

/* District Clubs Page (#570, epic #568 Phase 2; URL-sync generalised #817).
   Dedicated route for the clubs subview. URL params (clean spec):
     ?status=<thriving|vulnerable|intervention>   (health band)
     ?search=<q>                                   (club name)
     ?sort=<field>&dir=<asc|desc>                  (sort)
     ?<column>=<value>                             (every other filter, #817)
   Since #817 EVERY filterable column round-trips through the URL (numeric as
   `min..max`, categorical comma-joined) via `clubFilterUrl` — so a filtered
   club list is shareable/bookmarkable, not just the status/search subset.
   Pagination was removed in #667 (epic #665) — all clubs render in one
   sticky-header scroll container, so there is no `?page=` param. A stale
   legacy `?page=` is harmless (ignored on load; the legacy `?tab=clubs`
   redirect strips it). The router-level redirect from the legacy `?tab=clubs`
   URL lives in App.tsx and translates `f_status`/`f_name` into the new names. */

const DistrictClubsPage: React.FC = () => {
  const { districtId } = useParams<{ districtId: string }>()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  // The context bar's toolbar slot (#1912): in short landscape ClubsTable
  // portals its search + Filter & sort there. State, not a ref, so the table
  // re-renders once the slot mounts.
  const [contextBarTools, setContextBarTools] = useState<HTMLDivElement | null>(
    null
  )

  // Sort URL state -- mirrors DistrictDetailPage's conventions so sort
  // field names line up with ClubsTable's existing SortField union.
  // (No page state since #667 — pagination was removed.)
  const initialSortField = (searchParams.get('sort') ?? undefined) as
    SortField | undefined
  const initialSortDir =
    (searchParams.get('dir') as SortDirection | null) || undefined

  // Seeds for ClubsTable's local state, read from the CURRENT URL — not a
  // mount-time snapshot (#2370). ClubsTable reads them only when it mounts,
  // and it remounts whenever the page swaps it for the loading skeleton (a
  // snapshot-date change re-keys the analytics query). A mount-time snapshot
  // would then reseed it with stale state and drop every filter, preset and
  // sort applied since load, while the URL still carries them.
  const initialFilterState = useMemo(
    () => paramsToFilterState(searchParams),
    [searchParams]
  )

  const handleSortChange = useCallback(
    (field: string, direction: string) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev)
          if (field === 'name' && direction === 'asc') {
            next.delete('sort')
            next.delete('dir')
          } else {
            next.set('sort', field)
            next.set('dir', direction)
          }
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  // "Close to Distinguished" preset URL state (#979). Like sort/dir, the preset
  // is a single-writer param with its own handler — disjoint from the filter
  // reconcile's FILTER_PARAM_KEYS, so a filter change never wipes it and the two
  // never collide in one batch (no lesson-070 race). Updates flow through
  // onPresetChange. The page owns the param; ClubsTable seeds its local toggle
  // from the current URL on (re)mount (R3, #2370).
  const initialPresetActive = paramsToPresetActive(searchParams)

  const handlePresetChange = useCallback(
    (active: boolean) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev)
          if (active) next.set(PRESET_PARAM, PRESET_CLOSE_TO_DISTINGUISHED)
          else next.delete(PRESET_PARAM)
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  // "Climbed / slipped since last year" preset URL state (#2432). Its own key
  // and single writer, like `preset` above. Read from the current URL each
  // render, so the table is controlled by it.
  const sinceMode = paramsToSinceLastYearMode(searchParams)
  const handleSinceModeChange = useCallback(
    (mode: SinceLastYearMode | null) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev)
          if (mode) next.set(SINCE_PARAM, mode)
          else next.delete(SINCE_PARAM)
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  // Open division groups in the phone row list (#1833). Page-owned URL state
  // (`?open=A,B`) so a club page round-trip — whose back link carries
  // location.search — and a shared link restore the same open divisions.
  // useUrlStringSet writes functionally (lesson 070), so it composes with the
  // sort/filter/preset writers above.
  const [openGroups, setOpenGroups] = useUrlStringSet('open')

  const handleFilterChange = useCallback(
    (state: FilterState) => {
      // Wholesale reconcile: drop EVERY filter param this module owns, then set
      // the ones present in `state`. Reconciling the full set (rather than
      // incrementally set/delete one key) sidesteps the same-batch prev-snapshot
      // race in lesson 070 — the result is the same regardless of write order —
      // and leaves reserved params (py/date/sort/dir) untouched.
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev)
          for (const key of FILTER_PARAM_KEYS) next.delete(key)
          for (const [key, value] of filterStateToParams(state))
            next.set(key, value)
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  // Program-year + date wiring (matches DistrictDetailPage so the header
  // controls behave the same way across the two routes).
  // Validated against this district's snapshots once, in the shared hook
  // (#2635); the chip is told the date whose data is on screen.
  const {
    selectedProgramYear,
    setSelectedProgramYear,
    setSelectedDate,
    availableProgramYears,
    availableDates: cachedDatesInProgramYear,
    effectiveProgramYear,
    effectiveEndDate,
    selectedDate,
    hasValidDates,
  } = useDistrictProgramYearControls(districtId)

  const { data: districtsData } = useDistricts()
  const selectedDistrict = districtsData?.districts?.find(
    d => d.id === districtId
  )

  const {
    data: cachedDatesData,
    isPending: isDatesPending = false,
    error: datesError,
    refetch: refetchDates,
  } = useDistrictCachedDates(districtId || '')
  const allCachedDates = useMemo(
    () => cachedDatesData?.dates || [],
    [cachedDatesData?.dates]
  )

  const {
    data: analytics,
    isLoading,
    isError,
    error,
    refetch,
  } = useDistrictAnalytics(
    hasValidDates ? districtId || null : null,
    effectiveProgramYear?.startDate,
    effectiveEndDate ?? undefined
  )

  const allClubs = analytics?.allClubs || []

  // Last year's DCP goals at the same date (#2432), for the since-last-year
  // preset. The date is the one the page shows (R3); fetched only while the
  // preset is on.
  const priorYear = usePriorYearClubGoals(
    districtId,
    effectiveEndDate,
    allCachedDates,
    sinceMode !== null
  )

  // #1999: hold the skeleton until the analytics settle — including the
  // date-index window, where the query is disabled and reports
  // `isLoading: false` with no data. Without this the table painted its
  // "No club data is available" empty state (and Lighthouse took it as LCP).
  const isClubsPending = isDistrictSlotPending(
    { hasData: !!analytics, isError: !!isError },
    { hasValidDates, datesSettled: !isDatesPending }
  )

  // Default snapshot-diff pair = (previous recorded date → latest recorded
  // date) for this district (#795, epic #821 Sprint 3). The diff feeds the
  // opt-in "Changes" column group ON the clubs table — independent of the
  // dedicated "What Changed" page (`/district/:id/changes`), which owns its
  // own URL-synced arbitrary date pair (#794). The pair is owned here and
  // passed as props (R3 — never re-derive from response data). When fewer
  // than two snapshots exist the hook is disabled (`enabled: !!from && !!to`)
  // and ClubsTable gets `snapshotDiff: undefined` — the Changes group simply
  // doesn't surface, matching the same precondition the changes page uses.
  const sortedRecordedDates = useMemo(
    () => [...allCachedDates].sort((a, b) => a.localeCompare(b)),
    [allCachedDates]
  )
  const defaultDiffPair = useMemo(
    () => previousRecordedDate(sortedRecordedDates),
    [sortedRecordedDates]
  )
  const { data: snapshotDiff } = useSnapshotDiff(
    districtId,
    defaultDiffPair?.from,
    defaultDiffPair?.to
  )

  // A refresh that fails while clubs are on screen keeps them (spec §7) and
  // says so inline, once per failure: dismissing hides that error, not the next.
  const refreshError: unknown = datesError ?? (isError ? error : null)
  const [dismissedRefreshError, setDismissedRefreshError] =
    useState<unknown>(null)

  const rawName = selectedDistrict?.name || districtId || ''
  const districtName = /^\d+$/.test(rawName) ? `District ${rawName}` : rawName
  useDocumentTitle(districtName ? `${districtName} Clubs` : null)

  const availableDates = [...cachedDatesInProgramYear].sort((a, b) =>
    b.localeCompare(a)
  )

  if (!districtId) {
    return null
  }

  return (
    <ErrorBoundary>
      <div className="district-detail-page-root">
        <div className="district-detail-page">
          <DistrictDetailHeader
            districtId={districtId}
            districtName={districtName}
            selectedProgramYear={selectedProgramYear}
            setSelectedProgramYear={setSelectedProgramYear}
            availableProgramYears={availableProgramYears}
            selectedDate={selectedDate}
            effectiveDate={effectiveEndDate ?? undefined}
            onDateChange={setSelectedDate}
            availableDates={availableDates}
            latestSnapshotDate={
              cachedDatesData?.dateRange?.endDate ?? availableDates[0]
            }
            contextBarToolsRef={setContextBarTools}
          />

          <SubpageBreadcrumb
            crumbs={[{ label: districtName, to: `/district/${districtId}` }]}
          />

          <DistrictSubnav districtId={districtId} />

          <div className="space-y-4 sm:space-y-6">
            {datesError && allClubs.length === 0 ? (
              // #2636 — the date index failed to load, so the clubs query
              // never ran. That is a failed request, not "no clubs". Gated on
              // emptiness (spec §7) so a failed REFRESH never wipes rows that
              // are already on screen; that case is the inline note below.
              <ErrorDisplay
                error={datesError as Error}
                title="Failed to Load Clubs"
                subject="the clubs list"
                onRetry={() => {
                  refetchDates()
                }}
              />
            ) : isError && allClubs.length === 0 ? (
              // #1104 — a fetch reject must surface a retryable error state,
              // not silently render an empty ClubsTable (`allClubs` falls back
              // to `[]` on error). Gated on emptiness so a background refetch
              // error never wipes already-rendered rows.
              <ErrorDisplay
                error={error ?? 'Failed to load clubs data'}
                title="Failed to Load Clubs"
                subject="the clubs list"
                onRetry={() => {
                  refetch()
                }}
                showDetails={true}
              />
            ) : (
              <>
                {refreshError != null &&
                  refreshError !== dismissedRefreshError &&
                  allClubs.length > 0 && (
                    <div
                      className="dt-refresh-note"
                      role="status"
                      aria-label="Couldn't refresh"
                    >
                      <span>
                        Couldn&apos;t refresh. The clubs shown may be out of
                        date.
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (datesError) refetchDates()
                          else refetch()
                        }}
                      >
                        Retry
                      </button>
                      <button
                        type="button"
                        onClick={() => setDismissedRefreshError(refreshError)}
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                {/* While the date index or the analytics are pending the panel
                    is already here, with a skeleton sized to the columns, so
                    the toolbar does not arrive later and push the table down
                    (spec §7, CLS). */}
                <ClubsTable
                  clubs={allClubs}
                  districtId={districtId}
                  isLoading={isLoading || isClubsPending}
                  dataDate={effectiveEndDate ?? undefined}
                  clubLinkState={{ fromClubsSearch: location.search }}
                  initialSortField={initialSortField}
                  initialSortDirection={initialSortDir}
                  onSortChange={handleSortChange}
                  initialFilterState={initialFilterState}
                  onFilterChange={handleFilterChange}
                  initialPresetActive={initialPresetActive}
                  onPresetChange={handlePresetChange}
                  snapshotDiff={snapshotDiff}
                  programYear={effectiveProgramYear?.label}
                  openGroups={openGroups}
                  onOpenGroupsChange={setOpenGroups}
                  compactToolbarTarget={contextBarTools}
                  sinceLastYear={{
                    mode: sinceMode,
                    onModeChange: handleSinceModeChange,
                    prior: priorYear.data,
                    isError: priorYear.isError,
                  }}
                />
                {!isClubsPending && (
                  <ProspectiveClubsPanel clubs={analytics?.prospectiveClubs} />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}

export default DistrictClubsPage
