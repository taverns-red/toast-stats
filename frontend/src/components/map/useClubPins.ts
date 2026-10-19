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
 * The work itself is `pinRuntime`, with the layer specs and the icon
 * painter: one chunk (#1787, #1808: the map routes' first-load budget),
 * fetched as soon as the hook mounts — long before MapLibre is up — and the
 * pins are added once it has landed. This hook is only its React shell.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { ModeModel } from './pinModes'
import type { MapTheme, PinFeatureCollection } from './pinFeatures'
import type { PinState } from './pinRuntime'

type Runtime = typeof import('./pinRuntime')
let runtime: Runtime | null = null
const loadRuntime = () =>
  import('./pinRuntime').then(m => {
    runtime = m
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

export function useClubPins(map: MapLibreMap | null, opts: ClubPinsOptions) {
  const latest = useRef(opts)
  // Declared first, so it runs before the sync effect below.
  useEffect(() => {
    latest.current = opts
  })
  const state = useRef<PinState>({ built: null, fitted: null })
  const [rt, setRt] = useState(() => runtime)
  useEffect(() => {
    if (!rt) void loadRuntime().then(() => setRt(() => runtime))
  }, [rt])

  // Draw icons on demand, add/refresh the source and layers, refit.
  useEffect(() => {
    if (!map || !rt) return
    return rt.attachPins(map, latest, state.current)
    // `attachPins` reads the latest options; these are the triggers.
  }, [
    map,
    rt,
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
    if (!map || !rt) return
    const pins = state.current
    return () => rt.clearPins(map, pins)
  }, [map, rt])

  // Taps and the pointer cursor.
  useEffect(() => {
    if (!map || !rt) return
    return rt.bindPinEvents(map, latest)
  }, [map, rt])

  // "Reset map view" (#2173): back to the framing the last fit chose.
  const resetView = useCallback(() => {
    if (map && rt) rt.resetView(map, state.current)
  }, [map, rt])
  return { resetView }
}
