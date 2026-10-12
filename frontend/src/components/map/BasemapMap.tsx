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
}

export default function BasemapMap({
  ariaLabel,
  pmtilesUrl,
  initialView = { center: [0, 20], zoom: 1 },
  onReady,
  className,
}: BasemapMapProps) {
  const { isDark } = useDarkMode()
  const theme: BasemapTheme = isDark ? 'dark' : 'light'
  const url = pmtilesUrl ?? basemapUrl()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const styledRef = useRef<{ theme: string; url: string } | null>(null)
  // The first render's view and callback seed the map; later changes to
  // them are the page's job through the map instance.
  const seedRef = useRef({ initialView, onReady, theme, url })

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
      attributionControl: { compact: false },
      // Page scroll keeps working on phones; two fingers pan the map.
      cooperativeGestures: true,
    })
    mapRef.current = map
    styledRef.current = { theme: seed.theme, url: seed.url }
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
    map.setStyle(buildBasemapStyle({ theme, pmtilesUrl: url }))
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
