import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

/* #1786 — the basemap component. jsdom has no WebGL, so MapLibre itself is
 * replaced by a recorder with the constructor/method shapes of maplibre-gl
 * 6.14's `maplibre-gl.d.ts` (Map, addProtocol, setWorkerUrl). What is tested
 * is our wiring: the style handed over, the attribution kept visible, the
 * pmtiles protocol registered once, theme changes restyling the same map, and
 * the map torn down on unmount. Rendering is covered by the 375 smoke. */

interface Recorded {
  options: Record<string, unknown>
  setStyle: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
}

const hoisted = vi.hoisted(() => ({
  maps: [] as Recorded[],
  addProtocol: vi.fn(),
  setWorkerUrl: vi.fn(),
}))

vi.mock('maplibre-gl', () => {
  class Map {
    setStyle = vi.fn()
    remove = vi.fn()
    on = vi.fn()
    constructor(options: Record<string, unknown>) {
      hoisted.maps.push({
        options,
        setStyle: this.setStyle,
        remove: this.remove,
      })
    }
  }
  return {
    Map,
    addProtocol: hoisted.addProtocol,
    setWorkerUrl: hoisted.setWorkerUrl,
  }
})
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}))
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?url', () => ({
  default: '/assets/maplibre-gl-worker-hash.mjs',
}))

const theme = vi.hoisted(() => ({ isDark: false }))
vi.mock('../../../contexts/DarkModeContext', () => ({
  useDarkMode: () => ({
    isDark: theme.isDark,
    toggle: () => {},
    setTheme: () => {},
  }),
}))

import BasemapMap from '../BasemapMap'
import { BASEMAP_ATTRIBUTION, BASEMAP_COLOURS } from '../basemapStyle'

const URL = 'https://cdn.example.test/basemap/world.pmtiles'

function backgroundOf(style: unknown): unknown {
  const layers = (style as { layers: Array<{ id: string; paint?: object }> })
    .layers
  return (
    layers.find(l => l.id === 'background')?.paint as Record<string, unknown>
  )['background-color']
}

describe('BasemapMap', () => {
  beforeEach(() => {
    hoisted.maps.length = 0
    theme.isDark = false
  })

  it('renders a labelled map region and hands MapLibre the basemap style', () => {
    render(<BasemapMap ariaLabel="District 61 club map" pmtilesUrl={URL} />)
    const region = screen.getByRole('region', { name: 'District 61 club map' })
    expect(region).toBeInTheDocument()

    expect(hoisted.maps).toHaveLength(1)
    const opts = hoisted.maps[0]!.options
    expect(opts['container']).toBeInstanceOf(HTMLElement)
    expect(region.contains(opts['container'] as HTMLElement)).toBe(true)
    const style = opts['style'] as { sources: Record<string, { url: string }> }
    expect(Object.values(style.sources)[0]!.url).toBe(`pmtiles://${URL}`)
    expect(backgroundOf(style)).toBe(BASEMAP_COLOURS.light.land)
  })

  it('keeps the ODbL attribution expanded (never collapsed behind an icon)', () => {
    render(<BasemapMap ariaLabel="Map" pmtilesUrl={URL} />)
    expect(hoisted.maps[0]!.options['attributionControl']).toEqual({
      compact: false,
    })
    const style = hoisted.maps[0]!.options['style'] as {
      sources: Record<string, { attribution: string }>
    }
    expect(Object.values(style.sources)[0]!.attribution).toBe(
      BASEMAP_ATTRIBUTION
    )
  })

  it('registers the pmtiles protocol and the bundled worker once', async () => {
    // A fresh module instance: registration is per page, not per test.
    vi.resetModules()
    const { default: Fresh } = await import('../BasemapMap')
    hoisted.addProtocol.mockClear()
    hoisted.setWorkerUrl.mockClear()
    render(<Fresh ariaLabel="A" pmtilesUrl={URL} />)
    render(<Fresh ariaLabel="B" pmtilesUrl={URL} />)
    expect(hoisted.addProtocol).toHaveBeenCalledTimes(1)
    expect(hoisted.addProtocol.mock.calls[0]![0]).toBe('pmtiles')
    expect(hoisted.setWorkerUrl).toHaveBeenCalledTimes(1)
    expect(hoisted.setWorkerUrl).toHaveBeenCalledWith(
      '/assets/maplibre-gl-worker-hash.mjs'
    )
  })

  it('starts in the dark style when the app is dark', () => {
    theme.isDark = true
    render(<BasemapMap ariaLabel="Map" pmtilesUrl={URL} />)
    expect(backgroundOf(hoisted.maps[0]!.options['style'])).toBe(
      BASEMAP_COLOURS.dark.land
    )
  })

  it('restyles the same map on a theme change instead of rebuilding it', () => {
    const { rerender } = render(<BasemapMap ariaLabel="Map" pmtilesUrl={URL} />)
    theme.isDark = true
    act(() => {
      rerender(<BasemapMap ariaLabel="Map" pmtilesUrl={URL} />)
    })
    expect(hoisted.maps).toHaveLength(1)
    const setStyle = hoisted.maps[0]!.setStyle
    expect(setStyle).toHaveBeenCalledTimes(1)
    expect(backgroundOf(setStyle.mock.calls[0]![0])).toBe(
      BASEMAP_COLOURS.dark.land
    )
  })

  it('removes the map on unmount', () => {
    const { unmount } = render(<BasemapMap ariaLabel="Map" pmtilesUrl={URL} />)
    unmount()
    expect(hoisted.maps[0]!.remove).toHaveBeenCalledTimes(1)
  })
})
