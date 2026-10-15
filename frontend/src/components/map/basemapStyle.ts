/**
 * basemapStyle — the MapLibre style for the self-hosted Protomaps basemap
 * (#1786, ADR-016).
 *
 * The geometry layers come from `@protomaps/basemaps` (BSD-3 code, CC0 design)
 * so the style tracks the v4 tile schema. Colours are ours:
 *
 * - Land and water are the values the pin palette was validated against
 *   (`docs/design/map-pin-colour-modes.md` §6.3). Change them only together
 *   with a re-run of that validator.
 * - Everything else (parks, landuse, roads, buildings, boundaries) is a
 *   near-neutral shade of the land colour, so the basemap stays quieter than
 *   any pin fill (spec §6.3: roads and labels desaturated, labels below pins).
 *
 * Labels (#2081) are our own zoom-banded layers in `basemapLabels.ts`, drawn
 * from Inter glyph PBFs on our own origin (ADR-016 addendum). There is no
 * `sprite`, so the network URLs in the style are the basemap archive and the
 * same-origin glyphs.
 */
import type { StyleSpecification } from 'maplibre-gl'
import { layers, namedFlavor, type Flavor } from '@protomaps/basemaps'
import { basemapGlyphsUrl, labelLayers } from './basemapLabels'

export type BasemapTheme = 'light' | 'dark'

export const BASEMAP_SOURCE_ID = 'protomaps'

/** ODbL requires the OpenStreetMap credit wherever the map is shown. */
export const BASEMAP_ATTRIBUTION =
  '<a href="https://github.com/protomaps/basemaps" target="_blank" rel="noopener">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'

/** Spec §6.3 — the land/water pair the pin fills were validated against.
 * #2080: the app palette, not the warm --rt-paper beige. Land is the app's
 * surface (--surface light, --surface-2 dark); water is the loyal-blue tint
 * --loyal-100 in light and the page --bg in dark. */
export const BASEMAP_COLOURS = {
  light: { land: '#FFFFFF', water: '#CBDDE7' },
  dark: { land: '#161F2A', water: '#0A0F15' },
} as const

/** Quiet, cool-neutral shades (the app's slate greys) for everything that is
 * neither land nor water. */
const QUIET = {
  light: {
    landuse: '#F6F7F8',
    building: '#ECEEF0',
    road: '#E5E7EB',
    roadMinor: '#ECEEF0',
    casing: '#D1D5DB',
    rail: '#D1D5DB',
    boundary: '#9CA3AF',
  },
  dark: {
    landuse: '#1A2330',
    building: '#1F2A38',
    road: '#2A3645',
    roadMinor: '#222D3B',
    casing: '#111922',
    rail: '#2A3645',
    boundary: '#5B6675',
  },
} as const

function flavorFor(theme: BasemapTheme): Flavor {
  const base = namedFlavor(theme === 'dark' ? 'black' : 'grayscale')
  const { land, water } = BASEMAP_COLOURS[theme]
  const q = QUIET[theme]
  const landcover = {
    grassland: q.landuse,
    barren: q.landuse,
    urban_area: q.landuse,
    farmland: q.landuse,
    glacier: q.landuse,
    scrub: q.landuse,
    forest: q.landuse,
  }
  return {
    ...base,
    background: land,
    earth: land,
    water,
    landcover,
    park_a: q.landuse,
    park_b: q.landuse,
    wood_a: q.landuse,
    wood_b: q.landuse,
    scrub_a: q.landuse,
    scrub_b: q.landuse,
    glacier: q.landuse,
    sand: q.landuse,
    beach: q.landuse,
    hospital: q.landuse,
    industrial: q.landuse,
    school: q.landuse,
    zoo: q.landuse,
    aerodrome: q.landuse,
    military: q.landuse,
    pedestrian: q.landuse,
    pier: q.landuse,
    runway: q.building,
    buildings: q.building,
    highway: q.road,
    major: q.road,
    link: q.road,
    minor_a: q.roadMinor,
    minor_b: q.roadMinor,
    minor_service: q.roadMinor,
    other: q.roadMinor,
    highway_casing_early: q.casing,
    highway_casing_late: q.casing,
    major_casing_early: q.casing,
    major_casing_late: q.casing,
    minor_casing: q.casing,
    minor_service_casing: q.casing,
    link_casing: q.casing,
    railway: q.rail,
    boundaries: q.boundary,
  }
}

export interface BasemapStyleOptions {
  theme: BasemapTheme
  /** Absolute URL of the `.pmtiles` archive (served with range requests). */
  pmtilesUrl: string
  /** Origin the glyphs are served from (#2081). Defaults to the page's. */
  origin?: string
}

export function buildBasemapStyle({
  theme,
  pmtilesUrl,
  origin = window.location.origin,
}: BasemapStyleOptions): StyleSpecification {
  return {
    version: 8,
    glyphs: basemapGlyphsUrl(origin),
    sources: {
      [BASEMAP_SOURCE_ID]: {
        type: 'vector',
        url: `pmtiles://${pmtilesUrl}`,
        attribution: BASEMAP_ATTRIBUTION,
      },
    },
    // No `lang` → Protomaps' geometry only; the labels are ours (#2081).
    layers: [
      ...layers(BASEMAP_SOURCE_ID, flavorFor(theme)),
      ...labelLayers(BASEMAP_SOURCE_ID, theme, BASEMAP_COLOURS[theme].land),
    ],
  }
}
