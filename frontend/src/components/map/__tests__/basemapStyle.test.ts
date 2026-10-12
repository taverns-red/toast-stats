import { describe, it, expect } from 'vitest'
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import {
  BASEMAP_ATTRIBUTION,
  BASEMAP_COLOURS,
  BASEMAP_SOURCE_ID,
  buildBasemapStyle,
} from '../basemapStyle'

/* #1786 — the basemap style. Colours are the ones the pin palette was
 * validated against (docs/design/map-pin-colour-modes.md §6.3); changing them
 * means re-running that validator, so they are pinned here. */

const URL = 'https://cdn.example.test/basemap/world.pmtiles'

describe('buildBasemapStyle', () => {
  it.each(['light', 'dark'] as const)(
    'is a valid MapLibre style in %s',
    theme => {
      const style = buildBasemapStyle({ theme, pmtilesUrl: URL })
      expect(validateStyleMin(style)).toEqual([])
    }
  )

  it('reads the tiles through the pmtiles:// protocol from the given URL', () => {
    const style = buildBasemapStyle({ theme: 'light', pmtilesUrl: URL })
    const source = style.sources[BASEMAP_SOURCE_ID]
    expect(source).toMatchObject({
      type: 'vector',
      url: `pmtiles://${URL}`,
    })
  })

  it('carries the ODbL + Protomaps attribution on the source', () => {
    const style = buildBasemapStyle({ theme: 'dark', pmtilesUrl: URL })
    const source = style.sources[BASEMAP_SOURCE_ID] as { attribution?: string }
    expect(source.attribution).toBe(BASEMAP_ATTRIBUTION)
    expect(BASEMAP_ATTRIBUTION).toContain('© ')
    expect(BASEMAP_ATTRIBUTION).toContain(
      'https://www.openstreetmap.org/copyright'
    )
    expect(BASEMAP_ATTRIBUTION).toContain('OpenStreetMap')
    expect(BASEMAP_ATTRIBUTION).toContain('Protomaps')
  })

  it('makes no third-party request: no glyphs, no sprite, no symbol layers', () => {
    for (const theme of ['light', 'dark'] as const) {
      const style = buildBasemapStyle({ theme, pmtilesUrl: URL })
      expect(style.glyphs).toBeUndefined()
      expect(style.sprite).toBeUndefined()
      expect(style.layers.some(l => l.type === 'symbol')).toBe(false)
      // Every network URL in the style is the one we were given.
      const urls = JSON.stringify(style).match(/https?:\/\/[^"\\]+/g) ?? []
      const network = urls.filter(
        u => !u.includes('openstreetmap.org') && !u.includes('github.com')
      )
      expect(new Set(network)).toEqual(new Set([URL]))
    }
  })

  it('uses the spec §6.3 land and water colours in each theme', () => {
    expect(BASEMAP_COLOURS).toEqual({
      light: { land: '#F4F1EB', water: '#C9D7E0' },
      dark: { land: '#1A1816', water: '#1E2A33' },
    })
    for (const theme of ['light', 'dark'] as const) {
      const style = buildBasemapStyle({ theme, pmtilesUrl: URL })
      const paint = (id: string) =>
        style.layers.find(l => l.id === id) as
          { paint?: Record<string, unknown> } | undefined
      expect(paint('background')?.paint?.['background-color']).toBe(
        BASEMAP_COLOURS[theme].land
      )
      expect(paint('earth')?.paint?.['fill-color']).toBe(
        BASEMAP_COLOURS[theme].land
      )
      expect(paint('water')?.paint?.['fill-color']).toBe(
        BASEMAP_COLOURS[theme].water
      )
    }
  })
})
