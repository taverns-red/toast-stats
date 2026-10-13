/**
 * #1943 — the district map's static preview. While MapLibre (232 KB) and its
 * worker load, the map box shows the district's clubs as dots, drawn from the
 * coordinates the page already has (the #1843 mini-map approach: zero
 * requests, no tiles). It cross-fades out once the live map first goes idle
 * (its first tiles and pins are painted).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { Map as MapLibreMap } from 'maplibre-gl'
import MapPreview from '../MapPreview'

afterEach(() => cleanup())

// Real D61 coordinates (snapshot 2026-10-11).
const CLUBS = [
  { clubId: '7238597', coordinates: { lat: 45.42197, lng: -75.69486 } },
  { clubId: '1001', coordinates: { lat: 45.3088, lng: -75.8987 } },
  { clubId: '1002', coordinates: { lat: 45.4805, lng: -75.5095 } },
  { clubId: '1003' },
]

/** The slice of the MapLibre API the preview uses: `loaded()`, `once`, `off`. */
function fakeMap(loaded = false) {
  const handlers = new Map<string, Set<() => void>>()
  const map = {
    loaded: () => loaded,
    once(type: string, fn: () => void) {
      if (!handlers.has(type)) handlers.set(type, new Set())
      handlers.get(type)!.add(fn)
      return map
    },
    off(type: string, fn: () => void) {
      handlers.get(type)?.delete(fn)
      return map
    },
    fire(type: string) {
      const fns = [...(handlers.get(type) ?? [])]
      handlers.get(type)?.clear()
      fns.forEach(fn => fn())
    },
    listeners: (type: string) => handlers.get(type)?.size ?? 0,
  }
  return map
}
const asMap = (m: ReturnType<typeof fakeMap>) => m as unknown as MapLibreMap

const preview = (c: HTMLElement) =>
  c.querySelector<HTMLElement>('[data-testid="map-preview"]')

describe('MapPreview', () => {
  it('draws one dot per located club, before the map exists', () => {
    const { container } = render(<MapPreview clubs={CLUBS} map={null} />)
    const el = preview(container)!
    expect(el).toHaveAttribute('data-state', 'loading')
    expect(el.querySelectorAll('svg circle.club-minimap__dot')).toHaveLength(3)
  })

  it('is decorative: hidden from assistive tech, never takes taps', () => {
    const { container } = render(<MapPreview clubs={CLUBS} map={null} />)
    expect(preview(container)).toHaveAttribute('aria-hidden', 'true')
  })

  it('stays until the live map first goes idle, then fades out', () => {
    const map = fakeMap()
    const { container } = render(<MapPreview clubs={CLUBS} map={asMap(map)} />)
    expect(preview(container)).toHaveAttribute('data-state', 'loading')
    act(() => map.fire('idle'))
    expect(preview(container)).toHaveAttribute('data-state', 'painted')
  })

  it('is already faded when the map painted before the preview mounted', () => {
    const { container } = render(
      <MapPreview clubs={CLUBS} map={asMap(fakeMap(true))} />
    )
    expect(preview(container)).toHaveAttribute('data-state', 'painted')
  })

  it('stops listening when unmounted', () => {
    const map = fakeMap()
    const { unmount } = render(<MapPreview clubs={CLUBS} map={asMap(map)} />)
    expect(map.listeners('idle')).toBe(1)
    unmount()
    expect(map.listeners('idle')).toBe(0)
  })

  it('renders nothing when no club has a location', () => {
    const { container } = render(
      <MapPreview clubs={[{ clubId: '1' }]} map={null} />
    )
    expect(preview(container)).toBeNull()
  })
})
