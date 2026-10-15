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
 * | Streets        | 13+   | `roads` (major from 13, minor from 15)     |
 * | Landmarks      | 14+   | `pois`, a short list of landmark kinds     |
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
 * - **Colour.** Ink (`--rt-ink`) on light and paper (`--rt-ink-on-dk`) on
 *   dark, at reduced opacity, with a halo in the land colour: quieter than any
 *   pin fill, no new hue. Labels are the last basemap layers, and the pin
 *   layers are appended above them (`useClubPins`), so pins always win.
 * - **Accessibility.** Labels are drawn on the canvas and are decorative: the
 *   map region keeps its own accessible name, and the side panels carry the
 *   club names.
 */
import type {
  ExpressionSpecification,
  StyleSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl'

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

const INK: Record<Theme, string> = {
  light: '15, 14, 13', // --rt-ink #0F0E0D
  dark: '244, 241, 235', // --rt-ink-on-dk #F4F1EB
}

const ink = (theme: Theme, alpha: number) => `rgba(${INK[theme]}, ${alpha})`

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

/** Landmarks only: no shops or restaurants, so street zoom stays calm. */
const POI_KINDS = [
  'aerodrome',
  'station',
  'park',
  'national_park',
  'nature_reserve',
  'university',
  'college',
  'stadium',
  'museum',
  'zoo',
  'attraction',
]

export function labelLayers(
  source: string,
  theme: Theme,
  halo: string
): SymbolLayerSpecification[] {
  const paint = (alpha: number) => ({
    'text-color': ink(theme, alpha),
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
      filter: ['all', kindIs(...POI_KINDS), fromMinZoom(2)],
      layout: {
        ...text,
        ...besidePin,
        'text-size': 10.5,
        'text-padding': 8,
        'symbol-sort-key': ['get', 'min_zoom'],
      },
      paint: paint(0.5),
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
          ['all', kindIs('minor_road'), ['>=', ['zoom'], 15]],
        ],
      ],
      layout: {
        ...text,
        'symbol-placement': 'line',
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 17, 12],
        'text-letter-spacing': 0.02,
        'symbol-sort-key': ['get', 'min_zoom'],
      },
      paint: paint(0.55),
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
      paint: paint(0.5),
    },
    {
      ...base,
      id: 'label-cities',
      'source-layer': 'places',
      minzoom: 3,
      filter: ['all', kindIs('locality'), fromMinZoom(1)],
      layout: {
        ...text,
        ...besidePin,
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
      paint: paint(0.72),
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
      paint: paint(0.45),
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
      paint: paint(0.5),
    },
  ]
}

/** The part of a MapLibre map the deferred label add touches. */
export interface LabelTarget {
  setGlyphs(url: string | null): unknown
  addLayer(layer: SymbolLayerSpecification, beforeId?: string): unknown
  getLayer(id: string): unknown
}

export interface LabelOptions {
  theme: Theme
  origin: string
}

/** Red stub (#2081). */
export function withBasemapLabels(
  style: StyleSpecification,
  _opts: LabelOptions
): StyleSpecification {
  return style
}

/** Red stub (#2081). */
export function addBasemapLabels(
  _map: LabelTarget,
  _opts: LabelOptions
): void {}
