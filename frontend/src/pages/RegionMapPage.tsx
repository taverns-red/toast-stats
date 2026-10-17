import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { clubIdsMatch } from '@taverns-red/shared-contracts'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { useProgramYearControls } from '../hooks/useProgramYearControls'
import { useRegionClubs } from '../hooks/useRegionClubs'
import { useIsMobile } from '../hooks/useIsMobile'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useDarkMode } from '../contexts/DarkModeContext'
import type { ClubTrend } from '../hooks/useDistrictAnalytics'
import { RollupPageShell } from '../components/rollups/RollupPageShell'
import { ClubSearchBox } from '../components/ClubSearchBox'
import { MobileRowList, type MobileRow } from '../components/MobileRowList'
import { PinSwatch } from '../components/map/PinSwatch'
import LazyBasemapMap from '../components/map/LazyBasemapMap'
import { useClubPins } from '../components/map/useClubPins'
import {
  CLUSTER_LAYER_ID,
  PIN_LAYER_ID,
  PIN_SOURCE_ID,
  buildPinFeatures,
} from '../components/map/pinLayer'
import {
  facetValues,
  legendChips,
  toggleFacetValue,
  type LegendChip,
  type MapColorMode,
} from '../components/map/pinModes'
import {
  REGION_COLOR_MODES,
  parseRegionColorMode,
  regionModel,
} from '../components/map/regionModes'
import { normaliseRegionId } from '../utils/regionId'
import {
  REGION_METRICS,
  activeRegionFilterCount,
  applyRegionFilters,
  parseRegionMetric,
  regionClubMetric,
  regionSummary,
  searchRegionClubs,
  sortRegionClubs,
  toRegionClubs,
  type RegionClub,
  type RegionMetric,
} from '../utils/regionClubs'
import '../components/map/districtMap.css'
import './regionMap.css'

/* Region club explorer (#1808, epic #1781): where are the region's clubs,
   which lead, which need help. A routed subpage of /region/:n (ADR-005)
   over ONE file, the region's clubs-by-region shard (#1800). The district
   map's stack (#1784) draws it unchanged: the self-hosted labelled
   basemap, the clustered pin layer, the colour-mode registry and legend
   chips. MapLibre stays a lazy chunk (LazyBasemapMap), and on a phone it is
   not fetched until the map is opened.

   URL state, so back and deep links work: `?q=` search, `?sort=` metric
   (membership omitted), `?color=` mode (health omitted), the filters
   `?district=` / `?status=` / `?size=` and the legend keys, `?view=map`
   (the phone's full-screen map). PY and date are the page's controls,
   passed down (R3).

   Accessibility: the ranked list is the screen-reader alternative to the
   map — every club the map draws is reachable there by search and filters,
   and it names each club's status in words. */

const Chips = React.lazy(() =>
  import('../components/map/MapClubLists').then(m => ({
    default: m.LegendChips,
  }))
)
const MapPreview = React.lazy(() => import('../components/map/MapPreview'))
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
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')

function metricText(c: RegionClub, metric: RegionMetric): string {
  const v = regionClubMetric(c, metric)
  if (metric === 'netGrowth') return `net ${signed(v)}`
  if (metric === 'dcpGoals') return `${v} DCP goal${v === 1 ? '' : 's'}`
  return `${v} member${v === 1 ? '' : 's'}`
}

const districtOf = (c: ClubTrend) => (c as RegionClub).districtId

/** Reserved slot while the shard loads, so nothing shifts (Lesson 107). */
const ExplorerSkeleton: React.FC = () => (
  <div aria-busy="true" data-testid="region-map-skeleton">
    <ul className="rollup-kpis region-map__summary" aria-hidden="true">
      {['Clubs', 'Members', 'Need intervention'].map(l => (
        <li key={l} className="rollup-kpi">
          <span className="rollup-kpi__label">{l}</span>
          <span className="rollup-kpi__value">—</span>
        </li>
      ))}
    </ul>
    <div className="region-map__skeleton-body" />
  </div>
)

const RegionMapPage: React.FC = () => {
  const { n } = useParams<{ n: string }>()
  const region = normaliseRegionId(n) // "5" → "05", the shard key (#2130)
  const [searchParams, setSearchParams] = useSearchParams()
  const controls = useProgramYearControls()
  const date = controls.effectiveDate
  const { shard, isLoading, isError, refetch } = useRegionClubs(date, region)
  const isPhone = useIsMobile()
  const theme = useDarkMode().isDark ? 'dark' : 'light'
  const title = `Region ${region}`
  useDocumentTitle(`${title} Club Map`)

  const mode = parseRegionColorMode(searchParams.get('color'))
  const metric = parseRegionMetric(searchParams.get('sort'))
  const query = searchParams.get('q') ?? ''
  const mapOpen = searchParams.get('view') === 'map'
  const showMap = !isPhone || mapOpen

  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [sheet, setSheet] = useState<'legend' | 'modes' | 'filters' | null>(
    null
  )
  const modePill = useRef<HTMLButtonElement>(null)
  const modesOpen = sheet === 'modes'
  const filtersOpen = sheet === 'filters'

  // The filter pipeline (R11): original → filtered → searched → sorted.
  const allClubs = useMemo(() => (shard ? toRegionClubs(shard) : []), [shard])
  const filtered = useMemo(
    () => applyRegionFilters(allClubs, searchParams),
    [allClubs, searchParams]
  )
  const searched = useMemo(
    () => searchRegionClubs(filtered, query),
    [filtered, query]
  )
  const sorted = useMemo(
    () => sortRegionClubs(searched, metric),
    [searched, metric]
  )
  const summary = useMemo(() => regionSummary(allClubs), [allClubs])

  const model = useMemo(() => regionModel(mode, allClubs), [mode, allClubs])
  const facetParam = model.facet?.param
  const chips = useMemo(() => {
    // Counts ignore this mode's own key, so pressing a chip never zeroes
    // the others; they include clubs not on the map (spec §4.3).
    const others = new URLSearchParams(searchParams)
    if (facetParam) others.delete(facetParam)
    return legendChips(model, applyRegionFilters(allClubs, others))
  }, [model, allClubs, searchParams, facetParam])
  const pressed = facetParam ? facetValues(searchParams, facetParam) : []
  const pins = useMemo(
    () => buildPinFeatures(searched, model),
    [searched, model]
  )

  const selected = useMemo(
    () =>
      allClubs.filter(c => selectedIds.some(id => clubIdsMatch(c.clubId, id))),
    [allClubs, selectedIds]
  )
  const selectedClubIds = useMemo(() => selected.map(c => c.clubId), [selected])
  useClubPins(showMap ? map : null, {
    data: pins,
    model,
    theme,
    selectedIds: selectedClubIds,
    onSelect: setSelectedIds,
    fitKey: `${region}|${date ?? ''}|${mapOpen}`,
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
      for (const k of ['district', 'status', 'size']) p.delete(k)
    })
  const viewHref = (view: 'map' | null) => {
    const next = new URLSearchParams(searchParams)
    if (view) next.set('view', view)
    else next.delete('view')
    const qs = next.toString()
    return { search: qs ? `?${qs}` : '' }
  }

  const filterCount = activeRegionFilterCount(searchParams)
  const modeLabel = REGION_COLOR_MODES.find(m => m.id === mode)!.label
  const districts = shard?.districtIds ?? []
  const facets = [
    {
      id: 'district',
      label: 'District',
      options: districts.map(d => ({ value: d, label: `District ${d}` })),
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

  const rows: MobileRow[] = sorted.map(c => {
    const cat = model.categoryOf(c)
    return {
      id: c.clubId,
      to: `/district/${c.districtId}/club/${c.clubId}`,
      title: c.clubName,
      chip: (
        <span className="map-row-chip">
          <PinSwatch category={cat} />
          {cat.label}
        </span>
      ),
      meta: `D${c.districtId} · ${metricText(c, metric)}`,
    }
  })
  const metricLabel = REGION_METRICS.find(m => m.id === metric)!.label
  const listTitle = query.trim()
    ? `${nf.format(sorted.length)} ${sorted.length === 1 ? 'club matches' : 'clubs match'} “${query.trim()}”`
    : `Top clubs by ${metricLabel.toLowerCase()}`

  const legend = (limit?: number, onMore?: () => void) => (
    <div className="map-legend">
      <p className="map-legend__title">
        <strong>{model.title}</strong>
        {shard && <span> · as of {shard.snapshotDate}</span>}
      </p>
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
    </div>
  )

  const unmapped = searched.filter(c => !c.coordinates).length
  const unmappedNote = unmapped > 0 && (
    <p className="map-panel__note region-map__unmapped">
      {unmapped === 1
        ? '1 club has no Find-a-Club location, so it is not on the map. It is in the list.'
        : `${unmapped} clubs have no Find-a-Club location, so they are not on the map. They are in the list.`}
    </p>
  )

  const filterControls = isPhone ? (
    <React.Suspense fallback={null}>
      <FilterSheet
        id="region-map-filters"
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
        id="region-map-filters"
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
          aria-controls={isPhone ? undefined : 'region-map-modes'}
          onClick={() => setSheet(modesOpen ? null : 'modes')}
        >
          Colour: {modeLabel}
          <span aria-hidden="true"> ▾</span>
        </button>
        {!isPhone && modesOpen && (
          <React.Suspense fallback={null}>
            <ModePopover
              id="region-map-modes"
              mode={mode}
              modes={REGION_COLOR_MODES}
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
        aria-controls="region-map-filters"
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
    <div className="district-map__canvas region-map__canvas">
      <LazyBasemapMap
        ariaLabel={`Region ${region} club map, coloured by ${model.title.toLowerCase()}`}
        onReady={setMap}
        cooperativeGestures={false}
      />
      <React.Suspense fallback={null}>
        <MapPreview clubs={searched} map={map} />
      </React.Suspense>
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
    <section className="region-map__list" aria-labelledby="region-map-list">
      <h2 id="region-map-list" className="region-map__list-title">
        {listTitle}
      </h2>
      {rows.length > 0 ? (
        <MobileRowList
          label={listTitle}
          noun="clubs"
          chipPlacement="meta"
          rows={rows}
          flush
        />
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
        <p>The region’s clubs could not be loaded.</p>
        <button type="button" className="map-pill" onClick={refetch}>
          Try again
        </button>
      </div>
    )
  else if (!shard)
    body = (
      <p className="rollup-page__empty" data-testid="region-map-unavailable">
        Region club data is not available for this date yet.
      </p>
    )
  else
    body = (
      <div className="region-map">
        <ul
          className="rollup-kpis region-map__summary"
          data-testid="region-map-summary"
          aria-label={`Region ${region} at a glance`}
        >
          <li className="rollup-kpi">
            <span className="rollup-kpi__label">Clubs</span>
            <span className="rollup-kpi__value">
              {nf.format(summary.clubs)}
            </span>
          </li>
          <li className="rollup-kpi">
            <span className="rollup-kpi__label">Members</span>
            <span className="rollup-kpi__value">
              {nf.format(summary.members)}
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
          <ClubSearchBox
            value={query}
            onSearchChange={setQuery}
            label="Search clubs by name or number"
            placeholder="Club name or number"
          />
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
          {`Showing ${searched.length} of ${allClubs.length} clubs`}
        </p>

        {isPhone ? (
          <>
            {list}
            {mapOpen ? (
              <div
                className="region-map__fullscreen"
                role="dialog"
                aria-modal="false"
                aria-label={`Region ${region} club map`}
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
                modes={REGION_COLOR_MODES}
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
      title={title}
      eyebrow={`Toastmasters Region ${region} · Club map`}
      lede={`Every club in Region ${region}: where they meet, which lead, and which need help. Search by name or number; the list is the full alternative to the map.`}
      back={{ label: title, to: `/region/${region}` }}
      trail={[
        { label: 'Regions', to: '/regions' },
        { label: title, to: `/region/${region}` },
        { label: 'Club map' },
      ]}
      subnavBase={`/region/${region}`}
      controls={controls}
    >
      {body}
    </RollupPageShell>
  )
}

export default RegionMapPage
