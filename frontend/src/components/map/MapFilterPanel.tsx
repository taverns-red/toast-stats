import React, { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import type { SnapshotDate } from '../../types/snapshotDate'
import { FilterFacetGroups, FilterSheet } from '../filters/FilterSheet'
import {
  activeMapFilterCount,
  applyMapFilters,
  clearMapFilters,
  loadVisitIndex,
  mapFilterFacets,
  needsVisitData,
  setMapFilter,
} from './mapFilters'

/* The map's filters (#1788): visit round, online-capable, division and
   area. One on-demand chunk — the page mounts it when the URL carries
   `?visit=` / `?online=` or Filters is first opened — so the route's first
   load doesn't grow (300 KB budget).

   It owns the filter runtime: it reads the visit awards for the page's date
   (R3: passed down) when a round is asked for, then hands the page a filter
   function; until then it hands up null, and the page draws nothing rather
   than the unfiltered set.

   UI: below 768 the shared Filter & sort sheet (#1836); from 768 a section
   at the top of the side panel, so the map stays in view. Every chip is one
   URL write of its own key; "Clear all" clears the four filter keys in one
   write — the colour mode, the legend facets and the view stay. */

export type MapFilter = (
  clubs: ClubTrend[],
  params: URLSearchParams
) => ClubTrend[]

export interface MapFilterPanelProps {
  clubs: readonly ClubTrend[]
  isPhone: boolean
  isOpen: boolean
  onClose: () => void
  /** Clubs the current filters leave, mapped or not. */
  resultCount: number
  districtId: string
  /** The page's viewed snapshot date. */
  date: SnapshotDate | null
  onFilter: React.Dispatch<React.SetStateAction<MapFilter | null>>
}

const ID = 'map-filters'

export const MapFilterPanel: React.FC<MapFilterPanelProps> = ({
  clubs,
  isPhone,
  isOpen,
  onClose,
  resultCount,
  districtId,
  date,
  onFilter,
}) => {
  const [params, setParams] = useSearchParams()
  const wantsVisits = needsVisitData(params)
  const { data: visits } = useQuery({
    queryKey: ['mapVisits', districtId, date],
    queryFn: () => loadVisitIndex(date!, districtId),
    enabled: wantsVisits && !!date,
    staleTime: 15 * 60 * 1000,
  })
  const ready = !wantsVisits || visits !== undefined
  useEffect(() => {
    const filter: MapFilter = (list, p) => applyMapFilters(list, p, visits)
    // A function state value goes through an updater.
    onFilter(() => (ready ? filter : null))
  }, [ready, visits, onFilter])

  const facets = mapFilterFacets(clubs, params, (param, next) =>
    setParams(prev => setMapFilter(prev, param, next), { replace: true })
  ).map(f =>
    f.id === 'visit' && visits === null
      ? { ...f, label: `${f.label} (not available for this date)` }
      : f
  )
  const activeCount = activeMapFilterCount(params)
  const clearAll = () =>
    setParams(prev => clearMapFilters(prev), { replace: true })

  if (isPhone) {
    return (
      <FilterSheet
        id={ID}
        isOpen={isOpen}
        onClose={onClose}
        resultCount={resultCount}
        resultNoun={{ one: 'club', other: 'clubs' }}
        activeCount={activeCount}
        onClearAll={clearAll}
        facets={facets}
      />
    )
  }
  if (!isOpen) return null
  return (
    <section
      id={ID}
      className="map-panel__section map-filters"
      aria-label="Filters"
    >
      <FilterFacetGroups facets={facets} />
      <button
        type="button"
        className="filter-sheet__clear"
        onClick={clearAll}
        disabled={activeCount === 0}
      >
        Clear all
      </button>
    </section>
  )
}

export default MapFilterPanel
