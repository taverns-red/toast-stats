/**
 * BasemapMap — a MapLibre map on the self-hosted Protomaps basemap (#1786,
 * ADR-016).
 *
 * This module pulls in MapLibre GL (~286 KB gzip, plus its ~144 KB worker), so
 * it must only ever be reached through `LazyBasemapMap` (a dynamic import):
 * the `maplibre` chunk is a route-only chunk, and
 * `scripts/check-critical-path.ts` fails the build if it lands on the
 * critical path of every route.
 *
 * It fills its parent; the parent owns the size (reserve it before the chunk
 * loads, Lesson 107). Pins, clustering and legends belong to the map pages
 * (#1784, #1808, #1809), which get the live map through `onReady`.
 */
import { useEffect, useRef } from 'react'
import { Map as MapLibreMap, addProtocol, setWorkerUrl } from 'maplibre-gl'
import type { LngLatLike } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// The worker is a self-contained ES module; `?url` makes Vite emit it as a
// same-origin asset, so CSP `worker-src` falls back to `script-src 'self'`.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { Protocol } from 'pmtiles'
import { useDarkMode } from '../../contexts/DarkModeContext'
import { basemapUrl } from '../../config/basemap'
import { buildBasemapStyle, type BasemapTheme } from './basemapStyle'

// Labels (#2081) come after the basemap's first render, from their own lazy
// chunk: the first tile is never waiting on them, and the map route's fixed
// bytes stay inside the ADR-016 budget. They draw on the canvas, so they
// cannot shift the layout.
type Labels = typeof import('./basemapLabels')
const loadLabels = (): Promise<Labels> => import('./basemapLabels')

let registered = false

/** One pmtiles protocol and one worker URL per page, however many maps. */
function ensureRegistered(): void {
  if (registered) return
  registered = true
  setWorkerUrl(workerUrl)
  const protocol = new Protocol()
  addProtocol('pmtiles', protocol.tile)
}

export interface BasemapMapProps {
  /** Accessible name of the map region. */
  ariaLabel: string
  /** Defaults to the CDN basemap (`config/basemap.ts`). */
  pmtilesUrl?: string
  initialView?: { center: LngLatLike; zoom: number }
  /** Called once with the live map (add sources/layers here). */
  onReady?: (map: MapLibreMap) => void
  className?: string
  /** Two-finger pan on touch so the page scrolls past an embedded map.
   *  A full-height map page (#1784) turns it off: one finger pans. */
  cooperativeGestures?: boolean
  /** #2162 — false makes a static picture: no pan, zoom, keyboard or
   *  gestures, and the canvas leaves the tab order. Default true. */
  interactive?: boolean
  /** #2162 — false drops MapLibre's credit control. The caller must then
   *  print `BASEMAP_ATTRIBUTION` visibly beside the map (ODbL). Default
   *  true. */
  attribution?: boolean
}

export default function BasemapMap({
  ariaLabel,
  pmtilesUrl,
  initialView = { center: [0, 20], zoom: 1 },
  onReady,
  className,
  cooperativeGestures = true,
  interactive = true,
  attribution = true,
}: BasemapMapProps) {
  const { isDark } = useDarkMode()
  const theme: BasemapTheme = isDark ? 'dark' : 'light'
  const url = pmtilesUrl ?? basemapUrl()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const styledRef = useRef<{ theme: BasemapTheme; url: string } | null>(null)
  const labelsRef = useRef<Labels | null>(null)
  // The first render's view and callback seed the map; later changes to
  // them are the page's job through the map instance.
  const seedRef = useRef({
    initialView,
    onReady,
    theme,
    url,
    cooperativeGestures,
    interactive,
    attribution,
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    ensureRegistered()
    const seed = seedRef.current
    const map = new MapLibreMap({
      container,
      style: buildBasemapStyle({ theme: seed.theme, pmtilesUrl: seed.url }),
      center: seed.initialView.center,
      zoom: seed.initialView.zoom,
      // ODbL: the credit stays visible, never collapsed behind an icon.
      // Off only when the caller prints it beside the map (#2162).
      attributionControl: seed.attribution ? { compact: false } : false,
      interactive: seed.interactive,
      // Embedded maps: page scroll keeps working; two fingers pan the map.
      // A static picture has no gestures to cooperate with.
      cooperativeGestures: seed.interactive && seed.cooperativeGestures,
    })
    mapRef.current = map
    styledRef.current = { theme: seed.theme, url: seed.url }
    map.once('idle', () => {
      void loadLabels().then(labels => {
        const styled = styledRef.current
        if (mapRef.current !== map || !styled) return
        labelsRef.current = labels
        labels.addBasemapLabels(map, {
          theme: styled.theme,
          origin: window.location.origin,
        })
      })
    })
    seed.onReady?.(map)
    return () => {
      map.remove()
      mapRef.current = null
      styledRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const styled = styledRef.current
    if (!map || !styled) return
    if (styled.theme === theme && styled.url === url) return
    const style = buildBasemapStyle({ theme, pmtilesUrl: url })
    const labels = labelsRef.current
    map.setStyle(
      labels
        ? labels.withBasemapLabels(style, {
            theme,
            origin: window.location.origin,
          })
        : style
    )
    styledRef.current = { theme, url }
  }, [theme, url])

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      className={['basemap-surface', className].filter(Boolean).join(' ')}
      style={{ position: 'relative', width: '100%', height: '100%' }}
      data-testid="basemap-map"
    >
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
    </div>
  )
}
