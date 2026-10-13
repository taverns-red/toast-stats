import React from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import { FilterFacetGroups, FilterSheet } from '../filters/FilterSheet'
import {
  activeMapFilterCount,
  clearMapFilters,
  mapFilterFacets,
  setMapFilter,
} from './mapFilters'

/* The map's filter UI (#1788): visit round, online-capable, division and
   area. Loaded on the first open of Filters, so the route's first load
   doesn't grow. Below 768 it is the shared Filter & sort sheet (#1836);
   from 768 it is a section at the top of the side panel, so the map stays
   in view while filtering. Every chip is one URL write of its own key, and
   "Clear all" clears the four filter keys in one write — the colour mode,
   the legend facets and the view stay. */

export interface MapFilterPanelProps {
  clubs: readonly ClubTrend[]
  isPhone: boolean
  isOpen: boolean
  onClose: () => void
  /** Clubs the current filters leave, mapped or not. */
  resultCount: number
  /** The viewed date's snapshot has no readable visit awards. */
  visitsUnavailable: boolean
  id: string
}

export const MapFilterPanel: React.FC<MapFilterPanelProps> = ({
  clubs,
  isPhone,
  isOpen,
  onClose,
  resultCount,
  visitsUnavailable,
  id,
}) => {
  const [params, setParams] = useSearchParams()
  const facets = mapFilterFacets(clubs, params, (param, next) =>
    setParams(prev => setMapFilter(prev, param, next), { replace: true })
  ).map(f =>
    f.id === 'visit' && visitsUnavailable
      ? { ...f, label: `${f.label} (not available for this date)` }
      : f
  )
  const activeCount = activeMapFilterCount(params)
  const clearAll = () =>
    setParams(prev => clearMapFilters(prev), { replace: true })

  if (isPhone) {
    return (
      <FilterSheet
        id={id}
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
      id={id}
      className="map-panel__section map-filters filter-sheet"
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
