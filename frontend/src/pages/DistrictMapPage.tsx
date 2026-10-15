import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { clubIdsMatch } from '@taverns-red/shared-contracts'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { MapFilter } from '../components/map/MapFilterPanel'
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
import LazyBasemapMap from '../components/map/LazyBasemapMap'
import { useClubPins } from '../components/map/useClubPins'
import {
  CLUSTER_LAYER_ID,
  PIN_LAYER_ID,
  PIN_SOURCE_ID,
  buildPinFeatures,
} from '../components/map/pinLayer'
import {
  EXTENDED_FACET_PARAMS,
  MAP_COLOR_MODES,
  activeMapFilterCount,
  applyFacets,
  buildModeModel,
  isLazyMode,
  isTerritoryMode,
  facetValues,
  legendChips,
  parseMapColorMode,
  toggleFacetValue,
  type ExtendedMode,
  type LegendChip,
  type MapColorMode,
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

// The legend chips and club lists are data-dependent: their chunk is fetched on mount, in
// parallel with the data, not on the route's first load.
const loadLists = () => import('../components/map/MapClubLists')
const MapLists = React.lazy(() =>
  loadLists().then(m => ({ default: m.MapLists }))
)
const ClubRows = React.lazy(() =>
  loadLists().then(m => ({ default: m.ClubRows }))
)
// The legend chips carry data counts, so they ride the same chunk.
const Chips = React.lazy(() =>
  loadLists().then(m => ({ default: m.LegendChips }))
)

// So do the empty states: no locations for the date, or no map (WebGL).
const MapEmpty = React.lazy(() =>
  loadLists().then(m => ({ default: m.MapEmpty }))
)

// #1943: the static club preview shown while MapLibre loads. Its own small
// chunk, fetched on mount with the data, never on the map's critical path.
const loadPreview = () => import('../components/map/MapPreview')
const MapPreview = React.lazy(loadPreview)

const MapFilterPanel = React.lazy(
  () => import('../components/map/MapFilterPanel')
)

// The grouped mode picker (#1787): the phone sheet's and the desktop
// popover's, fetched on mount.
const loadPicker = () => import('../components/map/MapModePicker')
const ModePopover = React.lazy(() =>
  loadPicker().then(m => ({ default: m.ModePopover }))
)

// Phones only: the mode picker, legend and club sheets (fetched on mount).
const MapPhoneSheets = React.lazy(
  () => import('../components/map/MapPhoneSheets')
)

// The realignment sandbox (#1819): only with ?sandbox=1.
const Realign = React.lazy(
  () => import('../components/map/realign/RealignSandbox')
)

// The keyboard path between pins (#1940), once the map is up.
const PinKeys = React.lazy(() => import('../components/map/MapPinKeys'))

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

/** "Colour pins by" in words for the map's label: "club health", "TI club
 *  status", "DCP goals". */
const lowerFirst = (l: string) =>
  /^[A-Z][a-z]/.test(l) ? l[0]!.toLowerCase() + l.slice(1) : l

/** The quick toggle beside the picker at ≥ 1024 (spec §5): the default
 *  and the runner-up, one tap away. aria-pressed buttons, not tabs. */
const QuickModes: React.FC<{
  mode: MapColorMode
  onChange: (m: MapColorMode) => void
}> = ({ mode, onChange }) => (
  <div
    className="map-modes map-modes--quick"
    role="group"
    aria-label="Quick colour"
  >
    {MAP_COLOR_MODES.slice(0, 2).map(m => (
      <button
        key={m.id}
        type="button"
        className="map-modes__btn"
        aria-pressed={mode === m.id}
        onClick={() => onChange(m.id)}
      >
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
  const sandbox = searchParams.has('sandbox')
  const isPhone = useIsMobile()
  const theme = useDarkMode().isDark ? 'dark' : 'light'
  const [map, setMap] = useState<MapLibreMap | null>(null)
  // #1843 — `?club=<id>` (the club page's mini-map link) opens that club
  // as the initial selection. Ids are matched in any form (zero-padded or
  // not) through `selected` below, and closing the summary clears it.
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const linked = searchParams.get('club')
    return linked ? [linked] : []
  })
  const [sheet, setSheet] = useState<'legend' | 'modes' | 'filters' | null>(
    null
  )
  const filtersOpen = sheet === 'filters'
  const modesOpen = sheet === 'modes'
  const modePill = React.useRef<HTMLButtonElement>(null)
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
  // The renewals / CSP / officer / coach / awards modes read the reports
  // sidecar the analytics query already fetched for this date (#1787).
  const reports = analytics?.districtReports ?? null
  // Division and area load after the first render (a split chunk); until
  // then a territory deep link draws no pins rather than the wrong colours.
  const [territory, setTerritory] = useState<
    typeof import('../components/map/pinTerritory') | null
  >(null)
  // So do the extended modes (#1787): status, members, growth, DCP, age,
  // and the reports-sidecar modes.
  const [extended, setExtended] = useState<
    typeof import('../components/map/pinExtended') | null
  >(null)
  React.useEffect(() => {
    void import('../components/map/pinTerritory').then(setTerritory)
    void import('../components/map/pinExtended').then(setExtended)
    void loadLists()
    void loadPreview()
    void loadPicker()
  }, [])
  const pending =
    isLazyMode(mode) && !(isTerritoryMode(mode) ? territory : extended)
  // Club age is measured at the viewed date, passed down (R3).
  const viewedDate = effectiveEndDate ?? ''
  const model = useMemo(() => {
    if (pending || !isLazyMode(mode))
      return buildModeModel(mode === 'tier' ? 'tier' : 'health')
    return isTerritoryMode(mode)
      ? territory!.territoryModel(mode, allClubs)
      : extended!.extendedModel(mode as ExtendedMode, viewedDate, reports)
  }, [mode, allClubs, territory, extended, pending, viewedDate, reports])
  // Visit / online filtering lives in the on-demand filter chunk, which
  // hands its filter up once ready (with the visit snapshot when a round is
  // asked for); until then a filtered deep link draws nothing rather than
  // the unfiltered set.
  const wantsFilters = searchParams.has('visit') || searchParams.has('online')
  const [mapFilter, setMapFilter] = useState<MapFilter | null>(null)
  // An extended mode's legend key (`?size=`, `?clubStatus=` …) waits for
  // its chunk too.
  const wantsExtended = EXTENDED_FACET_PARAMS.some(p => searchParams.has(p))
  const filtering = (wantsFilters && !mapFilter) || (wantsExtended && !extended)
  const applyAll = React.useCallback(
    (clubs: typeof allClubs, params: URLSearchParams) => {
      let out = applyFacets(clubs, params)
      if (extended)
        out = extended.applyExtendedFacets(out, params, viewedDate, reports)
      return mapFilter ? mapFilter(out, params) : out
    },
    [mapFilter, extended, viewedDate, reports]
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

  const selected = useMemo(
    () =>
      allClubs.filter(c => selectedIds.some(id => clubIdsMatch(c.clubId, id))),
    [allClubs, selectedIds]
  )
  const selectedClubIds = useMemo(() => selected.map(c => c.clubId), [selected])

  // #1967 — Enter on a pin opens the club in the side panel and focus
  // follows it there; Escape in the panel closes it and returns to the pin.
  // The phone sheet manages its own focus.
  const returnPin = useRef<HTMLElement | null>(null)
  const [focusSummary, setFocusSummary] = useState(false)
  const onPinOpen = useCallback(
    (pin: HTMLElement) => {
      if (isPhone) return
      returnPin.current = pin
      setFocusSummary(true)
    },
    [isPhone]
  )
  const summaryFocused = useCallback(() => setFocusSummary(false), [])
  const onSummaryKeyDown = (e: React.KeyboardEvent) => {
    const pin = returnPin.current
    if (e.key !== 'Escape' || !pin?.isConnected) return
    e.preventDefault()
    returnPin.current = null
    setSelectedIds([])
    pin.focus()
  }

  // The sandbox draws its own pins on this map.
  useClubPins(listView || sandbox ? null : map, {
    data,
    model,
    theme,
    selectedIds: selectedClubIds,
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

  const rawName = districtsData?.districts?.find(d => d.id === districtId)?.name
  const districtName = /^\d+$/.test(rawName || districtId)
    ? `District ${rawName || districtId}`
    : rawName || ''
  useDocumentTitle(districtName ? `${districtName} Club Map` : null)
  const modeLabel = MAP_COLOR_MODES.find(m => m.id === mode)!.label
  const closeModes = React.useCallback(() => setSheet(null), [setSheet])

  const legend = (limit?: number, onMore?: () => void) => (
    <div className="map-legend">
      <p className="map-legend__title">
        <strong>{pending ? modeLabel : model.title}</strong>
        {effectiveEndDate && <span> · as of {effectiveEndDate}</span>}
      </p>
      {pending ? null : (
        <React.Suspense fallback={<div className="map-legend__chips" />}>
          <Chips
            model={model}
            chips={chips}
            pressed={pressed}
            onToggle={toggleChip}
            limit={limit}
            onMore={onMore}
          />
        </React.Suspense>
      )}
    </div>
  )
  const lists = (
    <React.Suspense fallback={null}>
      <MapLists
        unmapped={unmapped}
        prospective={prospective}
        districtId={districtId}
        onSandbox={() => setSheet(null)}
      />
    </React.Suspense>
  )

  const filterPanel = (wantsFilters || filtersSeen) && (
    <React.Suspense fallback={null}>
      <MapFilterPanel
        clubs={allClubs}
        isPhone={isPhone}
        isOpen={filtersOpen}
        onClose={() => setSheet(null)}
        resultCount={filtered.length}
        districtId={districtId}
        date={effectiveEndDate}
        onFilter={setMapFilter}
      />
    </React.Suspense>
  )

  const listFallback = (
    <React.Suspense fallback={null}>
      <MapEmpty to={viewHref('list')} />
    </React.Suspense>
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
            <div className="map-modes-anchor">
              <button
                ref={modePill}
                type="button"
                className="map-pill"
                aria-haspopup={isPhone ? 'dialog' : undefined}
                aria-expanded={isPhone ? undefined : modesOpen}
                aria-controls={isPhone ? undefined : 'map-modes-pop'}
                onClick={() => setSheet(modesOpen ? null : 'modes')}
              >
                Colour: {modeLabel}
                <span aria-hidden="true"> ▾</span>
              </button>
              {!isPhone && modesOpen && (
                <React.Suspense fallback={null}>
                  <ModePopover
                    id="map-modes-pop"
                    mode={mode}
                    onChange={setMode}
                    onClose={closeModes}
                    trigger={modePill}
                  />
                </React.Suspense>
              )}
            </div>
            {!isPhone && <QuickModes mode={mode} onChange={setMode} />}
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
                <ClubRows
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
                  <React.Suspense fallback={null}>
                    <MapEmpty
                      onLatest={
                        availableProgramYears[0] &&
                        (() =>
                          setProgramYearAndDate(
                            availableProgramYears[0]!,
                            undefined
                          ))
                      }
                    />
                  </React.Suspense>
                ) : (
                  <MapErrorBoundary fallback={listFallback}>
                    <LazyBasemapMap
                      ariaLabel={`Club map, coloured by ${sandbox ? 'proposed area' : lowerFirst(modeLabel)}`}
                      onReady={setMap}
                      cooperativeGestures={false}
                    />
                    {/* Decorative: if its chunk fails, show nothing rather
                        than let the outer boundary drop the live map. */}
                    <MapErrorBoundary fallback={null}>
                      <React.Suspense fallback={null}>
                        <MapPreview clubs={allClubs} map={map} />
                      </React.Suspense>
                    </MapErrorBoundary>
                  </MapErrorBoundary>
                )}
                {map && !sandbox && !noLocation && !pending && (
                  <React.Suspense fallback={null}>
                    <PinKeys
                      map={map}
                      clubs={allClubs}
                      model={model}
                      selectedIds={selectedClubIds}
                      onSelect={setSelectedIds}
                      onOpen={onPinOpen}
                      layers={{
                        source: PIN_SOURCE_ID,
                        cluster: CLUSTER_LAYER_ID,
                        pin: PIN_LAYER_ID,
                      }}
                    />
                  </React.Suspense>
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
                      onKeyDown={onSummaryKeyDown}
                    >
                      <React.Suspense fallback={null}>
                        <MapClubSummary
                          clubs={selected}
                          districtId={districtId}
                          autoFocus={focusSummary}
                          onAutoFocused={summaryFocused}
                        />
                      </React.Suspense>
                    </section>
                  )}
                  {lists}
                </aside>
              )}
              {sandbox && (
                <React.Suspense fallback={null}>
                  <Realign
                    map={map}
                    clubs={allClubs}
                    districtId={districtId}
                    date={effectiveEndDate}
                    isPhone={isPhone}
                    theme={theme}
                    pins={useClubPins}
                    features={buildPinFeatures}
                  />
                </React.Suspense>
              )}
            </div>
          )}
        </section>

        {isPhone && (
          <>
            {filterPanel}
            <React.Suspense fallback={null}>
              <MapPhoneSheets
                sheet={sheet}
                onClose={() => setSheet(null)}
                mode={mode}
                onModeChange={setMode}
                legendTitle={model.title}
                legend={
                  <>
                    {legend()}
                    {lists}
                  </>
                }
                selectedCount={selected.length}
                summary={
                  <React.Suspense fallback={null}>
                    <MapClubSummary clubs={selected} districtId={districtId} />
                  </React.Suspense>
                }
                onDeselect={() => setSelectedIds([])}
              />
            </React.Suspense>
          </>
        )}
      </div>
    </div>
  )
}

export default DistrictMapPage
