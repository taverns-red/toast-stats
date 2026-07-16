import React, { useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useDistricts } from '../hooks/useDistricts'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useDistrictCachedDates } from '../hooks/useDistrictData'
import {
  useDistrictAnalytics,
  type ClubTrend,
} from '../hooks/useDistrictAnalytics'
import { useUrlProgramYear } from '../hooks/useUrlProgramYear'
import {
  getAvailableProgramYears,
  filterDatesByProgramYear,
  getMostRecentDateInProgramYear,
  isDateInProgramYear,
} from '../utils/programYear'
import { parseColorMode, type GridColorMode } from '../utils/clubGridColor'
import { DistrictDetailHeader } from '../components/DistrictDetailHeader'
import { SubpageBreadcrumb } from '../components/SubpageBreadcrumb'
import { DistrictSubnav } from '../components/DistrictSubnav'
import { ClubGridTile } from '../components/ClubGridTile'
import { ClubGridLegend } from '../components/ClubGridLegend'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import ErrorBoundary from '../components/ErrorBoundary'

/* District Grid Page (#1230, epic #1228 Sprint 2).
   The at-a-glance "Chiclet / LEO board": one colour-coded tile per club, the
   whole district on one screen — the view TI's dashboards structurally can't
   do. Tiles colour by club health (default) or Distinguished tier, toggled via
   a URL-synced `?color=health|tier` param. Reuses the same program-year/date
   scaffolding as the other district subpages and the pre-computed
   `useDistrictAnalytics().allClubs` feed (no new pipeline work — R7). */

interface AreaGroup {
  areaId: string
  areaName: string
  clubs: ClubTrend[]
}

interface DivisionGroup {
  divisionId: string
  divisionName: string
  areas: AreaGroup[]
}

/** Natural-ish sort that keeps numeric ids/areas in order ("Area 2" < "Area 10")
 *  and pushes blank labels (unassigned) to the end. */
function compareLabel(a: string, b: string): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

/** Group clubs Division → Area, each level sorted; clubs sorted by name. The
 *  grid OWNS this ordering rather than leaning on the hook's incidental order
 *  (L138 — a view that renders correctly only because an upstream sorts that
 *  way should pin its own order). */
function groupByDivisionArea(clubs: ClubTrend[]): DivisionGroup[] {
  const divisions = new Map<string, DivisionGroup>()

  for (const club of clubs) {
    const divKey = club.divisionId || club.divisionName || ''
    let division = divisions.get(divKey)
    if (!division) {
      division = {
        divisionId: divKey,
        divisionName: club.divisionName || 'Unassigned',
        areas: [],
      }
      divisions.set(divKey, division)
    }
    const areaKey = club.areaId || club.areaName || ''
    let area = division.areas.find(a => a.areaId === areaKey)
    if (!area) {
      area = {
        areaId: areaKey,
        areaName: club.areaName || 'Unassigned',
        clubs: [],
      }
      division.areas.push(area)
    }
    area.clubs.push(club)
  }

  const result = [...divisions.values()]
  result.sort((a, b) => compareLabel(a.divisionName, b.divisionName))
  for (const division of result) {
    division.areas.sort((a, b) => compareLabel(a.areaName, b.areaName))
    for (const area of division.areas) {
      area.clubs.sort((a, b) => compareLabel(a.clubName, b.clubName))
    }
  }
  return result
}

const DistrictGridPage: React.FC = () => {
  const { districtId } = useParams<{ districtId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  // `?color` is URL-seedable, so the whitelist lives at the parse where every
  // entry path (typed URL, shared link, back button, toggle click) converges —
  // never on the toggle handler alone (L124/144 / R17).
  const colorMode = parseColorMode(searchParams.get('color'))

  const setColorMode = (mode: GridColorMode) => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev)
        // 'health' is the default — keep the URL clean by omitting it.
        if (mode === 'health') next.delete('color')
        else next.set('color', mode)
        return next
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

  const { data: analytics, isLoading } = useDistrictAnalytics(
    hasValidDates ? districtId || null : null,
    effectiveProgramYear?.startDate,
    effectiveEndDate ?? undefined
  )

  const allClubs = useMemo(() => analytics?.allClubs ?? [], [analytics])
  const divisions = useMemo(() => groupByDivisionArea(allClubs), [allClubs])

  const rawName = selectedDistrict?.name || districtId || ''
  const districtName = /^\d+$/.test(rawName) ? `District ${rawName}` : rawName
  useDocumentTitle(districtName ? `${districtName} Club Grid` : null)

  const availableDates = cachedDatesInProgramYear.sort((a, b) =>
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

          <div className="club-grid-page">
            <header className="club-grid-page__intro">
              <h2 className="club-grid-page__title">Club Grid</h2>
              <p className="club-grid-page__subtitle">
                Every club at a glance, grouped by division and area. Each tile
                links to the club. Colour by{' '}
                {colorMode === 'tier' ? 'Distinguished tier' : 'club health'}.
              </p>
            </header>

            <div className="club-grid-page__controls">
              <div
                className="club-grid-toggle"
                role="group"
                aria-label="Colour tiles by"
              >
                <span
                  className="club-grid-toggle__label"
                  id="club-grid-color-label"
                >
                  Colour by
                </span>
                <button
                  type="button"
                  className="club-grid-toggle__btn"
                  aria-pressed={colorMode === 'health'}
                  aria-describedby="club-grid-color-label"
                  onClick={() => setColorMode('health')}
                >
                  Health
                </button>
                <button
                  type="button"
                  className="club-grid-toggle__btn"
                  aria-pressed={colorMode === 'tier'}
                  aria-describedby="club-grid-color-label"
                  onClick={() => setColorMode('tier')}
                >
                  Distinguished tier
                </button>
              </div>

              <ClubGridLegend colorMode={colorMode} />
            </div>

            {isLoading && allClubs.length === 0 ? (
              <LoadingSkeleton variant="card" />
            ) : divisions.length === 0 ? (
              <p className="club-grid-page__empty">
                No clubs to display for this district and date.
              </p>
            ) : (
              <div className="club-grid-divisions">
                {divisions.map(division => (
                  <section
                    key={division.divisionId || division.divisionName}
                    className="club-grid-division"
                    aria-label={division.divisionName}
                  >
                    <h3 className="club-grid-division__title">
                      {division.divisionName}
                    </h3>
                    {division.areas.map(area => (
                      <div
                        key={area.areaId || area.areaName}
                        className="club-grid-area"
                      >
                        <h4 className="club-grid-area__title">
                          {area.areaName}
                        </h4>
                        <div className="club-grid-tiles">
                          {area.clubs.map(club => (
                            <ClubGridTile
                              key={club.clubId}
                              club={club}
                              districtId={districtId}
                              colorMode={colorMode}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}

export default DistrictGridPage
