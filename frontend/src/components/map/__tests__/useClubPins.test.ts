/**
 * useClubPins lets go cleanly (#1819): when it is handed `null` instead of
 * the map (the page while the realignment sandbox draws its own pins), it
 * removes the pin layers and source it added, so the next user of the map
 * starts clean, and it rebuilds them when it gets the map back.
 */
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { useClubPins, type ClubPinsOptions } from '../useClubPins'
import { buildModeModel } from '../pinModes'
import { PIN_LAYER_IDS, PIN_SOURCE_ID } from '../pinLayer'

function fakeMap() {
  const layers = new Set<string>()
  const sources = new Set<string>()
  const map = {
    layers,
    sources,
    setMissingStyleImageResolver: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    hasImage: () => false,
    getSource: (id: string) =>
      sources.has(id) ? { setData: vi.fn() } : undefined,
    getLayer: (id: string) => (layers.has(id) ? { id } : undefined),
    addSource: (id: string) => sources.add(id),
    removeSource: vi.fn((id: string) => sources.delete(id)),
    addLayer: (l: { id: string }) => layers.add(l.id),
    removeLayer: vi.fn((id: string) => layers.delete(id)),
    setFilter: vi.fn(),
    fitBounds: vi.fn(),
    getCanvas: () => ({ style: {} }),
  }
  return map
}

const opts: ClubPinsOptions = {
  data: { type: 'FeatureCollection', features: [] },
  model: buildModeModel('health'),
  theme: 'light',
  selectedIds: [],
  onSelect: () => {},
  fitKey: 'k',
}

describe('useClubPins', () => {
  it('removes its layers and source when handed null, and rebuilds on return', () => {
    const map = fakeMap()
    const { rerender } = renderHook(
      ({ m }: { m: MapLibreMap | null }) => useClubPins(m, opts),
      { initialProps: { m: map as unknown as MapLibreMap } }
    )
    expect(map.sources.has(PIN_SOURCE_ID)).toBe(true)
    expect([...map.layers]).toEqual(expect.arrayContaining([...PIN_LAYER_IDS]))

    rerender({ m: null })
    expect(map.layers.size).toBe(0)
    expect(map.sources.size).toBe(0)

    rerender({ m: map as unknown as MapLibreMap })
    expect(map.sources.has(PIN_SOURCE_ID)).toBe(true)
    expect(map.layers.size).toBe(PIN_LAYER_IDS.length)
  })
})
