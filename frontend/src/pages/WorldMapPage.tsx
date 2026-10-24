import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { clubIdsMatch } from '@taverns-red/shared-contracts'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { useProgramYearControls } from '../hooks/useProgramYearControls'
import { useWorldClubs } from '../hooks/useWorldClubs'
import { useIsMobile } from '../hooks/useIsMobile'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useDarkMode } from '../contexts/DarkModeContext'
import type { ClubTrend } from '../hooks/useDistrictAnalytics'
import { RollupPageShell } from '../components/rollups/RollupPageShell'
import LazyBasemapMap from '../components/map/LazyBasemapMap'
// #2248: eager, not a lazy chunk. It is ~0.6 KB gzip, and a lazy first
// render suspends and pays React's 300 ms Suspense reveal throttle.
import OnlineClubsChip from '../components/map/OnlineClubsChip'
import { useClubPins } from '../components/map/useClubPins'
import MapViewControls from '../components/map/MapViewControls'
import {
  CLUSTER_LAYER_ID,
  PIN_LAYER_ID,
  PIN_SOURCE_ID,
  buildPinFeatures,
} from '../components/map/pinFeatures'
import {
  buildModeModel,
  facetValues,
  legendChips,
  toggleFacetValue,
  type LegendChip,
  type MapColorMode,
} from '../components/map/pinModes'
import {
  WORLD_COLOR_MODES,
  isRegionLazyMode,
  isWorldTerritoryMode,
  parseWorldColorMode,
} from '../components/map/regionModes'
import {
  REGION_METRICS,
  parseRegionMetric,
  searchRegionClubs,
  sortRegionClubs,
  wantsExtendedFilters,
  type RegionClub,
  type RegionMetric,
} from '../utils/regionClubs'
import {
  WORLD_FILTER_PARAMS,
  activeWorldFilterCount,
  applyWorldFilters,
  mergeWorldShards,
  needsWorldShards,
  onlineOnlyClubs,
  worldRegionLabel,
  worldShardKeys,
  worldSummary,
  worldTopClubs,
} from '../utils/worldClubs'
import '../components/map/districtMap.css'
import './regionMap.css'

/* World club explorer (#1809, epic #1781): every club in the world on one
   clustered map, a world summary, a top-50 list by the selected metric and
   search. A routed subpage of /regions (ADR-005), built on the region
   explorer (#1808): the same map stack, list and filter sheet.

   Load strategy (the perf ACs): world.json (~8 KB gz) renders the summary
   and the top-50 list with no shard. The region shards are fetched in
   parallel only when the page needs every club — the desktop map, the
   phone's map, a search, a filter or a territory colour mode — and
   `?region=` fetches only those regions. The map is one clustered GeoJSON
   source of symbol layers (cluster radius 20, max zoom 13): no DOM per pin,
   and no static dot preview (15k SVG dots would be exactly that).

   URL state, so back and deep links work: `?q=`, `?sort=` (membership
   omitted), `?color=` (health omitted), the filters `?region=` /
   `?district=` / `?status=` / `?size=` and the legend keys, `?view=map`
   (the phone's full-screen map). PY and date are the page's controls,
   passed down (R3).

   Online-only clubs (#2174) get no pin; the legend's "N online clubs" chip
   lists them. Accessibility: the ranked list is the screen-reader
   alternative to the map. */

// Data-dependent pieces load on mount, in parallel with world.json, not on
// the route's first load (the map route's 300 KB budget, ADR-016 D2).
const loadModels = () => import('../components/map/worldModels')
const loadList = () => import('../components/map/RegionClubList')
const ClubList = React.lazy(loadList)
const loadSearch = () => import('../components/ClubSearchBox')
const ClubSearchBox = React.lazy(loadSearch)
const Chips = React.lazy(() =>
  import('../components/map/MapClubLists').then(m => ({
    default: m.LegendChips,
  }))
)
const ModePopover = React.lazy(() =>
  import('../components/map/MapModePicker').then(m => ({
    default: m.ModePopover,
  }))
)
const MapPhoneSheets = React.lazy(
  () => import('../components/map/MapPhoneSheets')
)
const PinKeys = React.lazy(() => import('../components/map/MapPinKeys'))
const MapClubSummary = React.lazy(() =>
  import('../components/map/MapClubSummary').then(m => ({
    default: m.MapClubSummary,
  }))
)
const FilterSheet = React.lazy(() =>
  import('../components/filters/FilterSheet').then(m => ({
    default: m.FilterSheet,
  }))
)
const FilterFacetGroups = React.lazy(() =>
  import('../components/filters/FilterSheet').then(m => ({
    default: m.FilterFacetGroups,
  }))
)

const SIZE_OPTIONS = [
  { value: '0-7', label: '0–7 members' },
  { value: '8-11', label: '8–11 members' },
  { value: '12-19', label: '12–19 members' },
  { value: '20-29', label: '20–29 members' },
  { value: '30plus', label: '30 or more' },
]
const STATUS_OPTIONS = [
  { value: 'thriving', label: 'Thriving' },
  { value: 'vulnerable', label: 'Vulnerable' },
  { value: 'intervention', label: 'Intervention required' },
]

const nf = new Intl.NumberFormat('en-US')

const districtOf = (c: ClubTrend) => (c as RegionClub).districtId

/** Reserved slot while world.json loads, so nothing shifts (Lesson 107). */
const ExplorerSkeleton: React.FC = () => (
  <div aria-busy="true" data-testid="world-map-skeleton">
    <ul className="rollup-kpis region-map__summary" aria-hidden="true">
      {['Clubs', 'Districts', 'Need intervention'].map(l => (
        <li key={l} className="rollup-kpi">
          <span className="rollup-kpi__label">{l}</span>
          <span className="rollup-kpi__value">—</span>
        </li>
      ))}
    </ul>
    <div className="region-map__skeleton-body" />
  </div>
)

const WorldMapPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const controls = useProgramYearControls()
  const date = controls.effectiveDate
  const isPhone = useIsMobile()
  const theme = useDarkMode().isDark ? 'dark' : 'light'
  useDocumentTitle('World Club Map')

  const mode = parseWorldColorMode(searchParams.get('color'))
  const metric = parseRegionMetric(searchParams.get('sort'))
  const query = searchParams.get('q') ?? ''
  const mapOpen = searchParams.get('view') === 'map'
  const showMap = !isPhone || mapOpen

  const wantShards = needsWorldShards({
    params: searchParams,
    query,
    mapOpen,
    isPhone,
    lazyMode: isWorldTerritoryMode(mode),
  })
  const {
    world,
    isLoading,
    isError,
    refetch,
    shardKeys,
    shards,
    clubsReady,
    failedShards,
    retryShards,
  } = useWorldClubs(date, searchParams.get('region') ?? '', wantShards)

  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [sheet, setSheet] = useState<'legend' | 'modes' | 'filters' | null>(
    null
  )
  const modePill = useRef<HTMLButtonElement>(null)
  const modesOpen = sheet === 'modes'
  const filtersOpen = sheet === 'filters'

  // The filter pipeline (R11): original → filtered → searched → sorted.
  const [models, setModels] = useState<Awaited<
    ReturnType<typeof loadModels>
  > | null>(null)
  useEffect(() => {
    void loadModels().then(setModels)
    void loadList()
    void loadSearch()
  }, [])
  const pending = isRegionLazyMode(mode) && !models
  const filtering = wantsExtendedFilters(searchParams) && !models

  // Every club once the wanted shards have settled: the map is built once,
  // not once per shard. Until then — and on a phone that never needs them —
  // the list is the pipeline's top-50 seed for the metric.
  const allClubs = useMemo(
    () => (clubsReady ? mergeWorldShards(shards) : []),
    [clubsReady, shards]
  )
  const seeded = !clubsReady
  const extended = models?.applyWorldExtendedFacets
  const filtered = useMemo(
    () =>
      filtering ? [] : applyWorldFilters(allClubs, searchParams, extended),
    [allClubs, searchParams, extended, filtering]
  )
  const searched = useMemo(
    () => searchRegionClubs(filtered, query),
    [filtered, query]
  )
  const sorted = useMemo(
    () =>
      seeded ? worldTopClubs(world, metric) : sortRegionClubs(searched, metric),
    [seeded, world, searched, metric]
  )
  const summary = useMemo(
    () => (world ? worldSummary(world, searchParams) : null),
    [world, searchParams]
  )
  // Online-only clubs get no pin (#2174); the legend lists them instead.
  const online = useMemo(() => onlineOnlyClubs(filtered), [filtered])

  const model = useMemo(
    () =>
      models && isRegionLazyMode(mode)
        ? models.worldModel(mode, allClubs)
        : buildModeModel(mode === 'tier' ? 'tier' : 'health'),
    [mode, allClubs, models]
  )
  const facetParam = model.facet?.param
  const chips = useMemo(() => {
    // Counts ignore this mode's own key, so pressing a chip never zeroes
    // the others; they include clubs not on the map (spec §4.3).
    const others = new URLSearchParams(searchParams)
    if (facetParam) others.delete(facetParam)
    return legendChips(model, applyWorldFilters(allClubs, others, extended))
  }, [model, allClubs, searchParams, facetParam, extended])
  const pressed = facetParam ? facetValues(searchParams, facetParam) : []
  const pins = useMemo(
    () => buildPinFeatures(pending ? [] : searched, model),
    [searched, model, pending]
  )

  const selected = useMemo(
    () =>
      selectedIds.length === 0
        ? []
        : allClubs.filter(c =>
            selectedIds.some(id => clubIdsMatch(c.clubId, id))
          ),
    [allClubs, selectedIds]
  )
  const selectedClubIds = useMemo(() => selected.map(c => c.clubId), [selected])
  const { resetView } = useClubPins(showMap ? map : null, {
    data: pins,
    model,
    theme,
    selectedIds: selectedClubIds,
    onSelect: setSelectedIds,
    fitKey: `world|${shardKeys.join(',')}|${date ?? ''}|${mapOpen}|${clubsReady}`,
  })

  // One URL write per handler (Lesson: two URL-state hooks lose a facet).
  const write = useCallback(
    (edit: (next: URLSearchParams) => void) =>
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev)
          edit(next)
          return next
        },
        { replace: true }
      ),
    [setSearchParams]
  )
  const setMetric = (m: RegionMetric) =>
    write(p => (m === 'membership' ? p.delete('sort') : p.set('sort', m)))
  const setMode = (m: MapColorMode) => {
    write(p => (m === 'health' ? p.delete('color') : p.set('color', m)))
    setSheet(null)
  }
  const setQuery = useCallback(
    (q: string) => write(p => (q ? p.set('q', q) : p.delete('q'))),
    [write]
  )
  const toggleChip = (chip: LegendChip) => {
    if (!model.facet) return
    const { param, valueOf } = model.facet
    setSearchParams(prev => toggleFacetValue(prev, param, valueOf(chip)), {
      replace: true,
    })
  }
  const setFacet = (param: string, values: string[]) =>
    write(p =>
      values.length ? p.set(param, values.join(',')) : p.delete(param)
    )
  const clearFilters = () =>
    write(p => {
      for (const k of WORLD_FILTER_PARAMS) p.delete(k)
    })
  const viewHref = (view: 'map' | null) => {
    const next = new URLSearchParams(searchParams)
    if (view) next.set('view', view)
    else next.delete('view')
    const qs = next.toString()
    return { search: qs ? `?${qs}` : '' }
  }

  const filterCount = activeWorldFilterCount(searchParams)
  const modeLabel = WORLD_COLOR_MODES.find(m => m.id === mode)!.label
  const regionKeys = useMemo(
    () => worldShardKeys(world, new URLSearchParams()),
    [world]
  )
  // District options follow the region filter, from world.json alone.
  const districtIds = useMemo(() => {
    const ids = new Set(
      shardKeys.flatMap(k => world?.shards?.[k]?.districtIds ?? [])
    )
    return [...ids].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    )
  }, [world, shardKeys])
  const facets = [
    {
      id: 'region',
      label: 'Region',
      options: regionKeys.map(k => ({ value: k, label: worldRegionLabel(k) })),
      selected: facetValues(searchParams, 'region'),
      onChange: (v: string[]) => setFacet('region', v),
    },
    {
      id: 'district',
      label: 'District',
      options: districtIds.map(d => ({ value: d, label: `District ${d}` })),
      selected: facetValues(searchParams, 'district'),
      onChange: (v: string[]) => setFacet('district', v),
    },
    {
      id: 'status',
      label: 'Club health',
      options: STATUS_OPTIONS,
      selected: facetValues(searchParams, 'status'),
      onChange: (v: string[]) => setFacet('status', v),
    },
    {
      id: 'size',
      label: 'Members',
      options: SIZE_OPTIONS,
      selected: facetValues(searchParams, 'size'),
      onChange: (v: string[]) => setFacet('size', v),
    },
  ]

  // A search or filter waits for the clubs: the seed is the unfiltered top.
  const waitingForClubs =
    seeded &&
    (query.trim() !== '' ||
      filterCount > 0 ||
      wantsExtendedFilters(searchParams))
  const metricLabel = REGION_METRICS.find(m => m.id === metric)!.label
  const listTitle =
    query.trim() && !seeded
      ? `${nf.format(sorted.length)} ${sorted.length === 1 ? 'club matches' : 'clubs match'} “${query.trim()}”`
      : `Top clubs by ${metricLabel.toLowerCase()}`

  const legend = (limit?: number, onMore?: () => void) => (
    <div className="map-legend">
      <p className="map-legend__title">
        <strong>
          {pending
            ? WORLD_COLOR_MODES.find(m => m.id === mode)!.label
            : model.title}
        </strong>
        {world && <span> · as of {world.snapshotDate}</span>}
      </p>
      {pending ? (
        <div className="map-legend__chips" />
      ) : (
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
      {limit === undefined && online.length > 0 && (
        <OnlineClubsChip clubs={online} />
      )}
    </div>
  )

  const unmapped = searched.filter(c => !c.coordinates).length
  const unmappedNote = unmapped > 0 && (
    <p className="map-panel__note region-map__unmapped">
      {unmapped === 1
        ? '1 club has no Find-a-Club location, so it is not on the map. It is in the list.'
        : `${nf.format(unmapped)} clubs have no Find-a-Club location, so they are not on the map. They are in the list.`}
    </p>
  )
  const failedNote = failedShards.length > 0 && (
    <div className="map-panel__note world-map__failed" role="alert">
      <p>
        {failedShards.length === 1
          ? `1 region could not be loaded (${worldRegionLabel(failedShards[0]!)}). Its clubs are missing from the map and the list.`
          : `${failedShards.length} regions could not be loaded (${failedShards.map(worldRegionLabel).join(', ')}). Their clubs are missing from the map and the list.`}
      </p>
      <button type="button" className="map-pill" onClick={retryShards}>
        Try again
      </button>
    </div>
  )

  const filterControls = isPhone ? (
    <React.Suspense fallback={null}>
      <FilterSheet
        id="world-map-filters"
        isOpen={filtersOpen}
        onClose={() => setSheet(null)}
        resultCount={searched.length}
        resultNoun={{ one: 'club', other: 'clubs' }}
        activeCount={filterCount}
        onClearAll={clearFilters}
        facets={facets}
      />
    </React.Suspense>
  ) : (
    filtersOpen && (
      <section
        id="world-map-filters"
        className="map-panel__section map-filters"
        aria-label="Filters"
      >
        <React.Suspense fallback={null}>
          <FilterFacetGroups facets={facets} />
        </React.Suspense>
        <button
          type="button"
          className="filter-sheet__clear"
          onClick={clearFilters}
          disabled={filterCount === 0}
        >
          Clear all
        </button>
      </section>
    )
  )

  const mapPills = (
    <>
      <div className="map-modes-anchor">
        <button
          ref={modePill}
          type="button"
          className="map-pill"
          aria-haspopup={isPhone ? 'dialog' : undefined}
          aria-expanded={isPhone ? undefined : modesOpen}
          aria-controls={isPhone ? undefined : 'world-map-modes'}
          onClick={() => setSheet(modesOpen ? null : 'modes')}
        >
          Colour: {modeLabel}
          <span aria-hidden="true"> ▾</span>
        </button>
        {!isPhone && modesOpen && (
          <React.Suspense fallback={null}>
            <ModePopover
              id="world-map-modes"
              mode={mode}
              modes={WORLD_COLOR_MODES}
              onChange={setMode}
              onClose={() => setSheet(null)}
              trigger={modePill}
            />
          </React.Suspense>
        )}
      </div>
      <button
        type="button"
        className="map-pill"
        aria-haspopup={isPhone ? 'dialog' : undefined}
        aria-expanded={filtersOpen}
        aria-controls="world-map-filters"
        aria-label={filterCount ? `Filters, ${filterCount} active` : 'Filters'}
        onClick={() => setSheet(filtersOpen ? null : 'filters')}
      >
        Filters
        {filterCount > 0 && (
          <span className="map-pill__badge">{filterCount}</span>
        )}
      </button>
    </>
  )

  const canvas = (
    <div
      className="district-map__canvas region-map__canvas"
      aria-busy={clubsReady ? undefined : true}
    >
      <LazyBasemapMap
        ariaLabel={`World club map, coloured by ${model.title.toLowerCase()}`}
        onReady={setMap}
        cooperativeGestures={false}
      />
      <MapViewControls
        map={map}
        onReset={() => {
          resetView()
          setSelectedIds([])
        }}
      />
      {map && (
        <React.Suspense fallback={null}>
          <PinKeys
            map={map}
            clubs={searched}
            model={model}
            selectedIds={selectedClubIds}
            onSelect={setSelectedIds}
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
          {legend(4, () => setSheet('legend'))}
          <button
            type="button"
            className="map-pill"
            onClick={() => setSheet('legend')}
          >
            Legend
          </button>
        </div>
      )}
    </div>
  )

  const list = (
    <section className="region-map__list" aria-labelledby="world-map-list">
      <h2 id="world-map-list" className="region-map__list-title">
        {listTitle}
      </h2>
      {filtering || pending || waitingForClubs ? (
        <div className="region-map__list-reserve" aria-busy="true" />
      ) : sorted.length > 0 ? (
        <React.Suspense
          fallback={
            <div className="region-map__list-reserve" aria-busy="true" />
          }
        >
          <ClubList
            clubs={sorted}
            model={model}
            metric={metric}
            label={listTitle}
          />
        </React.Suspense>
      ) : (
        <p className="region-map__empty">
          {query.trim()
            ? `No clubs match “${query.trim()}”. Check the spelling, or search by club number.`
            : 'No clubs match these filters.'}
        </p>
      )}
    </section>
  )

  let body: React.ReactNode
  if (isLoading) body = <ExplorerSkeleton />
  else if (isError)
    body = (
      <div className="rollup-page__empty" role="alert">
        <p>The world’s clubs could not be loaded.</p>
        <button type="button" className="map-pill" onClick={refetch}>
          Try again
        </button>
      </div>
    )
  else if (!world || !world.shards || !summary)
    body = (
      <p className="rollup-page__empty" data-testid="world-map-unavailable">
        World club data is not available for this date yet.
      </p>
    )
  else
    body = (
      <div className="region-map">
        <ul
          className="rollup-kpis region-map__summary"
          data-testid="world-map-summary"
          aria-label="The world at a glance"
        >
          <li className="rollup-kpi">
            <span className="rollup-kpi__label">Clubs</span>
            <span className="rollup-kpi__value">
              {nf.format(summary.clubs)}
            </span>
          </li>
          <li className="rollup-kpi">
            <span className="rollup-kpi__label">Districts</span>
            <span className="rollup-kpi__value">
              {nf.format(summary.districts)}
            </span>
          </li>
          <li className="rollup-kpi">
            <span className="rollup-kpi__label">Need intervention</span>
            <span className="rollup-kpi__value">
              {nf.format(summary.interventionRequired)}
            </span>
          </li>
        </ul>

        <div className="region-map__controls">
          <React.Suspense
            fallback={
              <div className="clubs-search region-map__search-reserve" />
            }
          >
            <ClubSearchBox
              value={query}
              onSearchChange={setQuery}
              label="Search clubs by name or number"
              placeholder="Club name or number"
            />
          </React.Suspense>
          <div className="region-map__chips">
            <div
              className="map-modes region-map__metrics"
              role="group"
              aria-label="Rank clubs by"
            >
              {REGION_METRICS.map(m => (
                <button
                  key={m.id}
                  type="button"
                  className="map-modes__btn"
                  aria-pressed={metric === m.id}
                  onClick={() => setMetric(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {!isPhone && mapPills}
            {isPhone && (
              <button
                type="button"
                className="map-pill"
                aria-haspopup="dialog"
                aria-label={
                  filterCount ? `Filters, ${filterCount} active` : 'Filters'
                }
                onClick={() => setSheet('filters')}
              >
                Filters
                {filterCount > 0 && (
                  <span className="map-pill__badge">{filterCount}</span>
                )}
              </button>
            )}
          </div>
        </div>
        <p role="status" className="sr-only">
          {filtering || waitingForClubs
            ? 'Filtering clubs…'
            : seeded
              ? `Showing the top ${sorted.length} of ${nf.format(summary.clubs)} clubs`
              : `Showing ${searched.length} of ${allClubs.length} clubs`}
        </p>
        {failedNote}

        {isPhone ? (
          <>
            {list}
            {mapOpen ? (
              <div
                className="region-map__fullscreen"
                role="dialog"
                aria-modal="false"
                aria-label="World club map"
              >
                <div className="region-map__fullscreen-bar">
                  <Link className="map-pill" to={viewHref(null)}>
                    List
                  </Link>
                  {mapPills}
                </div>
                {canvas}
              </div>
            ) : (
              <Link className="region-map__map-fab" to={viewHref('map')}>
                Map
              </Link>
            )}
          </>
        ) : (
          <div className="district-map__body region-map__body">
            <div>
              {canvas}
              {unmappedNote}
            </div>
            <aside className="map-panel" aria-label="Legend and clubs">
              {filterControls}
              {legend()}
              {selected.length > 0 && (
                <section
                  className="map-panel__section"
                  aria-label="Selected club"
                >
                  <React.Suspense fallback={null}>
                    <MapClubSummary
                      clubs={selected}
                      districtId={selected[0]!.districtId}
                      districtOf={districtOf}
                    />
                  </React.Suspense>
                </section>
              )}
              {list}
            </aside>
          </div>
        )}

        {isPhone && (
          <>
            {filterControls}
            <React.Suspense fallback={null}>
              <MapPhoneSheets
                sheet={sheet === 'filters' ? null : sheet}
                onClose={() => setSheet(null)}
                mode={mode}
                modes={WORLD_COLOR_MODES}
                onModeChange={setMode}
                legendTitle={model.title}
                legend={legend()}
                selectedCount={mapOpen ? selected.length : 0}
                summary={
                  <React.Suspense fallback={null}>
                    <MapClubSummary
                      clubs={selected}
                      districtId={selected[0]?.districtId ?? ''}
                      districtOf={districtOf}
                    />
                  </React.Suspense>
                }
                onDeselect={() => setSelectedIds([])}
              />
            </React.Suspense>
          </>
        )}
      </div>
    )

  return (
    <RollupPageShell
      title="Regions"
      eyebrow="Worldwide · Club map"
      lede="Every Toastmasters club in the world: where they meet, which lead, and which need help. Search by name or number; the list is the full alternative to the map."
      trail={[{ label: 'Regions', to: '/regions' }, { label: 'Club map' }]}
      subnavBase="/regions"
      controls={controls}
    >
      {/* Page chrome, not data: there before world.json lands and when the
          date has no world file, so it never shifts the body (Lesson 107). */}
      <p className="world-map__related">
        <Link to="/history/countries" className="world-map__country-link">
          Map of clubs by country →
        </Link>
      </p>
      {body}
    </RollupPageShell>
  )
}

export default WorldMapPage
