import React, { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useDistricts } from '../hooks/useDistricts'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useDistrictCachedDates } from '../hooks/useDistrictData'
import { useDistrictAnalytics } from '../hooks/useDistrictAnalytics'
import { useDistrictStatistics } from '../hooks/useMembershipData'
import { useUrlProgramYear } from '../hooks/useUrlProgramYear'
import {
  getAvailableProgramYears,
  filterDatesByProgramYear,
  getMostRecentDateInProgramYear,
  isDateInProgramYear,
} from '../utils/programYear'
import { extractDivisionPerformance } from '../utils/extractDivisionPerformance'
import {
  buildActionList,
  formatCloseGap,
  formatVisitGap,
  type ActionListSections,
} from '../utils/actionListData'
import { arrayToCSV, downloadCSV, generateFilename } from '../utils/csvExport'
import { DistrictDetailHeader } from '../components/DistrictDetailHeader'
import { SubpageBreadcrumb } from '../components/SubpageBreadcrumb'
import { DistrictSubnav } from '../components/DistrictSubnav'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import ErrorBoundary from '../components/ErrorBoundary'

/* District Action List Page (#1231, epic #1228 Sprint 3 — the epic's close).
   RAFFETY's "Almost Distinguished" / "Area To-Do" reports made action-oriented
   and shareable: a deep-linkable destination scoped to a district (and
   filterable to a division/area via URL-synced `?division=`/`?area=`).

   Reuse-only (R7): every row comes from existing predicates via `buildActionList`
   — `isCloseToDistinguished` + `calculateClubProjection` for the gap, the
   deadline-aware `AreaPerformance.clubsMissingCurrentRoundVisit`/`currentRound`
   for visit gaps, and the club-health `currentStatus` for intervention. The page
   OWNS the scope state and passes it to the pure derivation (R3 / Lesson 124);
   the scope whitelist is irrelevant because an out-of-range slice simply yields
   empty sections (Lesson 144). */

interface ScopeOption {
  /** Division ids present in the snapshot, sorted. */
  divisions: string[]
  /** Area ids for the active division (or all areas when unscoped), sorted. */
  areas: string[]
}

function compareId(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

/** One action section: heading + count badge, then either the empty state or
 *  the caller-supplied list rows. The section/heading/count/empty scaffold is
 *  shared; the divergent `<li>` bodies are passed as children. */
const ActionListSection: React.FC<{
  id: string
  testId: string
  heading: string
  count: number
  emptyText: string
  children: React.ReactNode
}> = ({ id, testId, heading, count, emptyText, children }) => (
  <section
    className="action-list-section"
    aria-labelledby={id}
    data-testid={testId}
  >
    <h3 id={id} className="action-list-section__heading">
      {heading}
      <span className="action-list-section__count">{count}</span>
    </h3>
    {count === 0 ? (
      <p className="action-list-section__empty">{emptyText}</p>
    ) : (
      <ul className="action-list-items">{children}</ul>
    )}
  </section>
)

const DistrictActionListPage: React.FC = () => {
  const { districtId } = useParams<{ districtId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  // Scope is URL-seedable (typed URL, shared link, back button, select change),
  // so it is read at the single parse point every entry path converges on
  // (L124/144 / R17). An empty string is treated as "no filter".
  const division = searchParams.get('division') || undefined
  const area = searchParams.get('area') || undefined

  const setScope = (next: {
    division?: string | undefined
    area?: string | undefined
  }) => {
    setSearchParams(
      prev => {
        const params = new URLSearchParams(prev)
        if (next.division) params.set('division', next.division)
        else params.delete('division')
        if (next.area) params.set('area', next.area)
        else params.delete('area')
        return params
      },
      { replace: true }
    )
  }

  const {
    selectedProgramYear,
    setSelectedProgramYear,
    selectedDate,
    setSelectedDate,
  } = useUrlProgramYear()

  const { data: districtsData } = useDistricts()
  const selectedDistrict = districtsData?.districts?.find(
    d => d.id === districtId
  )

  const { data: cachedDatesData } = useDistrictCachedDates(districtId || '')
  const allCachedDates = useMemo(
    () => cachedDatesData?.dates || [],
    [cachedDatesData?.dates]
  )
  const availableProgramYears = useMemo(
    () => getAvailableProgramYears(allCachedDates),
    [allCachedDates]
  )

  React.useEffect(() => {
    if (availableProgramYears.length > 0) {
      const has = availableProgramYears.some(
        py => py.year === selectedProgramYear.year
      )
      if (!has) {
        const mostRecent = availableProgramYears[0]
        if (mostRecent) setSelectedProgramYear(mostRecent)
      }
    }
  }, [availableProgramYears, selectedProgramYear.year, setSelectedProgramYear])

  const cachedDatesInProgramYear = useMemo(
    () => filterDatesByProgramYear(allCachedDates, selectedProgramYear),
    [allCachedDates, selectedProgramYear]
  )

  const effectiveProgramYear = useMemo(() => {
    if (availableProgramYears.length === 0) return null
    const has = availableProgramYears.some(
      py => py.year === selectedProgramYear.year
    )
    if (has) return selectedProgramYear
    return availableProgramYears[0] ?? null
  }, [availableProgramYears, selectedProgramYear])

  const effectiveEndDate = useMemo(() => {
    if (!effectiveProgramYear) return null
    if (
      selectedDate &&
      isDateInProgramYear(selectedDate, effectiveProgramYear)
    ) {
      return selectedDate
    }
    const mostRecent = getMostRecentDateInProgramYear(
      allCachedDates,
      effectiveProgramYear
    )
    // null is unreachable here — effectiveProgramYear comes from
    // getAvailableProgramYears(allCachedDates). See getMostRecentDateInProgramYear
    // for why, and why a `|| endDate` fallback must not come back (#1323).
    return mostRecent
  }, [selectedDate, effectiveProgramYear, allCachedDates])

  const hasValidDates =
    effectiveProgramYear !== null && effectiveEndDate !== null

  const { data: analytics, isLoading: analyticsLoading } = useDistrictAnalytics(
    hasValidDates ? districtId || null : null,
    effectiveProgramYear?.startDate,
    effectiveEndDate ?? undefined
  )

  const { data: districtStatistics, isLoading: statsLoading } =
    useDistrictStatistics(
      hasValidDates ? districtId || null : null,
      effectiveEndDate ?? undefined,
      'divisions'
    )

  // The visit-round gate keys on the date this page pinned its snapshot query
  // to (#1321), never the wall clock.
  const divisionPerformance = useMemo(
    () =>
      districtStatistics && effectiveEndDate
        ? extractDivisionPerformance(districtStatistics, effectiveEndDate)
        : [],
    [districtStatistics, effectiveEndDate]
  )

  const sections = useMemo<ActionListSections>(() => {
    // buildActionList already returns empty sections for empty input, so no
    // separate no-data guard is needed — the `?? []` fallbacks make it safe.
    return buildActionList(
      {
        clubs: analytics?.allClubs ?? [],
        interventionClubs: analytics?.interventionRequiredClubs ?? [],
        divisions: divisionPerformance,
        snapshotDate: effectiveEndDate ?? '',
        // #1406 — the page owns the program-year selection; the recognition
        // ladder must not be re-derived downstream (R3).
        programYear: effectiveProgramYear?.label,
      },
      { division, area }
    )
  }, [
    analytics,
    divisionPerformance,
    effectiveEndDate,
    effectiveProgramYear,
    division,
    area,
  ])

  // Scope-select options come from the authoritative division/area structure.
  const scopeOptions = useMemo<ScopeOption>(() => {
    const divisions = [
      ...new Set(divisionPerformance.map(d => d.divisionId)),
    ].sort(compareId)
    const areaSource = division
      ? (divisionPerformance.find(d => d.divisionId === division)?.areas ?? [])
      : divisionPerformance.flatMap(d => d.areas)
    const areas = [...new Set(areaSource.map(a => a.areaId))].sort(compareId)
    return { divisions, areas }
  }, [divisionPerformance, division])

  const rawName = selectedDistrict?.name || districtId || ''
  const districtName = /^\d+$/.test(rawName) ? `District ${rawName}` : rawName
  useDocumentTitle(districtName ? `${districtName} Action List` : null)

  const availableDates = cachedDatesInProgramYear.sort((a, b) =>
    b.localeCompare(a)
  )

  const isLoading = analyticsLoading || statsLoading
  const totalItems =
    sections.closeToDistinguished.length +
    sections.visitGaps.length +
    sections.interventionRequired.length

  const handleExport = () => {
    if (!districtId) return
    const rows: (string | number)[][] = [
      ['Section', 'Division', 'Area', 'Item', 'Detail'],
    ]
    for (const c of sections.closeToDistinguished) {
      rows.push([
        'Close to Distinguished',
        c.divisionId,
        c.areaId,
        c.clubName,
        formatCloseGap(c),
      ])
    }
    for (const g of sections.visitGaps) {
      rows.push([
        'Missing club visits',
        g.divisionId,
        g.areaId,
        `Area ${g.areaId}`,
        formatVisitGap(g),
      ])
    }
    for (const i of sections.interventionRequired) {
      rows.push([
        'Intervention required',
        i.divisionId,
        i.areaId,
        i.clubName,
        'Club health: intervention required',
      ])
    }
    downloadCSV(arrayToCSV(rows), generateFilename('action-list', districtId))
  }

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
            onDateChange={setSelectedDate}
            availableDates={availableDates}
            latestSnapshotDate={
              cachedDatesData?.dateRange?.endDate ?? availableDates[0]
            }
          />

          <SubpageBreadcrumb
            crumbs={[{ label: districtName, to: `/district/${districtId}` }]}
          />

          <DistrictSubnav districtId={districtId} />

          <div className="action-list-page" data-testid="action-list-page">
            <header className="action-list-page__intro">
              <h2 className="action-list-page__title">Area Director Actions</h2>
              <p className="action-list-page__subtitle">
                Prioritized to-dos for this district: clubs within reach of
                Distinguished, areas with outstanding club visits, and clubs
                that need intervention. Filter to your division or area and
                share the link.
              </p>
            </header>

            <div className="action-list-page__controls">
              <div
                className="action-list-scope"
                role="group"
                aria-label="Scope"
              >
                <label className="action-list-scope__field">
                  <span className="action-list-scope__label">Division</span>
                  <select
                    className="action-list-scope__select"
                    value={division ?? ''}
                    onChange={e =>
                      // Changing division clears any area from a prior division.
                      setScope({ division: e.target.value || undefined })
                    }
                  >
                    <option value="">All divisions</option>
                    {scopeOptions.divisions.map(d => (
                      <option key={d} value={d}>
                        Division {d}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="action-list-scope__field">
                  <span className="action-list-scope__label">Area</span>
                  <select
                    className="action-list-scope__select"
                    value={area ?? ''}
                    onChange={e =>
                      setScope({
                        division,
                        area: e.target.value || undefined,
                      })
                    }
                  >
                    <option value="">All areas</option>
                    {scopeOptions.areas.map(a => (
                      <option key={a} value={a}>
                        Area {a}
                      </option>
                    ))}
                  </select>
                </label>

                {(division || area) && (
                  <button
                    type="button"
                    className="action-list-scope__clear"
                    onClick={() => setScope({})}
                  >
                    Clear filter
                  </button>
                )}
              </div>

              <button
                type="button"
                className="action-list-page__export"
                onClick={handleExport}
                disabled={totalItems === 0}
              >
                Export CSV
              </button>
            </div>

            {isLoading && totalItems === 0 ? (
              <LoadingSkeleton variant="table" count={3} />
            ) : (
              <div className="action-list-sections">
                <ActionListSection
                  id="action-close"
                  testId="section-close"
                  heading="Clubs close to Distinguished"
                  count={sections.closeToDistinguished.length}
                  emptyText="No clubs are within reach of Distinguished for this scope."
                >
                  {sections.closeToDistinguished.map(c => (
                    <li key={c.clubId} className="action-list-item">
                      <Link
                        className="action-list-item__link"
                        to={`/district/${districtId}/club/${c.clubId}`}
                      >
                        {c.clubName}
                      </Link>
                      <span className="action-list-item__meta">
                        {c.divisionId}/{c.areaId} · {formatCloseGap(c)}
                      </span>
                    </li>
                  ))}
                </ActionListSection>

                <ActionListSection
                  id="action-visits"
                  testId="section-visits"
                  heading="Areas missing club visits"
                  count={sections.visitGaps.length}
                  emptyText="Every area has completed the current round's club visits for this scope."
                >
                  {sections.visitGaps.map(g => (
                    <li
                      key={`${g.divisionId}-${g.areaId}`}
                      className="action-list-item"
                    >
                      <Link
                        className="action-list-item__link"
                        to={`/district/${districtId}/division/${g.divisionId}/area/${g.areaId}`}
                      >
                        Area {g.areaId}
                      </Link>
                      <span className="action-list-item__meta">
                        {formatVisitGap(g)}
                      </span>
                    </li>
                  ))}
                </ActionListSection>

                <ActionListSection
                  id="action-intervention"
                  testId="section-intervention"
                  heading="Clubs needing intervention"
                  count={sections.interventionRequired.length}
                  emptyText="No clubs are flagged intervention-required for this scope."
                >
                  {sections.interventionRequired.map(i => (
                    <li key={i.clubId} className="action-list-item">
                      <Link
                        className="action-list-item__link"
                        to={`/district/${districtId}/club/${i.clubId}`}
                      >
                        {i.clubName}
                      </Link>
                      <span className="action-list-item__meta">
                        {i.divisionId}/{i.areaId} · intervention required
                      </span>
                    </li>
                  ))}
                </ActionListSection>
              </div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}

export default DistrictActionListPage
