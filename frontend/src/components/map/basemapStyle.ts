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
 * There are no label layers yet: labels need glyph PBFs, and the hosted
 * Protomaps glyphs would be a third-party request from every viewer's
 * browser. Self-hosting a glyph range is a follow-up (ADR-016 §Consequences).
 * With no `glyphs` and no `sprite`, the only network URL in the style is the
 * basemap archive itself.
 */
import type { StyleSpecification } from 'maplibre-gl'
import { layers, namedFlavor, type Flavor } from '@protomaps/basemaps'

export type BasemapTheme = 'light' | 'dark'

export const BASEMAP_SOURCE_ID = 'protomaps'

/** ODbL requires the OpenStreetMap credit wherever the map is shown. */
export const BASEMAP_ATTRIBUTION =
  '<a href="https://github.com/protomaps/basemaps" target="_blank" rel="noopener">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'

/** Spec §6.3 — the land/water pair the pin fills were validated against. */
export const BASEMAP_COLOURS = {
  light: { land: '#F4F1EB', water: '#C9D7E0' },
  dark: { land: '#1A1816', water: '#1E2A33' },
} as const

/** Quiet, warm-neutral shades for everything that is neither land nor water. */
const QUIET = {
  light: {
    landuse: '#ECE8E0',
    building: '#E6E1D8',
    road: '#FFFFFF',
    roadMinor: '#FBF9F5',
    casing: '#DDD7CC',
    rail: '#D3CDC2',
    boundary: '#A8A196',
  },
  dark: {
    landuse: '#201E1B',
    building: '#24211E',
    road: '#36322D',
    roadMinor: '#2C2925',
    casing: '#141210',
    rail: '#3A3631',
    boundary: '#5E5850',
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
}

export function buildBasemapStyle({
  theme,
  pmtilesUrl,
}: BasemapStyleOptions): StyleSpecification {
  return {
    version: 8,
    sources: {
      [BASEMAP_SOURCE_ID]: {
        type: 'vector',
        url: `pmtiles://${pmtilesUrl}`,
        attribution: BASEMAP_ATTRIBUTION,
      },
    },
    // No `lang` → geometry only, no symbol layers, no glyphs or sprite.
    layers: layers(BASEMAP_SOURCE_ID, flavorFor(theme)),
  }
}
