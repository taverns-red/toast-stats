import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import type { LayerSpecification, SymbolLayerSpecification } from 'maplibre-gl'
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import { BASEMAP_COLOURS, buildBasemapStyle } from '../basemapStyle'
import {
  GLYPH_PATH,
  GLYPH_RANGES,
  LABEL_FONT,
  LABEL_LAYER_IDS,
  basemapGlyphsUrl,
} from '../basemapLabels'
import { PIN_LAYER_IDS } from '../pinLayer'

/* #2081 — labelled basemap context, zoom-banded so the map is never busy.
 * Countries → states/provinces → cities → neighbourhoods → streets, plus a
 * restrained set of landmarks at street zoom. The glyphs are self-hosted
 * (ADR-016 addendum): the only new request is to our own origin. */

const ARCHIVE_URL = 'https://cdn.example.test/basemap/world.pmtiles'
const ORIGIN = 'https://ts.example.test'
const PUBLIC_DIR = resolve(__dirname, '../../../../public')

const styleFor = (theme: 'light' | 'dark') =>
  buildBasemapStyle({ theme, pmtilesUrl: ARCHIVE_URL, origin: ORIGIN })

const symbolLayers = (layers: LayerSpecification[]) =>
  layers.filter((l): l is SymbolLayerSpecification => l.type === 'symbol')

describe('basemap label layers', () => {
  it.each(['light', 'dark'] as const)('is a valid style in %s', theme => {
    expect(validateStyleMin(styleFor(theme))).toEqual([])
  })

  it('has one label layer per band, in band order', () => {
    const ids = symbolLayers(styleFor('light').layers).map(l => l.id)
    expect(ids).toEqual([...LABEL_LAYER_IDS])
    expect(LABEL_LAYER_IDS).toEqual([
      'label-pois',
      'label-streets',
      'label-neighbourhoods',
      'label-cities',
      'label-regions',
      'label-countries',
    ])
  })

  it('draws every label above the geometry and leaves the top to the pins', () => {
    const { layers } = styleFor('dark')
    const firstLabel = layers.findIndex(l => l.type === 'symbol')
    expect(firstLabel).toBeGreaterThan(0)
    // Every layer after the first label is a label: nothing paints over them
    // except the pin layers, which useClubPins appends with addLayer.
    expect(layers.slice(firstLabel).every(l => l.type === 'symbol')).toBe(true)
    expect(layers.some(l => PIN_LAYER_IDS.includes(l.id))).toBe(false)
  })

  it('serves glyphs from our own origin, never a third party', () => {
    const style = styleFor('light')
    expect(style.glyphs).toBe(`${ORIGIN}/${GLYPH_PATH}`)
    expect(style.glyphs).toContain('{fontstack}')
    expect(style.glyphs).toContain('{range}')
    expect(new URL(basemapGlyphsUrl(ORIGIN)).origin).toBe(ORIGIN)
    // Icons would need a sprite; the labels are text only.
    expect(style.sprite).toBeUndefined()
    for (const l of symbolLayers(style.layers)) {
      expect(l.layout?.['icon-image']).toBeUndefined()
      expect(l.layout?.['text-font']).toEqual([LABEL_FONT])
    }
  })

  it('defaults the glyph origin to the page origin', () => {
    const style = buildBasemapStyle({ theme: 'light', pmtilesUrl: ARCHIVE_URL })
    expect(style.glyphs).toBe(`${window.location.origin}/${GLYPH_PATH}`)
  })

  it('ships every glyph range it names, plus the font licence', () => {
    const dir = resolve(PUBLIC_DIR, GLYPH_PATH.split('/{fontstack}')[0]!)
    expect(existsSync(resolve(dir, 'OFL.txt'))).toBe(true)
    expect(readFileSync(resolve(dir, 'OFL.txt'), 'utf8')).toContain(
      'SIL OPEN FONT LICENSE'
    )
    for (const range of GLYPH_RANGES) {
      const file = resolve(dir, LABEL_FONT, `${range}.pbf`)
      expect(existsSync(file), file).toBe(true)
      expect(statSync(file).size).toBeGreaterThan(1000)
    }
    // Latin, Latin Extended and the punctuation in names like "York South–Weston".
    for (const r of ['0-255', '256-511', '8192-8447']) {
      expect(GLYPH_RANGES).toContain(r)
    }
  })

  it('bands each kind of label to its zoom range', () => {
    const byId = new Map(
      symbolLayers(styleFor('light').layers).map(l => [l.id, l])
    )
    const band = (id: string) => {
      const l = byId.get(id)!
      return [l.minzoom ?? 0, l.maxzoom ?? 24]
    }
    expect(band('label-countries')).toEqual([1, 7])
    expect(band('label-regions')).toEqual([4, 10])
    expect(band('label-cities')).toEqual([3, 24])
    expect(band('label-neighbourhoods')).toEqual([12, 24])
    expect(band('label-streets')).toEqual([13, 24])
    expect(band('label-pois')).toEqual([14, 24])
  })

  it('reads only its own tile layers and kinds', () => {
    const byId = new Map(
      symbolLayers(styleFor('light').layers).map(l => [l.id, l])
    )
    expect(byId.get('label-countries')!['source-layer']).toBe('places')
    expect(byId.get('label-regions')!['source-layer']).toBe('places')
    expect(byId.get('label-cities')!['source-layer']).toBe('places')
    expect(byId.get('label-neighbourhoods')!['source-layer']).toBe('places')
    expect(byId.get('label-streets')!['source-layer']).toBe('roads')
    expect(byId.get('label-pois')!['source-layer']).toBe('pois')
    // A restrained POI set: landmarks, parks and transport, no shops.
    const pois = JSON.stringify(byId.get('label-pois')!.filter)
    for (const kind of ['aerodrome', 'station', 'park', 'university']) {
      expect(pois).toContain(`"${kind}"`)
    }
    for (const kind of ['restaurant', 'cafe', 'shop', 'bar']) {
      expect(pois).not.toContain(`"${kind}"`)
    }
  })

  it('lets point labels step beside a pin instead of hiding under it', () => {
    const byId = new Map(
      symbolLayers(styleFor('light').layers).map(l => [l.id, l])
    )
    for (const id of ['label-cities', 'label-pois']) {
      const offsets = byId.get(id)!.layout!['text-variable-anchor-offset'] as
        unknown[] | undefined
      expect(offsets).toBeDefined()
      const anchors = offsets!.filter((_, k) => k % 2 === 0)
      expect(anchors).toEqual(['center', 'top', 'bottom', 'left', 'right'])
      // Off-centre anchors clear a 44 px cluster (~2 em at 11 px).
      for (let k = 3; k < offsets!.length; k += 2) {
        const [x, y] = offsets![k] as [number, number]
        expect(Math.hypot(x, y)).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('uses quiet ink-on-paper colours with a land-coloured halo', () => {
    for (const theme of ['light', 'dark'] as const) {
      const ink = theme === 'light' ? '15, 14, 13' : '244, 241, 235'
      for (const l of symbolLayers(styleFor(theme).layers)) {
        const paint = l.paint ?? {}
        expect(String(paint['text-color'])).toMatch(
          new RegExp(`^rgba\\(${ink}, 0\\.\\d+\\)$`)
        )
        expect(paint['text-halo-color']).toBe(BASEMAP_COLOURS[theme].land)
        expect(paint['text-halo-width']).toBeGreaterThan(0)
      }
    }
  })

  it('prefers the English name and never asks for a script it cannot draw', () => {
    const l = symbolLayers(styleFor('light').layers).find(
      x => x.id === 'label-cities'
    )!
    const field = JSON.stringify(l.layout?.['text-field'])
    expect(field).toContain('"name:en"')
    // Scripts drawn from shipped glyphs or locally (CJK): shown in the
    // local name. Anything else shows only when an English name exists.
    for (const s of ['Cyrillic', 'Greek', 'Han', 'Hangul']) {
      expect(field).toContain(`"${s}"`)
    }
    expect(field).not.toContain('"Arabic"')
    expect(field).not.toContain('pgf:')
  })
})
