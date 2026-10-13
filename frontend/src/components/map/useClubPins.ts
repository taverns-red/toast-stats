/**
 * useClubPins — put the club pins on a live MapLibre map (#1784).
 *
 * Keeps one clustered source and its three layers in step with the mode,
 * the filtered clubs, the theme and the selection. A basemap theme switch
 * (`setStyle`) drops runtime layers, so `styledata` re-adds them. Taps use
 * a 44 × 44 px box around the point (spec §3.1): the visual size never sets
 * the hit area. A cluster zooms to its expansion zoom; a pin selects every
 * club at that spot (co-located clubs never separate by zooming).
 *
 * Only MapLibre *types* are imported: the runtime arrives with the map.
 */
import { useEffect, useRef, useState } from 'react'
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

// The icon painter is its own chunk (#1787: the map route's first-load
// budget). It is fetched as soon as the hook mounts — long before MapLibre
// is up — and the pins are added once it has landed.
type Draw = typeof import('./pinImages').drawIcon
let draw: Draw | null = null
const loadDraw = () =>
  import('./pinImages').then(m => {
    draw = m.drawIcon
  })

export interface ClubPinsOptions {
  data: PinFeatureCollection
  model: ModeModel
  theme: MapTheme
  selectedIds: readonly string[]
  onSelect: (ids: string[]) => void
  /** Changes when the view should refit (district or date), not on filters. */
  fitKey: string
}

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

export function useClubPins(map: MapLibreMap | null, opts: ClubPinsOptions) {
  const latest = useRef(opts)
  // Declared first, so it runs before the sync effect below.
  useEffect(() => {
    latest.current = opts
  })
  const built = useRef<{ mode: ModeModel; theme: MapTheme } | null>(null)
  const fitted = useRef<string | null>(null)
  const [painter, setPainter] = useState(() => draw)
  useEffect(() => {
    if (!painter) void loadDraw().then(() => setPainter(() => draw))
  }, [painter])

  // Draw icons on demand, add/refresh the source and layers, refit.
  useEffect(() => {
    if (!map || !painter) return
    const onMissing = (id: string) => {
      const spec = parseIconId(id)
      if (!spec || map.hasImage(id)) return
      const dpr = Math.min(3, Math.ceil(window.devicePixelRatio || 1))
      const icon = painter(spec, dpr)
      if (icon) map.addImage(id, icon, { pixelRatio: dpr })
    }
    const sync = () => {
      const o = latest.current
      const source = map.getSource(PIN_SOURCE_ID) as GeoJSONSource | undefined
      const stale =
        !source ||
        built.current?.mode !== o.model ||
        built.current?.theme !== o.theme
      try {
        if (stale) {
          for (const id of PIN_LAYER_IDS)
            if (map.getLayer(id)) map.removeLayer(id)
          if (source) map.removeSource(PIN_SOURCE_ID)
          map.addSource(PIN_SOURCE_ID, pinSourceSpec(o.data, o.model))
          for (const layer of clubPinLayers(o.model, o.theme, o.selectedIds))
            map.addLayer(layer)
          built.current = { mode: o.model, theme: o.theme }
        } else {
          source.setData(o.data as Parameters<GeoJSONSource['setData']>[0])
          map.setFilter(SELECTED_LAYER_ID, selectedFilter(o.selectedIds))
        }
      } catch {
        // Style still loading: `styledata` calls back once it is ready.
        built.current = null
        return
      }
      if (fitted.current !== o.fitKey) {
        const bounds = boundsOf(o.data)
        if (bounds) {
          map.fitBounds(bounds, { padding: 48, maxZoom: 12, animate: false })
          fitted.current = o.fitKey
        }
      }
    }
    const onStyle = () => {
      if (!map.getSource(PIN_SOURCE_ID)) {
        built.current = null
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
    // `sync` reads the latest options; these are the triggers.
  }, [
    map,
    painter,
    opts.data,
    opts.model,
    opts.theme,
    opts.selectedIds,
    opts.fitKey,
  ])

  // Letting go of a map takes the pins along, so another user of the same
  // map (the realignment sandbox, #1819) starts clean, and so does this
  // hook when it gets the map back.
  useEffect(() => {
    if (!map) return
    return () => {
      built.current = null
      try {
        for (const id of PIN_LAYER_IDS)
          if (map.getLayer(id)) map.removeLayer(id)
        if (map.getSource(PIN_SOURCE_ID)) map.removeSource(PIN_SOURCE_ID)
      } catch {
        // The map is already gone.
      }
    }
  }, [map])

  // Taps and the pointer cursor.
  useEffect(() => {
    if (!map) return
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
        return (p.x - e.point.x) ** 2 + (p.y - e.point.y) ** 2
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
  }, [map])
}
