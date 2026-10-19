/**
 * #2162 — the club mini-map's tile layer: the shared basemap as a static
 * picture, with the club pins drawn by the shared pin code (`useClubPins` →
 * `pinRuntime`), so a redesign of the club pins reaches the mini-map too.
 *
 * jsdom has no WebGL: the basemap is replaced by a stub that hands over a
 * recorder with maplibre-gl 6.14's method shapes (fitBounds, on/off,
 * getSource/getLayer/addSource/addLayer/moveLayer/getLayersOrder). What is
 * tested is our wiring; drawing is covered by the club page smoke.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { useEffect } from 'react'
import { fitClubLocator } from '../../../utils/clubLocator'
import {
  PIN_SOURCE_ID,
  SELECTED_LAYER_ID,
  clubPinLayers,
} from '../../map/pinLayer'
import {
  LOCATOR_FOCUS,
  LOCATOR_MODEL,
  LOCATOR_OTHER,
  MINIMAP_FOCUS_LAYER_ID,
  MINIMAP_FOCUS_SOURCE_ID,
} from '../locatorPins'
import D53 from '../../../utils/__tests__/fixtures/d53-club-coordinates-2026-10-18.json'

type Handler = (e?: unknown) => void

class FakeMap {
  handlers = new Map<string, Set<Handler>>()
  sources = new Map<string, unknown>()
  layers: Array<{ id: string } & Record<string, unknown>> = []
  fitBounds = vi.fn()
  moveLayer = vi.fn((id: string) => {
    const i = this.layers.findIndex(l => l.id === id)
    const [l] = this.layers.splice(i, 1)
    this.layers.push(l!)
  })
  on(type: string, fn: Handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set())
    this.handlers.get(type)!.add(fn)
    return this
  }
  off(type: string, fn: Handler) {
    this.handlers.get(type)?.delete(fn)
    return this
  }
  fire(type: string, e?: unknown) {
    for (const fn of [...(this.handlers.get(type) ?? [])]) fn(e)
  }
  getSource(id: string) {
    return this.sources.get(id)
  }
  addSource(id: string, spec: unknown) {
    this.sources.set(id, spec)
  }
  removeSource(id: string) {
    this.sources.delete(id)
  }
  getLayer(id: string) {
    return this.layers.find(l => l.id === id)
  }
  addLayer(layer: { id: string } & Record<string, unknown>) {
    this.layers.push(layer)
  }
  removeLayer(id: string) {
    this.layers = this.layers.filter(l => l.id !== id)
  }
  getLayersOrder() {
    return this.layers.map(l => l.id)
  }
}

const hoisted = vi.hoisted(() => ({
  basemapProps: [] as Array<Record<string, unknown>>,
  pins: [] as Array<{ map: unknown; opts: Record<string, unknown> }>,
  map: null as unknown,
  isDark: false,
}))

function FakeBasemap(props: Record<string, unknown>) {
  hoisted.basemapProps.push(props)
  useEffect(() => {
    ;(props['onReady'] as (m: unknown) => void)(hoisted.map)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <div data-testid="basemap" />
}
vi.mock('../../map/LazyBasemapMap', () => ({ default: FakeBasemap }))
vi.mock('../../map/useClubPins', () => ({
  useClubPins: (map: unknown, opts: Record<string, unknown>) => {
    hoisted.pins.push({ map, opts })
  },
}))
vi.mock('../../../contexts/DarkModeContext', () => ({
  useDarkMode: () => ({ isDark: hoisted.isDark }),
}))

import ClubMiniMapTiles from '../ClubMiniMapTiles'

const HARTFORD = '5520'
const VOYA = '28675595'

let map: FakeMap
beforeEach(() => {
  map = new FakeMap()
  hoisted.map = map
  hoisted.basemapProps.length = 0
  hoisted.pins.length = 0
  hoisted.isDark = false
})
afterEach(() => cleanup())

const renderTiles = (focusId = HARTFORD) => {
  const onPainted = vi.fn()
  const onFailed = vi.fn()
  const fit = fitClubLocator(D53, focusId)!
  const utils = render(
    <ClubMiniMapTiles fit={fit} onPainted={onPainted} onFailed={onFailed} />
  )
  return { ...utils, fit, onPainted, onFailed }
}

describe('ClubMiniMapTiles', () => {
  it('is a static, hidden picture: no pan or zoom, credit printed by the card', () => {
    const { container } = renderTiles()
    const props = hoisted.basemapProps[0]!
    expect(props['interactive']).toBe(false)
    expect(props['attribution']).toBe(false)
    // The card's link carries the name; the canvas is decoration.
    expect(
      container
        .querySelector('.club-minimap__tiles')!
        .getAttribute('aria-hidden')
    ).toBe('true')
  })

  it('has no control stack: no zoom, no "Reset map view" (#2173)', () => {
    const { container } = renderTiles()
    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('.map-view-controls')).toBeNull()
  })

  it('frames the trimmed bounds before the first tile is requested', () => {
    const { fit } = renderTiles()
    expect(map.fitBounds).toHaveBeenCalledWith(fit.bounds, {
      padding: 48,
      maxZoom: 12,
      animate: false,
    })
  })

  it('draws every kept club through the shared pin code, this club in red', () => {
    const { fit } = renderTiles()
    const last = hoisted.pins.at(-1)!
    expect(last.map).toBe(map)
    expect(last.opts['model']).toBe(LOCATOR_MODEL)
    const data = last.opts['data'] as {
      features: Array<{ properties: { id: string; k: number; f: string } }>
    }
    expect(data.features).toHaveLength(fit.inView.length)
    const focus = data.features.filter(f => f.properties.id === HARTFORD)
    expect(focus).toHaveLength(1)
    expect(focus[0]!.properties.k).toBe(0)
    expect(focus[0]!.properties.f).toBe(LOCATOR_FOCUS.fill)
    const ids = data.features.map(f => f.properties.id)
    expect(ids).not.toContain(VOYA)
    expect(
      data.features
        .filter(f => f.properties.id !== HARTFORD)
        .every(f => f.properties.f === LOCATOR_OTHER.fill)
    ).toBe(true)
  })

  it("keeps this club's pin on top of any group, with the shared selected icon", () => {
    renderTiles()
    // Before the shared pins are up, nothing is added (their image resolver
    // draws the icon).
    act(() => map.fire('styledata'))
    expect(map.getLayer(MINIMAP_FOCUS_LAYER_ID)).toBeUndefined()

    map.addSource(PIN_SOURCE_ID, {})
    map.addLayer({ id: 'club-pins' })
    act(() => map.fire('idle'))
    const layer = map.getLayer(MINIMAP_FOCUS_LAYER_ID)!
    const shared = clubPinLayers(LOCATOR_MODEL, 'light', [HARTFORD]).find(
      l => l.id === SELECTED_LAYER_ID
    ) as unknown as Record<string, unknown>
    expect(layer['layout']).toEqual(shared['layout'])
    expect(layer['source']).toBe(MINIMAP_FOCUS_SOURCE_ID)
    expect(map.getLayersOrder().at(-1)).toBe(MINIMAP_FOCUS_LAYER_ID)

    // A later layer (the basemap labels) does not bury it.
    map.addLayer({ id: 'label-cities' })
    act(() => map.fire('styledata'))
    expect(map.getLayersOrder().at(-1)).toBe(MINIMAP_FOCUS_LAYER_ID)
  })

  it('draws no focus pin when this club is an outlier', () => {
    renderTiles(VOYA)
    map.addSource(PIN_SOURCE_ID, {})
    act(() => map.fire('idle'))
    expect(map.getLayer(MINIMAP_FOCUS_LAYER_ID)).toBeUndefined()
  })

  it('reports painted on the first idle, failed on an error before it', () => {
    const a = renderTiles()
    act(() => map.fire('idle'))
    act(() => map.fire('idle'))
    expect(a.onPainted).toHaveBeenCalledTimes(1)
    act(() => map.fire('error', { error: new Error('late glyph') }))
    expect(a.onFailed).not.toHaveBeenCalled()
    cleanup()

    map = new FakeMap()
    hoisted.map = map
    const b = renderTiles()
    act(() => map.fire('error', { error: new Error('pmtiles 404') }))
    expect(b.onFailed).toHaveBeenCalledTimes(1)
    act(() => map.fire('idle'))
    expect(b.onPainted).not.toHaveBeenCalled()
  })
})
