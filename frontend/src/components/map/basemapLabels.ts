/**
 * basemapLabels — labelled context on the self-hosted basemap (#2081,
 * ADR-016 addendum).
 *
 * Six symbol layers over the Protomaps v4 tile schema, one per zoom band so
 * the map is never busy:
 *
 * | Band           | Zooms | Tile layer / kinds                         |
 * | -------------- | ----- | ------------------------------------------ |
 * | Countries      | 1–7   | `places` country                           |
 * | States, provs. | 4–10  | `places` region (abbreviation below z6)    |
 * | Cities, towns  | 3+    | `places` locality, one zoom after its own  |
 * | Neighbourhoods | 12+   | `places` neighbourhood / macrohood         |
 * | Streets        | 13+   | `roads` (major from 13, minor from 14)     |
 * | Landmarks      | 14+   | `pois`, a short list of landmark kinds     |
 * | Businesses     | 16+   | `pois` hotel, mall, supermarket            |
 *
 * Streets and POIs come from the world z0–14 archive (#2084): Protomaps
 * names roads and carries the POI long tail only at z12–14, and MapLibre
 * over-zooms the z14 tiles beyond 14.
 *
 * The layers are written here rather than taken from `@protomaps/basemaps`'
 * `layers(…, { lang })`: those need a sprite (town dots, shields, arrows) and
 * five Noto fontstacks, where we ship one font and no sprite.
 *
 * - **Font.** Inter Regular (OFL 1.1), the app's body font, as glyph PBFs on
 *   our own origin (`public/basemap/glyphs/inter-4.1/`, built with
 *   `build_pbf_glyphs`). Only the ranges in `GLYPH_RANGES` are shipped, and
 *   MapLibre fetches a range only when a visible label needs it.
 * - **Scripts.** The English name wins. Without one, a name in Latin,
 *   Cyrillic or Greek is drawn from our glyphs, and a CJK name is drawn by
 *   the browser's own font (MapLibre's `localIdeographFontFamily`, no
 *   request). Any other script (Arabic, Hebrew, Indic, Thai…) shows only when
 *   an English name exists: we ship no glyphs for it, and Arabic would need
 *   the RTL shaping plugin as well.
 * - **Colour.** The app's slate inks: `--ink-2` for cities, `--ink-3` for
 *   every other band, with a halo in the land colour. Quieter than any pin
 *   fill, no new hue, at least 4.5:1 on the land. Labels are added above the
 *   basemap's own layers and below the pins (`addBasemapLabels`).
 * - **Accessibility.** Labels are drawn on the canvas and are decorative: the
 *   map region keeps its own accessible name, and the side panels carry the
 *   club names.
 */
import type {
  ExpressionSpecification,
  StyleSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl'
import { BASEMAP_COLOURS, BASEMAP_SOURCE_ID } from './basemapStyle'

type Theme = 'light' | 'dark'

/** The one fontstack the labels use; its directory under `GLYPH_PATH`. */
export const LABEL_FONT = 'Inter-Regular'

/** Versioned by font release, so the files can be cached as immutable. */
export const GLYPH_PATH = 'basemap/glyphs/inter-4.1/{fontstack}/{range}.pbf'

/**
 * Glyph ranges shipped in `public/`. Latin + Latin-1, Latin Extended-A/B,
 * IPA and spacing modifiers, combining marks + Greek, Cyrillic, Latin
 * Extended Additional (Vietnamese) and general punctuation (– ’ “ ”).
 */
export const GLYPH_RANGES = [
  '0-255',
  '256-511',
  '512-767',
  '768-1023',
  '1024-1279',
  '7680-7935',
  '8192-8447',
] as const

export function basemapGlyphsUrl(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/${GLYPH_PATH}`
}

/** Placement order is top-down, so the last layer here wins collisions. */
export const LABEL_LAYER_IDS = [
  'label-pois',
  'label-streets',
  'label-neighbourhoods',
  'label-cities',
  'label-regions',
  'label-countries',
] as const

/** The app's slate inks (redesign.css --ink-2 / --ink-3, light and dark). */
const INK = {
  light: { strong: '#344052', quiet: '#5B6675' },
  dark: { strong: '#C8D1DD', quiet: '#8A96A6' },
} as const

/** Names in these scripts are drawn without an English name (see header). */
const LOCAL_SCRIPTS = [
  'Cyrillic',
  'Greek',
  'Han',
  'Hangul',
  'Hiragana',
  'Katakana',
  'Mixed-Japanese',
]

const NAME: ExpressionSpecification = [
  'case',
  ['has', 'name:en'],
  ['get', 'name:en'],
  ['!', ['has', 'script']],
  ['get', 'name'],
  ['in', ['get', 'script'], ['literal', LOCAL_SCRIPTS]],
  ['get', 'name'],
  '',
]

const SORT_KEY: ExpressionSpecification = [
  'case',
  ['has', 'sort_key'],
  ['get', 'sort_key'],
  ['get', 'min_zoom'],
]

/** A feature shows `lag` zooms after the tile schema's own min_zoom. */
const fromMinZoom = (lag: number): ExpressionSpecification => [
  '>=',
  ['zoom'],
  ['+', ['get', 'min_zoom'], lag],
]

const kindIs = (...kinds: string[]): ExpressionSpecification => [
  'in',
  ['get', 'kind'],
  ['literal', kinds],
]

/** Landmarks: shown from the zoom the tile schema ranks them at (its
 * `min_zoom`), so a z14 view keeps the tile's most notable places and the
 * long tail of small parks waits one zoom. */
const LANDMARK_KINDS = [
  'aerodrome',
  'station',
  'park',
  'national_park',
  'nature_reserve',
  'university',
  'college',
  'stadium',
  'museum',
  'gallery',
  'zoo',
  'attraction',
  'library',
  'townhall',
]

/** A few businesses people meet at or navigate by (Ron, #2081), from z16.
 * No food, drink, shops or services: those fill a downtown tile. */
const BUSINESS_KINDS = ['hotel', 'mall', 'supermarket']

export function labelLayers(
  source: string,
  theme: Theme,
  halo: string
): SymbolLayerSpecification[] {
  const paint = (weight: 'strong' | 'quiet') => ({
    'text-color': INK[theme][weight],
    'text-halo-color': halo,
    'text-halo-width': 1.5,
    'text-halo-blur': 0.5,
  })
  const base = { type: 'symbol' as const, source }
  // A point label tries its own spot first, then steps beside whatever
  // claimed it (a pin, usually: pins are placed before any label).
  const besidePin = {
    'text-variable-anchor-offset': [
      'center',
      [0, 0],
      'top',
      [0, 2.2],
      'bottom',
      [0, -2.2],
      'left',
      [2.4, 0],
      'right',
      [-2.4, 0],
    ] as Array<string | [number, number]>,
    'text-justify': 'auto' as const,
  }
  // Cities sit under clusters (Montreal, Ottawa: #2092), whose discs reach
  // 28 px from the centre. After the near ring, a city tries a far ring that
  // clears the largest cluster even at its smallest text size (10 px). Last,
  // the four corners: for a city whose row is clusters and whose column has
  // small pins (Montreal at z8–9), a diagonal spot is often the only one.
  const besideCluster = {
    ...besidePin,
    'text-variable-anchor-offset': [
      ...besidePin['text-variable-anchor-offset'],
      'top',
      [0, 3.6],
      'bottom',
      [0, -3.6],
      'left',
      [3.6, 0],
      'right',
      [-3.6, 0],
      'top-left',
      [2.6, 2.6],
      'top-right',
      [-2.6, 2.6],
      'bottom-left',
      [2.6, -2.6],
      'bottom-right',
      [-2.6, -2.6],
    ] as Array<string | [number, number]>,
  }
  const text = {
    'text-font': [LABEL_FONT],
    'text-field': NAME,
    'text-max-width': 8,
  }

  return [
    {
      ...base,
      id: 'label-pois',
      'source-layer': 'pois',
      minzoom: 14,
      filter: [
        'any',
        ['all', kindIs(...LANDMARK_KINDS), fromMinZoom(0)],
        [
          'all',
          kindIs(...BUSINESS_KINDS),
          ['>=', ['zoom'], 16],
          fromMinZoom(1),
        ],
      ],
      layout: {
        ...text,
        ...besidePin,
        'text-size': 10.5,
        'text-padding': 12,
        'symbol-sort-key': ['get', 'min_zoom'],
      },
      paint: paint('quiet'),
    },
    {
      ...base,
      id: 'label-streets',
      'source-layer': 'roads',
      minzoom: 13,
      filter: [
        'all',
        ['has', 'name'],
        [
          'any',
          kindIs('highway', 'major_road'),
          ['all', kindIs('minor_road'), ['>=', ['zoom'], 14]],
        ],
      ],
      layout: {
        ...text,
        'symbol-placement': 'line',
        // Wider than the 250 px default: one name per block, not three.
        'symbol-spacing': 400,
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 17, 12],
        'text-letter-spacing': 0.02,
        'symbol-sort-key': ['get', 'min_zoom'],
      },
      paint: paint('quiet'),
    },
    {
      ...base,
      id: 'label-neighbourhoods',
      'source-layer': 'places',
      minzoom: 12,
      filter: ['all', kindIs('neighbourhood', 'macrohood'), fromMinZoom(1)],
      layout: {
        ...text,
        'text-size': ['interpolate', ['linear'], ['zoom'], 12, 9.5, 16, 11],
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.08,
        'text-max-width': 7,
        'text-padding': 8,
        'symbol-sort-key': SORT_KEY,
      },
      paint: paint('quiet'),
    },
    {
      ...base,
      id: 'label-cities',
      'source-layer': 'places',
      minzoom: 3,
      filter: ['all', kindIs('locality'), fromMinZoom(1)],
      layout: {
        ...text,
        ...besideCluster,
        'text-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          4,
          ['step', ['get', 'population_rank'], 10, 11, 11.5],
          10,
          ['step', ['get', 'population_rank'], 11.5, 11, 14],
        ],
        'text-padding': 6,
        'symbol-sort-key': SORT_KEY,
      },
      paint: paint('strong'),
    },
    {
      ...base,
      id: 'label-regions',
      'source-layer': 'places',
      minzoom: 4,
      maxzoom: 10,
      filter: ['all', kindIs('region'), fromMinZoom(0)],
      layout: {
        ...text,
        'text-field': [
          'step',
          ['zoom'],
          ['coalesce', ['get', 'ref:en'], ['get', 'ref'], NAME],
          6,
          NAME,
        ],
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 9.5, 8, 11],
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.1,
        'text-max-width': 7,
        'symbol-sort-key': SORT_KEY,
      },
      paint: paint('quiet'),
    },
    {
      ...base,
      id: 'label-countries',
      'source-layer': 'places',
      minzoom: 1,
      maxzoom: 7,
      filter: ['all', kindIs('country'), fromMinZoom(0)],
      layout: {
        ...text,
        'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 6, 13],
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.12,
        'text-max-width': 6,
        'symbol-sort-key': SORT_KEY,
      },
      paint: paint('quiet'),
    },
  ]
}

/** The part of a MapLibre map the deferred label add touches. */
export interface LabelTarget {
  setGlyphs(url: string | null): unknown
  addLayer(layer: SymbolLayerSpecification, beforeId?: string): unknown
  getStyle(): { layers: ReadonlyArray<{ id: string; source?: unknown }> }
}

export interface LabelOptions {
  theme: Theme
  origin: string
}

const labelsFor = ({ theme }: LabelOptions) =>
  labelLayers(BASEMAP_SOURCE_ID, theme, BASEMAP_COLOURS[theme].land)

/** A copy of `style` with our glyphs and label layers (for `setStyle`). */
export function withBasemapLabels(
  style: StyleSpecification,
  opts: LabelOptions
): StyleSpecification {
  return {
    ...style,
    glyphs: basemapGlyphsUrl(opts.origin),
    layers: [...style.layers, ...labelsFor(opts)],
  }
}

/**
 * Adds the labels to a live map: our glyphs, then the label layers directly
 * above the basemap's own layers, so anything a page has already added (the
 * pins) stays on top. Pins added later are appended above them anyway.
 */
export function addBasemapLabels(map: LabelTarget, opts: LabelOptions): void {
  map.setGlyphs(basemapGlyphsUrl(opts.origin))
  const above = map
    .getStyle()
    .layers.find(l => l.source !== undefined && l.source !== BASEMAP_SOURCE_ID)
  for (const layer of labelsFor(opts)) map.addLayer(layer, above?.id)
}
