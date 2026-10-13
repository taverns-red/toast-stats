import React, { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { useDistricts } from '../hooks/useDistricts'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useDistrictCachedDates } from '../hooks/useDistrictData'
import { useDistrictAnalytics } from '../hooks/useDistrictAnalytics'
import { useUrlProgramYear } from '../hooks/useUrlProgramYear'
import { useIsMobile } from '../hooks/useIsMobile'
import { useDarkMode } from '../contexts/DarkModeContext'
import {
  getAvailableProgramYears,
  filterDatesByProgramYear,
  getMostRecentDateInProgramYear,
  isDateInProgramYear,
} from '../utils/programYear'
import { DistrictDetailHeader } from '../components/DistrictDetailHeader'
import { SubpageBreadcrumb } from '../components/SubpageBreadcrumb'
import { DistrictSubnav } from '../components/DistrictSubnav'
import { BottomSheet } from '../components/BottomSheet'
import LazyBasemapMap from '../components/map/LazyBasemapMap'
import { PinSwatch } from '../components/map/PinSwatch'
import { useClubPins } from '../components/map/useClubPins'
import { buildPinFeatures } from '../components/map/pinLayer'
import {
  CATEGORICAL8,
  MAP_COLOR_MODES,
  activeMapFilterCount,
  applyFacets,
  buildModeModel,
  isTerritoryMode,
  facetValues,
  legendChips,
  parseMapColorMode,
  toggleFacetValue,
  type LegendChip,
  type MapColorMode,
  type ModeModel,
} from '../components/map/pinModes'
import '../components/map/districtMap.css'

/* District club map (#1784, epic #1781): where are my clubs and which are
   struggling. A routed subpage (ADR-005) on the self-hosted basemap
   (ADR-016), pins coloured by one of the #1785 core modes — club health by
   default, Distinguished level one tap away, then division and area.

   URL state, so back and deep links work: `?color=` (health omitted),
   the Clubs-table filter keys `?status=` / `?distinguished=` /
   `?divisions=` / `?areas=` written by the legend chips, and `?view=list`
   — the full non-map equivalent. The PY/date scaffolding is the club
   grid's (R3: passed down, never re-derived from the response).

   Filters (#1788): `?visit=` / `?online=` with `?divisions=` / `?areas=`,
   composing with the mode and the legend keys. Their logic (and the raw
   snapshot the visit awards come from) loads only when the URL asks for
   them or Filters is first opened; their UI only on that first open. */

const CHIP_PEEK = 5

// The club lists are data-dependent: their chunk is fetched on mount, in
// parallel with the data, not on the route's first load.
const loadLists = () => import('../components/map/MapClubLists')
const MapLists = React.lazy(() =>
  loadLists().then(m => ({ default: m.MapLists }))
)
const ClubLinks = React.lazy(() =>
  loadLists().then(m => ({ default: m.ClubLinks }))
)

const loadFilters = () => import('../components/map/mapFilters')
const MapFilterPanel = React.lazy(
  () => import('../components/map/MapFilterPanel')
)
const FILTERS_ID = 'map-filters'

// Only a tap needs the club summary, so it loads on the first selection.
const MapClubSummary = React.lazy(() =>
  import('../components/map/MapClubSummary').then(m => ({
    default: m.MapClubSummary,
  }))
)

class MapErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  override state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

const Chips: React.FC<{
  model: ModeModel
  chips: LegendChip[]
  pressed: string[]
  onToggle: (chip: LegendChip) => void
  limit?: number | undefined
  onMore?: (() => void) | undefined
}> = ({ model, chips, pressed, onToggle, limit, onMore }) => {
  // The phone peek shows the top few; "N more" opens the full legend.
  const cut = limit !== undefined && chips.length > limit + 1
  const shown = cut ? chips.slice(0, limit) : chips
  return (
    <div
      className="map-legend__chips"
      role="group"
      aria-label={`${model.title} legend`}
    >
      {shown.map(chip => {
        const value = model.facet?.valueOf(chip) ?? chip.key
        return (
          <button
            key={chip.key}
            type="button"
            className="map-legend__chip"
            aria-pressed={pressed.includes(value)}
            onClick={() => onToggle(chip)}
          >
            <PinSwatch category={chip} />
            {chip.code && (
              <span className="map-legend__code">{chip.code}</span>
            )}{' '}
            <span>{chip.label}</span>{' '}
            <span className="map-legend__count">{chip.count}</span>
          </button>
        )
      })}
      {cut && (
        <button
          type="button"
          className="map-legend__chip map-legend__more"
          onClick={onMore}
        >
          {chips.length - shown.length} more
        </button>
      )}
    </div>
  )
}

const ModeButtons: React.FC<{
  mode: MapColorMode
  onChange: (m: MapColorMode) => void
  previews?: boolean
}> = ({ mode, onChange, previews }) => (
  <div className="map-modes" role="group" aria-label="Colour pins by">
    {MAP_COLOR_MODES.map(m => (
      <button
        key={m.id}
        type="button"
        className="map-modes__btn"
        aria-pressed={mode === m.id}
        onClick={() => onChange(m.id)}
      >
        {previews && (
          <span className="map-modes__preview" aria-hidden="true">
            {(m.id === 'health' || m.id === 'tier'
              ? buildModeModel(m.id).categories.slice(0, 5)
              : CATEGORICAL8.slice(0, 5).map(fill => ({
                  key: fill,
                  label: '',
                  fill,
                  shape: 'circle' as const,
                }))
            ).map(c => (
              <PinSwatch key={c.key} category={c} />
            ))}
          </span>
        )}
        {m.label}
      </button>
    ))}
  </div>
)

const DistrictMapPage: React.FC = () => {
  const { districtId = '' } = useParams<{ districtId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const mode = parseMapColorMode(searchParams.get('color'))
  const listView = searchParams.get('view') === 'list'
  const isPhone = useIsMobile()
  const { isDark } = useDarkMode()
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [sheet, setSheet] = useState<'legend' | 'modes' | 'filters' | null>(
    null
  )
  const filtersOpen = sheet === 'filters'
  const [filtersSeen, setFiltersSeen] = useState(false)
  const filterCount = activeMapFilterCount(searchParams)

  const {
    selectedProgramYear,
    setSelectedProgramYear,
    selectedDate,
    setSelectedDate,
    setProgramYearAndDate,
  } = useUrlProgramYear()
  const { data: districtsData } = useDistricts()
  const { data: cachedDatesData } = useDistrictCachedDates(districtId)
  const allCachedDates = useMemo(
    () => cachedDatesData?.dates || [],
    [cachedDatesData?.dates]
  )
  const availableProgramYears = useMemo(
    () => getAvailableProgramYears(allCachedDates),
    [allCachedDates]
  )
  const effectiveProgramYear = useMemo(
    () =>
      availableProgramYears.find(py => py.year === selectedProgramYear.year) ??
      availableProgramYears[0] ??
      null,
    [availableProgramYears, selectedProgramYear]
  )
  const effectiveEndDate = useMemo(() => {
    if (!effectiveProgramYear) return null
    if (selectedDate && isDateInProgramYear(selectedDate, effectiveProgramYear))
      return selectedDate
    return getMostRecentDateInProgramYear(allCachedDates, effectiveProgramYear)
  }, [selectedDate, effectiveProgramYear, allCachedDates])

  const { data: analytics } = useDistrictAnalytics(
    effectiveEndDate ? districtId : null,
    effectiveProgramYear?.startDate,
    effectiveEndDate ?? undefined
  )

  const allClubs = useMemo(() => analytics?.allClubs ?? [], [analytics])
  const prospective = analytics?.prospectiveClubs ?? []
  // Division and area load after the first render (a split chunk); until
  // then a territory deep link draws no pins rather than the wrong colours.
  const [territory, setTerritory] = useState<
    typeof import('../components/map/pinTerritory') | null
  >(null)
  React.useEffect(() => {
    void import('../components/map/pinTerritory').then(setTerritory)
    void loadLists()
  }, [])
  const pending = isTerritoryMode(mode) && !territory
  const model = useMemo(
    () =>
      isTerritoryMode(mode) && territory
        ? territory.territoryModel(mode, allClubs)
        : buildModeModel(isTerritoryMode(mode) ? 'health' : mode),
    [mode, allClubs, territory]
  )
  // Visit / online filtering loads on demand; until it (and, for a visit
  // round, the snapshot) lands, a filtered deep link draws nothing rather
  // than the unfiltered set.
  const wantsFilters = searchParams.has('visit') || searchParams.has('online')
  const [filters, setFilters] = useState<Awaited<
    ReturnType<typeof loadFilters>
  > | null>(null)
  React.useEffect(() => {
    if ((wantsFilters || filtersSeen) && !filters)
      void loadFilters().then(setFilters)
  }, [wantsFilters, filtersSeen, filters])
  const wantsVisits = !!filters?.needsVisitData(searchParams)
  const { data: visits } = useQuery({
    queryKey: ['mapVisits', districtId, effectiveEndDate],
    queryFn: () => filters!.loadVisitIndex(effectiveEndDate!, districtId),
    enabled: wantsVisits && !!effectiveEndDate,
    staleTime: 15 * 60 * 1000,
  })
  const filtering =
    wantsFilters && (!filters || (wantsVisits && visits === undefined))
  const applyAll = React.useCallback(
    (clubs: typeof allClubs, params: URLSearchParams) => {
      const out = applyFacets(clubs, params)
      return filters ? filters.applyMapFilters(out, params, visits) : out
    },
    [filters, visits]
  )
  const filtered = useMemo(
    () => (filtering ? [] : applyAll(allClubs, searchParams)),
    [allClubs, searchParams, applyAll, filtering]
  )
  const facetParam = model.facet?.param
  const chips = useMemo(() => {
    // Counts ignore this mode's own facet, so pressing a chip never
    // zeroes the others; they include clubs not on the map (spec §4.3).
    const others = new URLSearchParams(searchParams)
    if (facetParam) others.delete(facetParam)
    return legendChips(model, applyAll(allClubs, others))
  }, [model, allClubs, searchParams, facetParam, applyAll])
  const pressed = facetParam ? facetValues(searchParams, facetParam) : []
  const data = useMemo(
    () => buildPinFeatures(pending ? [] : filtered, model),
    [filtered, model, pending]
  )
  const unmapped = filtered.filter(c => !c.coordinates)
  const noLocation = allClubs.length > 0 && allClubs.every(c => !c.coordinates)

  useClubPins(listView ? null : map, {
    data,
    model,
    theme: isDark ? 'dark' : 'light',
    selectedIds,
    onSelect: setSelectedIds,
    fitKey: `${districtId}|${effectiveEndDate}`,
  })

  const setMode = (m: MapColorMode) => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev)
        if (m === 'health') next.delete('color')
        else next.set('color', m)
        return next
      },
      { replace: true }
    )
    setSheet(null)
  }
  const toggleChip = (chip: LegendChip) => {
    if (!model.facet) return
    const { param, valueOf } = model.facet
    setSearchParams(prev => toggleFacetValue(prev, param, valueOf(chip)), {
      replace: true,
    })
  }
  const toggleFilters = () => {
    setFiltersSeen(true)
    setSheet(filtersOpen ? null : 'filters')
  }
  const viewHref = (view: 'list' | null) => {
    const next = new URLSearchParams(searchParams)
    if (view) next.set('view', view)
    else next.delete('view')
    return { search: `?${next}` }
  }

  const selected = allClubs.filter(c => selectedIds.includes(c.clubId))
  const rawName = districtsData?.districts?.find(d => d.id === districtId)?.name
  const districtName = /^\d+$/.test(rawName || districtId)
    ? `District ${rawName || districtId}`
    : rawName || ''
  useDocumentTitle(districtName ? `${districtName} Club Map` : null)
  const modeLabel = MAP_COLOR_MODES.find(m => m.id === mode)!.label

  const legend = (limit?: number, onMore?: () => void) => (
    <div className="map-legend">
      <p className="map-legend__title">
        <strong>{pending ? modeLabel : model.title}</strong>
        {effectiveEndDate && <span> · as of {effectiveEndDate}</span>}
      </p>
      {pending ? null : (
        <Chips
          model={model}
          chips={chips}
          pressed={pressed}
          onToggle={toggleChip}
          limit={limit}
          onMore={onMore}
        />
      )}
      {!pending && model.kind !== 'categorical' && limit === undefined && (
        <p className="map-legend__note">
          Clusters show the{' '}
          {model.kind === 'ordinal' ? 'middle level' : 'most common status'}
          {model.exceptionKey
            ? '; a red square marks clusters with clubs needing intervention'
            : ''}
          .
        </p>
      )}
    </div>
  )
  const lists = (
    <React.Suspense fallback={null}>
      <MapLists
        unmapped={unmapped}
        prospective={prospective}
        districtId={districtId}
      />
    </React.Suspense>
  )

  const filterPanel = filtersSeen && (
    <React.Suspense fallback={null}>
      <MapFilterPanel
        clubs={allClubs}
        isPhone={isPhone}
        isOpen={filtersOpen}
        onClose={() => setSheet(null)}
        resultCount={filtered.length}
        visitsUnavailable={visits === null}
        id={FILTERS_ID}
      />
    </React.Suspense>
  )

  const listFallback = (
    <div className="district-map__empty">
      <p>The map can’t be shown on this device.</p>
      <Link to={viewHref('list')}>Show the clubs as a list</Link>
    </div>
  )

  return (
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
          availableDates={filterDatesByProgramYear(
            allCachedDates,
            selectedProgramYear
          ).sort((a, b) => b.localeCompare(a))}
          latestSnapshotDate={cachedDatesData?.dateRange?.endDate}
        />
        <SubpageBreadcrumb
          crumbs={[{ label: districtName, to: `/district/${districtId}` }]}
        />
        <DistrictSubnav districtId={districtId} />

        <section className="district-map" aria-label="Club map">
          <div className="district-map__toolbar">
            {isPhone ? (
              <button
                type="button"
                className="map-pill"
                aria-haspopup="dialog"
                onClick={() => setSheet('modes')}
              >
                Colour: {modeLabel}
                <span aria-hidden="true"> ▾</span>
              </button>
            ) : (
              <ModeButtons mode={mode} onChange={setMode} />
            )}
            <button
              type="button"
              className="map-pill"
              aria-haspopup={isPhone ? 'dialog' : undefined}
              aria-expanded={filtersOpen}
              aria-label={
                filterCount ? `Filters, ${filterCount} active` : 'Filters'
              }
              onClick={toggleFilters}
            >
              Filters
              {filterCount > 0 && (
                <span className="map-pill__badge">{filterCount}</span>
              )}
            </button>
            <Link className="map-pill" to={viewHref(listView ? null : 'list')}>
              {listView ? 'Map view' : 'List view'}
            </Link>
          </div>
          <p role="status" className="sr-only">
            {filtering
              ? 'Filtering clubs…'
              : `Showing ${filtered.length} of ${allClubs.length} clubs`}
          </p>

          {listView ? (
            <div className="district-map__listview">
              {!isPhone && filterPanel}
              {legend()}
              <React.Suspense fallback={null}>
                <ClubLinks
                  clubs={[...filtered].sort((a, b) =>
                    a.clubName.localeCompare(b.clubName)
                  )}
                  districtId={districtId}
                  model={pending ? undefined : model}
                  label="Clubs"
                />
              </React.Suspense>
            </div>
          ) : (
            <div className="district-map__body">
              <div className="district-map__canvas">
                {noLocation ? (
                  <div className="district-map__empty">
                    <p>
                      <strong>No location data for this date</strong>
                    </p>
                    <p>
                      This snapshot has no club locations. The list view still
                      has every club.
                    </p>
                    {availableProgramYears[0] && (
                      <button
                        type="button"
                        className="map-pill"
                        onClick={() =>
                          setProgramYearAndDate(
                            availableProgramYears[0]!,
                            undefined
                          )
                        }
                      >
                        Latest date
                      </button>
                    )}
                  </div>
                ) : (
                  <MapErrorBoundary fallback={listFallback}>
                    <LazyBasemapMap
                      ariaLabel={`Club map, coloured by ${modeLabel.toLowerCase()}`}
                      onReady={setMap}
                      cooperativeGestures={false}
                    />
                  </MapErrorBoundary>
                )}
                {isPhone && (
                  <div className="district-map__peek">
                    {legend(CHIP_PEEK, () => setSheet('legend'))}
                    <button
                      type="button"
                      className="map-pill"
                      onClick={() => setSheet('legend')}
                    >
                      Legend and lists
                    </button>
                  </div>
                )}
              </div>
              {!isPhone && (
                <aside className="map-panel" aria-label="Map legend and lists">
                  {filterPanel}
                  {legend()}
                  {selected.length > 0 && (
                    <section
                      className="map-panel__section"
                      aria-label="Selected club"
                    >
                      <React.Suspense fallback={null}>
                        <MapClubSummary
                          clubs={selected}
                          districtId={districtId}
                        />
                      </React.Suspense>
                    </section>
                  )}
                  {lists}
                </aside>
              )}
            </div>
          )}
        </section>

        {isPhone && (
          <>
            {filterPanel}
            <BottomSheet
              isOpen={sheet === 'modes'}
              onClose={() => setSheet(null)}
              title="Colour pins by"
            >
              <ModeButtons mode={mode} onChange={setMode} previews />
            </BottomSheet>
            <BottomSheet
              isOpen={sheet === 'legend'}
              onClose={() => setSheet(null)}
              title={model.title}
            >
              {legend()}
              {lists}
            </BottomSheet>
            <BottomSheet
              isOpen={selected.length > 0 && sheet === null}
              onClose={() => setSelectedIds([])}
              title={selected.length > 1 ? 'Clubs here' : 'Club details'}
              closeLabel="Close club details"
            >
              <React.Suspense fallback={null}>
                <MapClubSummary clubs={selected} districtId={districtId} />
              </React.Suspense>
            </BottomSheet>
          </>
        )}
      </div>
    </div>
  )
}

export default DistrictMapPage
