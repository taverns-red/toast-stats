import { describe, it, expect } from 'vitest'
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  BASEMAP_ATTRIBUTION,
  BASEMAP_COLOURS,
  BASEMAP_SOURCE_ID,
  buildBasemapStyle,
} from '../basemapStyle'
import { BASEMAP_MAX_ZOOM } from '../../../config/basemap'

/* #1786 — the basemap style. Colours are the ones the pin palette was
 * validated against (docs/design/map-pin-colour-modes.md §6.3); changing them
 * means re-running that validator, so they are pinned here. */

const ARCHIVE_URL = 'https://cdn.example.test/basemap/world.pmtiles'

/** A redesign.css token's hex in a theme (upper-cased, like the constants). */
function appToken(name: string, theme: 'light' | 'dark'): string {
  const css = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../styles/tokens/redesign.css'
    ),
    'utf8'
  ).replace(/\/\*[\s\S]*?\*\//g, '')
  const selector = theme === 'light' ? ':root' : "[data-theme='dark']"
  const open = css.indexOf('{', css.indexOf(selector))
  const block = css.slice(open + 1, css.indexOf('}', open))
  const m = block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`))
  if (!m) throw new Error(`${name} has no hex in ${selector}`)
  return m[1].toUpperCase()
}

describe('buildBasemapStyle', () => {
  it.each(['light', 'dark'] as const)(
    'is a valid MapLibre style in %s',
    theme => {
      const style = buildBasemapStyle({ theme, pmtilesUrl: ARCHIVE_URL })
      expect(validateStyleMin(style)).toEqual([])
    }
  )

  it('reads the tiles through the pmtiles:// protocol from the given URL', () => {
    const style = buildBasemapStyle({ theme: 'light', pmtilesUrl: ARCHIVE_URL })
    const source = style.sources[BASEMAP_SOURCE_ID]
    expect(source).toMatchObject({
      type: 'vector',
      url: `pmtiles://${ARCHIVE_URL}`,
    })
  })

  it('caps the source at the archive max zoom so MapLibre over-zooms past it', () => {
    // #2084: world z0–14. An explicit source maxzoom wins over the archive
    // header's TileJSON, so a mismatched archive cannot ask for z15 tiles.
    const style = buildBasemapStyle({ theme: 'light', pmtilesUrl: ARCHIVE_URL })
    expect(style.sources[BASEMAP_SOURCE_ID]).toMatchObject({ maxzoom: 14 })
    expect(BASEMAP_MAX_ZOOM).toBe(14)
  })

  it('carries the ODbL + Protomaps attribution on the source', () => {
    const style = buildBasemapStyle({ theme: 'dark', pmtilesUrl: ARCHIVE_URL })
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
      const style = buildBasemapStyle({ theme, pmtilesUrl: ARCHIVE_URL })
      expect(style.glyphs).toBeUndefined()
      expect(style.sprite).toBeUndefined()
      expect(style.layers.some(l => l.type === 'symbol')).toBe(false)
      // Every network URL in the style is the one we were given.
      const urls = JSON.stringify(style).match(/https?:\/\/[^"\\]+/g) ?? []
      // The attribution's two links are hrefs the viewer may click, not
      // requests the map makes; match their hosts exactly.
      const creditHosts = new Set(['www.openstreetmap.org', 'github.com'])
      const network = urls.filter(u => !creditHosts.has(new URL(u).hostname))
      expect(new Set(network)).toEqual(new Set([ARCHIVE_URL]))
    }
  })

  it('uses the spec §6.3 land and water colours in each theme', () => {
    // #2080: neutral app-palette shades, not the warm --rt-paper beige.
    // Land is the app surface; water the loyal-blue tint (light) / page bg.
    expect(BASEMAP_COLOURS).toEqual({
      light: {
        land: appToken('--surface', 'light'),
        water: appToken('--loyal-100', 'light'),
      },
      dark: {
        land: appToken('--surface-2', 'dark'),
        water: appToken('--bg', 'dark'),
      },
    })
    for (const theme of ['light', 'dark'] as const) {
      const style = buildBasemapStyle({ theme, pmtilesUrl: ARCHIVE_URL })
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
