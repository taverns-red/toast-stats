import { describe, it, expect, vi } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import type { LayerSpecification, SymbolLayerSpecification } from 'maplibre-gl'
import {
  featureFilter,
  validateStyleMin,
} from '@maplibre/maplibre-gl-style-spec'
import { BASEMAP_COLOURS, buildBasemapStyle } from '../basemapStyle'
import {
  GLYPH_PATH,
  GLYPH_RANGES,
  LABEL_FONT,
  LABEL_LAYER_IDS,
  addBasemapLabels,
  basemapGlyphsUrl,
  withBasemapLabels,
} from '../basemapLabels'
import { PIN_LAYER_IDS } from '../pinLayer'
import { clusterDiameter } from '../pinImages'

/* #2081 — labelled basemap context, zoom-banded so the map is never busy.
 * Countries → states/provinces → cities → neighbourhoods → streets, plus a
 * restrained set of landmarks at street zoom. The glyphs are self-hosted
 * (ADR-016 addendum): the only new request is to our own origin. */

const ARCHIVE_URL = 'https://cdn.example.test/basemap/world.pmtiles'
const ORIGIN = 'https://ts.example.test'
const PUBLIC_DIR = resolve(__dirname, '../../../../public')

// The labels are added after the basemap's first render (#2081): the base
// style is geometry only, and the label config ships in its own lazy chunk.
const styleFor = (theme: 'light' | 'dark') =>
  withBasemapLabels(buildBasemapStyle({ theme, pmtilesUrl: ARCHIVE_URL }), {
    theme,
    origin: ORIGIN,
  })

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
    expect(
      layers.some(l => (PIN_LAYER_IDS as readonly string[]).includes(l.id))
    ).toBe(false)
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

  it('leaves the base style untouched (geometry first, labels later)', () => {
    const base = buildBasemapStyle({ theme: 'light', pmtilesUrl: ARCHIVE_URL })
    const before = JSON.stringify(base)
    withBasemapLabels(base, { theme: 'light', origin: ORIGIN })
    expect(JSON.stringify(base)).toBe(before)
    expect(base.glyphs).toBeUndefined()
    expect(base.layers.some(l => l.type === 'symbol')).toBe(false)
  })

  it('adds the labels to a live map below any pins already on it', () => {
    const added: Array<[string, string | undefined]> = []
    const map = {
      setGlyphs: vi.fn(),
      addLayer: vi.fn((l: { id: string }, before?: string) =>
        added.push([l.id, before])
      ),
      // A page's pins, already on the map above the basemap's geometry.
      getStyle: () => ({
        layers: [
          { id: 'background' },
          { id: 'earth', source: 'protomaps' },
          { id: PIN_LAYER_IDS[0], source: 'club-pins' },
          { id: PIN_LAYER_IDS[1], source: 'club-pins' },
        ],
      }),
    }
    addBasemapLabels(map, { theme: 'dark', origin: ORIGIN })
    expect(map.setGlyphs).toHaveBeenCalledWith(`${ORIGIN}/${GLYPH_PATH}`)
    expect(added.map(a => a[0])).toEqual([...LABEL_LAYER_IDS])
    expect(added.every(a => a[1] === PIN_LAYER_IDS[0])).toBe(true)
  })

  it('appends the labels when no pins are on the map yet', () => {
    const before: Array<string | undefined> = []
    const map = {
      setGlyphs: vi.fn(),
      addLayer: vi.fn((_l: unknown, b?: string) => before.push(b)),
      getStyle: () => ({
        layers: [{ id: 'background' }, { id: 'earth', source: 'protomaps' }],
      }),
    }
    addBasemapLabels(map, { theme: 'light', origin: ORIGIN })
    expect(before).toHaveLength(LABEL_LAYER_IDS.length)
    expect(before.every(b => b === undefined)).toBe(true)
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
    // A restrained POI set: landmarks, parks, transport and a few
    // businesses people meet at (#2081, Ron), but no food, drink or shops.
    const pois = JSON.stringify(byId.get('label-pois')!.filter)
    for (const kind of ['aerodrome', 'station', 'park', 'university']) {
      expect(pois).toContain(`"${kind}"`)
    }
    for (const kind of ['restaurant', 'cafe', 'shop', 'bar', 'fast_food']) {
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
      // The near ring is tried first, so a label stays close when it can.
      const anchors = offsets!.filter((_, k) => k % 2 === 0)
      expect(anchors.slice(0, 5)).toEqual([
        'center',
        'top',
        'bottom',
        'left',
        'right',
      ])
      // Off-centre anchors clear a 44 px cluster (~2 em at 11 px).
      for (let k = 3; k < offsets!.length; k += 2) {
        const [x, y] = offsets![k] as [number, number]
        expect(Math.hypot(x, y)).toBeGreaterThanOrEqual(2)
      }
    }
  })

  // #2092 — a city sitting under a big cluster (Montreal, Ottawa) lost its
  // label: every near-ring spot overlapped the cluster's collision box, so
  // the label hid. Cities need a far spot on each side that clears the
  // largest cluster at their smallest text size.
  it('gives a city label a spot on each side that clears the largest cluster', () => {
    const cities = symbolLayers(styleFor('light').layers).find(
      l => l.id === 'label-cities'
    )!
    const offsets = cities.layout!['text-variable-anchor-offset'] as unknown[]
    const textPadding = cities.layout!['text-padding'] as number
    // Largest cluster canvas (48 px disc + 8 px margin) plus MapLibre's
    // default 2 px icon-padding, measured from the cluster's centre.
    const clusterHalf = (clusterDiameter(1000) + 8) / 2 + 2
    const SMALLEST_CITY_TEXT_PX = 10
    const reach = (anchor: string) => {
      let best = 0
      for (let k = 0; k < offsets.length; k += 2) {
        if (offsets[k] !== anchor) continue
        const [x, y] = offsets[k + 1] as [number, number]
        best = Math.max(best, Math.max(Math.abs(x), Math.abs(y)))
      }
      return best * SMALLEST_CITY_TEXT_PX - textPadding
    }
    for (const side of ['top', 'bottom', 'left', 'right']) {
      expect(reach(side), side).toBeGreaterThanOrEqual(clusterHalf)
    }
  })

  // #2092 — measured on the PR preview over D61 (zooms 6–11, 1280 and 375
  // px): with only the side rings, Montreal still hid at z8 and z9, where
  // clusters fill its row and small pins sit above and below. The four
  // corners let it sit diagonally off the row; with them all 24 checks place.
  it('lets a city label try the four corners after the sides', () => {
    const cities = symbolLayers(styleFor('light').layers).find(
      l => l.id === 'label-cities'
    )!
    const offsets = cities.layout!['text-variable-anchor-offset'] as unknown[]
    const anchors = offsets.filter((_, k) => k % 2 === 0)
    const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
    expect(anchors.slice(-4)).toEqual(corners)
    for (let k = 1; k < offsets.length; k += 2) {
      if (!corners.includes(offsets[k - 1] as string)) continue
      const [x, y] = offsets[k] as [number, number]
      // Pushed away from the point on both axes, like the near ring.
      expect(Math.abs(x)).toBeGreaterThanOrEqual(2.2)
      expect(Math.abs(y)).toBeGreaterThanOrEqual(2.2)
    }
  })

  it('uses the app slate inks on the neutral basemap, halo in the land colour', () => {
    // redesign.css --ink-2 / --ink-3, light and [data-theme='dark'] values.
    const INKS = {
      light: { strong: '#344052', quiet: '#5B6675' },
      dark: { strong: '#C8D1DD', quiet: '#8A96A6' },
    }
    for (const theme of ['light', 'dark'] as const) {
      const byId = new Map(
        symbolLayers(styleFor(theme).layers).map(l => [l.id, l.paint ?? {}])
      )
      // Cities carry the most weight; every other band is quieter.
      expect(byId.get('label-cities')!['text-color']).toBe(INKS[theme].strong)
      for (const [id, paint] of byId) {
        if (id !== 'label-cities')
          expect(paint['text-color'], id).toBe(INKS[theme].quiet)
        expect(paint['text-halo-color']).toBe(BASEMAP_COLOURS[theme].land)
        expect(paint['text-halo-width']).toBeGreaterThan(0)
      }
    }
  })

  it('keeps every label readable on its land colour (>= 4.5:1)', () => {
    const lum = (hex: string) => {
      const c = [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16) / 255)
      const [r, g, b] = c.map(v =>
        v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      )
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
    }
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
      return (x! + 0.05) / (y! + 0.05)
    }
    for (const theme of ['light', 'dark'] as const) {
      for (const l of symbolLayers(styleFor(theme).layers)) {
        const colour = String(l.paint?.['text-color'])
        expect(
          ratio(colour, BASEMAP_COLOURS[theme].land),
          l.id
        ).toBeGreaterThanOrEqual(4.5)
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

  /* #2084 / #2081 — on the world z0–14 archive, what each street-zoom band
   * actually draws. Features are shaped like the Protomaps v4 tiles read
   * from the live archive (z14 tile 14/4746/5866, downtown Ottawa): a
   * `kind`, the tile schema's `min_zoom`, and a `name`. */
  describe('street-zoom density on the z14 archive', () => {
    const layer = (id: string) =>
      symbolLayers(styleFor('light').layers).find(l => l.id === id)!
    /** Whether a layer draws this feature at a zoom (its filter + band). */
    const draws = (
      id: string,
      zoom: number,
      props: Record<string, unknown>,
      type: 1 | 2 = 1
    ) => {
      const l = layer(id)
      if (zoom < (l.minzoom ?? 0) || zoom >= (l.maxzoom ?? 24)) return false
      return featureFilter(l.filter, 'filter').filter({ zoom }, {
        type,
        properties: props,
      } as never)
    }
    const poi = (kind: string, min_zoom: number) => ({
      kind,
      min_zoom,
      name: `${kind} ${min_zoom}`,
    })
    const road = (kind: string, min_zoom: number, name?: string) => ({
      kind,
      min_zoom,
      ...(name ? { name } : {}),
    })

    it('names major streets from z13 and minor streets from z14', () => {
      const s = (z: number, p: Record<string, unknown>) =>
        draws('label-streets', z, p, 2)
      expect(s(12, road('major_road', 10, 'Wellington Street'))).toBe(false)
      expect(s(13, road('major_road', 10, 'Wellington Street'))).toBe(true)
      expect(s(13, road('minor_road', 13, 'Sparks Street'))).toBe(false)
      expect(s(14, road('minor_road', 13, 'Sparks Street'))).toBe(true)
      expect(s(14, road('minor_road', 14, 'Queen Street'))).toBe(true)
      // Paths, service roads and unnamed roads never get a label.
      expect(s(16, road('path', 14, 'Rideau Canal Pathway'))).toBe(false)
      expect(s(16, road('other', 15, 'Fleet Street'))).toBe(false)
      expect(s(16, road('minor_road', 13))).toBe(false)
    })

    it('shows notable landmarks at z14, in tile-schema order', () => {
      const p = (z: number, kind: string, mz: number) =>
        draws('label-pois', z, poi(kind, mz))
      // The tile's own most notable places first (low min_zoom).
      expect(p(13, 'park', 12)).toBe(false)
      expect(p(14, 'park', 12)).toBe(true)
      expect(p(14, 'museum', 13)).toBe(true)
      expect(p(14, 'attraction', 14)).toBe(true)
      expect(p(14, 'gallery', 14)).toBe(true)
      expect(p(14, 'library', 14)).toBe(true)
      // The long tail of small parks waits one zoom.
      expect(p(14, 'park', 15)).toBe(false)
      expect(p(15, 'park', 15)).toBe(true)
    })

    it('adds a few business categories only from z16', () => {
      const p = (z: number, kind: string, mz: number) =>
        draws('label-pois', z, poi(kind, mz))
      for (const kind of ['hotel', 'mall', 'supermarket']) {
        expect(p(15, kind, 15), kind).toBe(false)
        expect(p(16, kind, 15), kind).toBe(true)
      }
    })

    it('never labels the busy or utilitarian kinds', () => {
      for (const kind of [
        'restaurant',
        'cafe',
        'bar',
        'pub',
        'fast_food',
        'post_office',
        'parking',
        'construction',
        'doctors',
        'bank',
        'place_of_worship',
        'pedestrian',
      ]) {
        expect(draws('label-pois', 18, poi(kind, 13)), kind).toBe(false)
      }
    })

    it('spaces landmark labels widely so street zoom stays calm', () => {
      const l = layer('label-pois').layout!
      expect(l['text-padding']).toBeGreaterThanOrEqual(12)
      // Fewer street names repeat along one road.
      expect(
        layer('label-streets').layout!['symbol-spacing']
      ).toBeGreaterThanOrEqual(350)
    })
  })
})
