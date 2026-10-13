/**
 * MapPinKeys — the keyboard path between map pins (#1940).
 *
 * The pins are symbols on a WebGL canvas, so nothing on it can take focus.
 * This overlay mirrors the pins the map has drawn as real buttons, each over
 * its pin: one Tab stop (a roving tabindex), the arrows and Home/End move
 * between pins in reading order (north to south, then west to east), Enter
 * opens the club the way a tap does (or zooms a cluster), and Escape closes
 * the club and leaves focus on its pin. Tab always moves on: no trap. Each
 * button is named by club and category, never by colour.
 *
 * Only the focused button is visible. The buttons ignore the pointer, so
 * taps and drags still reach the map. An on-demand chunk: the map route's
 * first load stays within its budget.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import type { ModeModel } from './pinModes'
import {
  HALF,
  pinTargets,
  type PinTarget,
  type Project,
  type RenderedPin,
} from './pinTargets'

/** Arrow, Home and End keys: the next index from the current one. */
const STEPS: Record<string, (i: number, n: number) => number> = {
  ArrowRight: i => i + 1,
  ArrowDown: i => i + 1,
  ArrowLeft: i => i - 1,
  ArrowUp: i => i - 1,
  Home: () => 0,
  End: (_, n) => n - 1,
}

const place = (p: { x: number; y: number }) =>
  `translate(${Math.round(p.x - HALF)}px, ${Math.round(p.y - HALF)}px)`

const reducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export interface MapPinKeysProps {
  map: MapLibreMap
  clubs: readonly ClubTrend[]
  model: ModeModel
  selectedIds: readonly string[]
  onSelect: (ids: string[]) => void
  /** The pin source and layers (`pinLayer.ts`), handed down so this chunk
   *  never pulls the page's pin module into a shared chunk (budget). */
  layers: { source: string; cluster: string; pin: string }
}

export const MapPinKeys: React.FC<MapPinKeysProps> = ({
  map,
  clubs,
  model,
  selectedIds,
  onSelect,
  layers: { source: sourceId, cluster, pin },
}) => {
  const project = useCallback<Project>(at => map.project(at), [map])
  const read = useCallback((): PinTarget[] => {
    try {
      if (!map.getLayer(pin)) return []
      const found = map.queryRenderedFeatures({
        layers: [cluster, pin],
      }) as unknown as RenderedPin[]
      return pinTargets(found, project, clubs, model)
    } catch {
      // The map is gone or its style is still loading.
      return []
    }
  }, [map, project, clubs, model, cluster, pin])

  const [targets, setTargets] = useState<PinTarget[]>(read)
  const [active, setActive] = useState<string | null>(null)
  const [said, setSaid] = useState('')
  const targetsRef = useRef(targets)
  useEffect(() => {
    targetsRef.current = targets
  }, [targets])
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  // After a cluster zooms, focus lands on the pin nearest where it was.
  const refocus = useRef<[number, number] | null>(null)

  // Re-read the pins whenever the map settles; follow it while it moves.
  useEffect(() => {
    const refresh = () => setTargets(read())
    let frame = 0
    const follow = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        for (const t of targetsRef.current) {
          const el = buttons.current.get(t.key)
          if (el) el.style.transform = place(project(t.at))
        }
      })
    }
    refresh()
    map.on('idle', refresh)
    map.on('move', follow)
    return () => {
      map.off('idle', refresh)
      map.off('move', follow)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [map, read, project])
  useEffect(() => {
    const near = refocus.current
    if (!near || targets.length === 0) return
    refocus.current = null
    const p = project(near)
    const d = (t: PinTarget) => {
      const q = project(t.at)
      return (q.x - p.x) ** 2 + (q.y - p.y) ** 2
    }
    const best = targets.reduce((a, b) => (d(b) < d(a) ? b : a))
    setActive(best.key)
    buttons.current.get(best.key)?.focus()
  }, [targets, project])

  const current = targets.some(t => t.key === active)
    ? active
    : (targets[0]?.key ?? null)

  const activate = (t: PinTarget) => {
    if (!t.cluster) {
      onSelect(t.ids)
      setSaid(`Opened ${t.label}. Escape closes.`)
      return
    }
    const source = map.getSource(sourceId) as GeoJSONSource | undefined
    void source?.getClusterExpansionZoom(t.cluster.id).then(zoom => {
      refocus.current = t.at
      const view = { center: t.at, zoom }
      if (reducedMotion()) map.jumpTo(view)
      else map.easeTo(view)
    })
  }

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'Escape') {
      if (selectedIds.length === 0) return
      e.preventDefault()
      onSelect([])
      setSaid('Closed.')
      return
    }
    const step = STEPS[e.key]
    if (!step) return
    e.preventDefault()
    const next = step(i, targets.length)
    const t = targets[Math.max(0, Math.min(targets.length - 1, next))]
    if (!t) return
    setActive(t.key)
    buttons.current.get(t.key)?.focus()
  }

  if (targets.length === 0) return null
  return (
    <>
      <p role="status" className="sr-only">
        {said}
      </p>
      <div
        role="toolbar"
        aria-label="Club pins. Arrow keys move between pins, Enter opens one"
        className="map-pin-keys"
      >
        {targets.map((t, i) => (
          <button
            key={t.key}
            ref={el => {
              if (el) buttons.current.set(t.key, el)
              else buttons.current.delete(t.key)
            }}
            type="button"
            className="map-pin-keys__pin"
            tabIndex={t.key === current ? 0 : -1}
            aria-label={t.label}
            style={{ transform: place(project(t.at)) }}
            onFocus={() => setActive(t.key)}
            onClick={() => activate(t)}
            onKeyDown={e => onKeyDown(e, i)}
          />
        ))}
      </div>
    </>
  )
}

export default MapPinKeys
