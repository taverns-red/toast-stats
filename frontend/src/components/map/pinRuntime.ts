/**
 * The club pins' MapLibre runtime (#1784): what `useClubPins` does to a live
 * map — draw icons on demand, keep the clustered source and its three
 * layers in step, refit, clear, and answer taps. Moved out of the hook
 * (#1808) with the layer specs (`pinLayer`) and the icon painter
 * (`pinImages`): it only ever runs once MapLibre is up, so it is one
 * on-demand chunk the hook fetches on mount (as the painter alone was,
 * #1787), off the map routes' first load (300 KB, ADR-016 D2).
 *
 * Only MapLibre *types* are imported: the runtime arrives with the map.
 */
import type {
  GeoJSONSource,
  LngLatBoundsLike,
  Map as MapLibreMap,
  MapGeoJSONFeature,
  MapMouseEvent,
} from 'maplibre-gl'
import type { ModeModel } from './pinModes'
import {
  CLUSTER_LAYER_ID,
  PIN_LAYER_ID,
  PIN_LAYER_IDS,
  PIN_SOURCE_ID,
  SELECTED_LAYER_ID,
  clubPinLayers,
  parseIconId,
  pinSourceSpec,
  selectedFilter,
  type MapTheme,
  type PinFeatureCollection,
} from './pinLayer'
import { drawIcon } from './pinImages'
import { PIN_HEAD_LIFT } from './pinGlyphs'

/** The hook's options, as the runtime reads them (always the latest). */
export interface PinRuntimeOptions {
  data: PinFeatureCollection
  model: ModeModel
  theme: MapTheme
  selectedIds: readonly string[]
  onSelect: (ids: string[]) => void
  fitKey: string
}

/** What the hook keeps between syncs, so a rebuild is only on change. */
export interface PinState {
  built: { mode: ModeModel; theme: MapTheme } | null
  fitted: string | null
  /** The framing the last fit chose: "Reset map view" returns to it. */
  home?: LngLatBoundsLike | null
}

/** The fit the initial view and "Reset map view" share (#2173). */
export const PIN_FIT = { padding: 48, maxZoom: 12 } as const

type Latest = { readonly current: PinRuntimeOptions }

const HIT = 22

const reducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

function boundsOf(data: PinFeatureCollection): LngLatBoundsLike | null {
  if (data.features.length === 0) return null
  let w = 180
  let s = 90
  let e = -180
  let n = -90
  for (const f of data.features) {
    const [x, y] = f.geometry.coordinates
    w = Math.min(w, x)
    e = Math.max(e, x)
    s = Math.min(s, y)
    n = Math.max(n, y)
  }
  return [
    [w, s],
    [e, n],
  ]
}

/** Draw icons on demand, add/refresh the source and layers, refit; returns
 *  the detach. */
export function attachPins(
  map: MapLibreMap,
  latest: Latest,
  state: PinState
): () => void {
  const onMissing = (id: string) => {
    const spec = parseIconId(id)
    if (!spec || map.hasImage(id)) return
    const dpr = Math.min(3, Math.ceil(window.devicePixelRatio || 1))
    const icon = drawIcon(spec, dpr)
    if (icon) map.addImage(id, icon, { pixelRatio: dpr })
  }
  const sync = () => {
    const o = latest.current
    const source = map.getSource(PIN_SOURCE_ID) as GeoJSONSource | undefined
    const stale =
      !source || state.built?.mode !== o.model || state.built?.theme !== o.theme
    try {
      if (stale) {
        for (const id of PIN_LAYER_IDS)
          if (map.getLayer(id)) map.removeLayer(id)
        if (source) map.removeSource(PIN_SOURCE_ID)
        map.addSource(PIN_SOURCE_ID, pinSourceSpec(o.data, o.model))
        for (const layer of clubPinLayers(o.model, o.theme, o.selectedIds))
          map.addLayer(layer)
        state.built = { mode: o.model, theme: o.theme }
      } else {
        source.setData(o.data as Parameters<GeoJSONSource['setData']>[0])
        map.setFilter(SELECTED_LAYER_ID, selectedFilter(o.selectedIds))
      }
    } catch {
      // Style still loading: `styledata` calls back once it is ready.
      state.built = null
      return
    }
    if (state.fitted !== o.fitKey) {
      const bounds = boundsOf(o.data)
      if (bounds) {
        map.fitBounds(bounds, { ...PIN_FIT, animate: false })
        state.fitted = o.fitKey
        state.home = bounds
      }
    }
  }
  const onStyle = () => {
    if (!map.getSource(PIN_SOURCE_ID)) {
      state.built = null
      sync()
    }
  }
  // MapLibre 6: images are resolved here; adding one from the
  // `styleimagemissing` event is too late (it fires once already missing).
  map.setMissingStyleImageResolver(onMissing)
  map.on('styledata', onStyle)
  sync()
  return () => {
    map.setMissingStyleImageResolver(null)
    map.off('styledata', onStyle)
  }
}

/** Back to the framing the last fit chose (#2173): the same `fitBounds`. */
export function resetView(map: MapLibreMap, state: PinState): void {
  if (!state.home) return
  map.fitBounds(state.home, { ...PIN_FIT, animate: !reducedMotion() })
}

/** Take the pins off the map, so its next user starts clean. */
export function clearPins(map: MapLibreMap, state: PinState): void {
  state.built = null
  try {
    for (const id of PIN_LAYER_IDS) if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource(PIN_SOURCE_ID)) map.removeSource(PIN_SOURCE_ID)
  } catch {
    // The map is already gone.
  }
}

/** Taps and the pointer cursor; returns the unbind. A cluster zooms to its
 *  expansion zoom; a pin selects every club at that spot. */
export function bindPinEvents(map: MapLibreMap, latest: Latest): () => void {
  const hits = (e: MapMouseEvent): MapGeoJSONFeature[] => {
    if (!map.getLayer(PIN_LAYER_ID)) return []
    const { x, y } = e.point
    return map.queryRenderedFeatures(
      [
        [x - HIT, y - HIT],
        [x + HIT, y + HIT],
      ],
      { layers: [CLUSTER_LAYER_ID, PIN_LAYER_ID] }
    )
  }
  const onClick = (e: MapMouseEvent) => {
    const found = hits(e)
    if (found.length === 0) {
      latest.current.onSelect([])
      return
    }
    const dist = (f: MapGeoJSONFeature) => {
      const p = map.project(
        (f.geometry as { coordinates: [number, number] }).coordinates
      )
      // A pin's head sits above its tip (#2173); a cluster is centred.
      const lift = f.properties['cluster'] ? 0 : PIN_HEAD_LIFT
      return (p.x - e.point.x) ** 2 + (p.y - lift - e.point.y) ** 2
    }
    const nearest = found.reduce((a, b) => (dist(b) < dist(a) ? b : a))
    const at = (nearest.geometry as { coordinates: [number, number] })
      .coordinates
    if (nearest.properties['cluster']) {
      const source = map.getSource(PIN_SOURCE_ID) as GeoJSONSource
      void source
        .getClusterExpansionZoom(nearest.properties['cluster_id'] as number)
        .then(zoom => {
          const view = { center: at, zoom }
          if (reducedMotion()) map.jumpTo(view)
          else map.easeTo(view)
        })
      return
    }
    const same = found.filter(f => {
      const c = (f.geometry as { coordinates: [number, number] }).coordinates
      return !f.properties['cluster'] && c[0] === at[0] && c[1] === at[1]
    })
    latest.current.onSelect([
      ...new Set(same.map(f => String(f.properties['id']))),
    ])
  }
  const onMove = (e: MapMouseEvent) => {
    map.getCanvas().style.cursor = hits(e).length ? 'pointer' : ''
  }
  map.on('click', onClick)
  map.on('mousemove', onMove)
  return () => {
    map.off('click', onClick)
    map.off('mousemove', onMove)
  }
}
