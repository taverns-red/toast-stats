import React, { useMemo, useState } from 'react'
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
import { buildPinFeatures } from '../components/map/pinLayer'
import {
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

const MapFilterPanel = React.lazy(
  () => import('../components/map/MapFilterPanel')
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

/** The colour-mode toggles (#1784): aria-pressed buttons, not tabs. The
 *  phone picker adds a swatch preview per mode (`preview`, from its own
 *  on-demand chunk). */
export const ModeButtons: React.FC<{
  mode: MapColorMode
  onChange: (m: MapColorMode) => void
  preview?: (m: MapColorMode) => React.ReactNode
}> = ({ mode, onChange, preview }) => (
  <div className="map-modes" role="group" aria-label="Colour pins by">
    {MAP_COLOR_MODES.map(m => (
      <button
        key={m.id}
        type="button"
        className="map-modes__btn"
        aria-pressed={mode === m.id}
        onClick={() => onChange(m.id)}
      >
        {preview?.(m.id)}
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
  // Visit / online filtering lives in the on-demand filter chunk, which
  // hands its filter up once ready (with the visit snapshot when a round is
  // asked for); until then a filtered deep link draws nothing rather than
  // the unfiltered set.
  const wantsFilters = searchParams.has('visit') || searchParams.has('online')
  const [mapFilter, setMapFilter] = useState<MapFilter | null>(null)
  const filtering = wantsFilters && !mapFilter
  const applyAll = React.useCallback(
    (clubs: typeof allClubs, params: URLSearchParams) => {
      const out = applyFacets(clubs, params)
      return mapFilter ? mapFilter(out, params) : out
    },
    [mapFilter]
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
                      ariaLabel={`Club map, coloured by ${sandbox ? 'proposed area' : modeLabel.toLowerCase()}`}
                      onReady={setMap}
                      cooperativeGestures={false}
                    />
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
                modes={preview => (
                  <ModeButtons
                    mode={mode}
                    onChange={setMode}
                    preview={preview}
                  />
                )}
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
