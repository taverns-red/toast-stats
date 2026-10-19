/**
 * ClubMiniMapTiles — the club mini-map's real map (#2162): the shared
 * self-hosted basemap (ADR-016) as a static picture, with the club pins
 * drawn by the shared pin code (`useClubPins` → `pinRuntime`).
 *
 * Reached only through `React.lazy` from `ClubMiniMap`, once the card nears
 * the viewport and the hero has painted, so neither this chunk nor MapLibre
 * is on the club route's first load.
 *
 * Non-interactive by design: the whole card is one link to the district's
 * full club map, so a pannable map inside it would fight the tap, trap page
 * scroll on a phone, and put controls inside a link. No control stack, so
 * nothing to make room for.
 *
 * This club's pin is drawn twice: in the shared, grouped source (so group
 * counts include it), and again from a one-feature source on top, with the
 * shared selected-pin icon, so a group never swallows it. The icon is drawn
 * by the shared runtime's image resolver, so that layer is added only once
 * the shared pins are on the map.
 */
import { useEffect, useMemo, useState } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import LazyBasemapMap from '../map/LazyBasemapMap'
import { useClubPins } from '../map/useClubPins'
import {
  PIN_SOURCE_ID,
  SELECTED_LAYER_ID,
  clubPinLayers,
  type MapTheme,
} from '../map/pinLayer'
import { useDarkMode } from '../../contexts/DarkModeContext'
import type { LocatorFit } from '../../utils/clubLocator'
import {
  LOCATOR_MODEL,
  MINIMAP_FOCUS_LAYER_ID,
  MINIMAP_FOCUS_SOURCE_ID,
  locatorPinFeatures,
} from './locatorPins'

/** The shared runtime's fit (pinRuntime `attachPins`), set here before the
 *  first tile request so the camera never starts on the whole world. */
export const MINIMAP_FIT = { padding: 48, maxZoom: 12, animate: false }

const noop = () => {}

export interface ClubMiniMapTilesProps {
  fit: LocatorFit
  /** The first tiles and pins are painted. */
  onPainted: () => void
  /** The map failed before it painted (tiles, style). */
  onFailed: () => void
}

export default function ClubMiniMapTiles({
  fit,
  onPainted,
  onFailed,
}: ClubMiniMapTilesProps) {
  const { isDark } = useDarkMode()
  const theme: MapTheme = isDark ? 'dark' : 'light'
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const focusId = fit.focus?.clubId ?? null

  const data = useMemo(
    () => locatorPinFeatures(fit.inView, focusId),
    [fit, focusId]
  )
  useClubPins(map, {
    data,
    model: LOCATOR_MODEL,
    theme,
    selectedIds: [],
    onSelect: noop,
    fitKey: data.features.map(f => f.properties.id).join(','),
  })

  // Painted on the first idle; failed on an error before it.
  useEffect(() => {
    if (!map) return
    let settled = false
    const idle = () => {
      if (settled) return
      settled = true
      onPainted()
    }
    const error = () => {
      if (settled) return
      settled = true
      onFailed()
    }
    map.on('idle', idle)
    map.on('error', error)
    return () => {
      map.off('idle', idle)
      map.off('error', error)
    }
  }, [map, onPainted, onFailed])

  // This club's pin, on top.
  useEffect(() => {
    if (!map || !fit.focus) return
    const focus = locatorPinFeatures([fit.focus], fit.focus.clubId)
    const shared = clubPinLayers(LOCATOR_MODEL, theme, [fit.focus.clubId]).find(
      l => l.id === SELECTED_LAYER_ID
    )!
    const layer = {
      ...shared,
      id: MINIMAP_FOCUS_LAYER_ID,
      source: MINIMAP_FOCUS_SOURCE_ID,
    } as typeof shared
    const ensure = () => {
      if (!map.getSource(PIN_SOURCE_ID)) return
      try {
        if (!map.getSource(MINIMAP_FOCUS_SOURCE_ID))
          map.addSource(MINIMAP_FOCUS_SOURCE_ID, {
            type: 'geojson',
            data: focus as never,
          })
        if (!map.getLayer(MINIMAP_FOCUS_LAYER_ID)) map.addLayer(layer)
        const order = map.getLayersOrder()
        if (order[order.length - 1] !== MINIMAP_FOCUS_LAYER_ID)
          map.moveLayer(MINIMAP_FOCUS_LAYER_ID)
      } catch {
        // Style still loading: the next styledata or idle calls back.
      }
    }
    ensure()
    map.on('styledata', ensure)
    map.on('idle', ensure)
    return () => {
      map.off('styledata', ensure)
      map.off('idle', ensure)
      try {
        if (map.getLayer(MINIMAP_FOCUS_LAYER_ID))
          map.removeLayer(MINIMAP_FOCUS_LAYER_ID)
        if (map.getSource(MINIMAP_FOCUS_SOURCE_ID))
          map.removeSource(MINIMAP_FOCUS_SOURCE_ID)
      } catch {
        // The map is already gone.
      }
    }
  }, [map, fit, theme])

  const bounds = fit.bounds
  return (
    <div className="club-minimap__tiles" aria-hidden="true">
      <LazyBasemapMap
        ariaLabel="Club location map"
        interactive={false}
        attribution={false}
        onReady={m => {
          m.fitBounds(bounds, MINIMAP_FIT)
          setMap(m)
        }}
      />
    </div>
  )
}
