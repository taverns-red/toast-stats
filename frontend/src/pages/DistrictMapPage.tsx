import React, { useCallback, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { useDistricts } from '../hooks/useDistricts'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useDistrictCachedDates } from '../hooks/useDistrictData'
import {
  useDistrictAnalytics,
  type ClubTrend,
} from '../hooks/useDistrictAnalytics'
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
import { MapClubSummary } from '../components/map/MapClubSummary'
import { PinSwatch } from '../components/map/PinSwatch'
import { useClubPins } from '../components/map/useClubPins'
import { buildPinFeatures } from '../components/map/pinLayer'
import {
  CATEGORICAL8,
  MAP_COLOR_MODES,
  applyFacets,
  buildModeModel,
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
   grid's (R3: passed down, never re-derived from the response). */

const CHIP_PEEK = 5

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
  const [all, setAll] = useState(false)
  const cut = limit !== undefined && !all && chips.length > limit + 1
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
          onClick={onMore ?? (() => setAll(true))}
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
              ? buildModeModel(m.id, []).categories.slice(0, 5)
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

const ClubLinks: React.FC<{
  clubs: ClubTrend[]
  districtId: string
  model?: ModeModel
  label: string
}> = ({ clubs, districtId, model, label }) => (
  <ul className="map-list" aria-label={label}>
    {clubs.map(c => {
      const cat = model?.categoryOf(c)
      return (
        <li key={c.clubId}>
          <Link to={`/district/${districtId}/club/${c.clubId}`}>
            {cat && <PinSwatch category={cat} />}
            <span className="map-list__name">{c.clubName}</span>
            <span className="map-list__meta">
              {cat
                ? cat.label
                : [c.divisionId, c.areaId].filter(Boolean).join(' / ')}
            </span>
          </Link>
        </li>
      )
    })}
  </ul>
)

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => {
  const id = React.useId()
  return (
    <section className="map-panel__section" aria-labelledby={id}>
      <h3 id={id} className="map-panel__heading">
        {title}
      </h3>
      {children}
    </section>
  )
}

const DistrictMapPage: React.FC = () => {
  const { districtId = '' } = useParams<{ districtId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const mode = parseMapColorMode(searchParams.get('color'))
  const listView = searchParams.get('view') === 'list'
  const isPhone = useIsMobile()
  const { isDark } = useDarkMode()
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [sheet, setSheet] = useState<'legend' | 'modes' | null>(null)

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
  const model = useMemo(() => buildModeModel(mode, allClubs), [mode, allClubs])
  const filtered = useMemo(
    () => applyFacets(allClubs, searchParams),
    [allClubs, searchParams]
  )
  const facetParam = model.facet?.param
  const chips = useMemo(() => {
    // Counts ignore this mode's own facet, so pressing a chip never
    // zeroes the others; they include clubs not on the map (spec §4.3).
    const others = new URLSearchParams(searchParams)
    if (facetParam) others.delete(facetParam)
    return legendChips(model, applyFacets(allClubs, others))
  }, [model, allClubs, searchParams, facetParam])
  const pressed = facetParam ? facetValues(searchParams, facetParam) : []
  const data = useMemo(
    () => buildPinFeatures(filtered, model),
    [filtered, model]
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

  const setMode = useCallback(
    (m: MapColorMode) => {
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
    },
    [setSearchParams]
  )
  const toggleChip = (chip: LegendChip) => {
    if (!model.facet) return
    const { param, valueOf } = model.facet
    setSearchParams(prev => toggleFacetValue(prev, param, valueOf(chip)), {
      replace: true,
    })
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
        <strong>{model.title}</strong>
        {effectiveEndDate && <span> · as of {effectiveEndDate}</span>}
      </p>
      <Chips
        model={model}
        chips={chips}
        pressed={pressed}
        onToggle={toggleChip}
        limit={limit}
        onMore={onMore}
      />
      {model.kind !== 'categorical' && limit === undefined && (
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
    <>
      <Section title={`Not on the map (${unmapped.length})`}>
        <p className="map-panel__note">
          {unmapped.length
            ? 'No Find-a-Club location'
            : 'Every club in view has a location.'}
        </p>
        <ClubLinks
          clubs={unmapped}
          districtId={districtId}
          label="Clubs not on the map"
        />
      </Section>
      <Section title={`Prospective (${prospective.length})`}>
        <p className="map-panel__note">
          Not yet chartered, so not pinned: Find-a-Club lists their town only.
        </p>
        <ul className="map-list" aria-label="Prospective clubs">
          {prospective.map(p => (
            <li key={p.clubId}>
              <span className="map-list__name">{p.clubName}</span>
              <span className="map-list__meta">
                {[p.city, p.region].filter(Boolean).join(', ')}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </>
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
            <Link className="map-pill" to={viewHref(listView ? null : 'list')}>
              {listView ? 'Map view' : 'List view'}
            </Link>
          </div>
          <p role="status" className="sr-only">
            Showing {filtered.length} of {allClubs.length} clubs
          </p>

          {listView ? (
            <div className="district-map__listview">
              {legend()}
              <ClubLinks
                clubs={[...filtered].sort((a, b) =>
                  a.clubName.localeCompare(b.clubName)
                )}
                districtId={districtId}
                model={model}
                label="Clubs"
              />
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
                  {legend()}
                  {selected.length > 0 && (
                    <Section title="Selected">
                      <MapClubSummary
                        clubs={selected}
                        districtId={districtId}
                      />
                    </Section>
                  )}
                  {lists}
                </aside>
              )}
            </div>
          )}
        </section>

        {isPhone && (
          <>
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
              <MapClubSummary clubs={selected} districtId={districtId} />
            </BottomSheet>
          </>
        )}
      </div>
    </div>
  )
}

export default DistrictMapPage
