/**
 * Bins and palette for the country choropleth (#1797).
 *
 * Fixed bins, not quantiles: a colour means the same club count on every
 * snapshot date, so the legend never re-labels itself. The breaks follow the
 * real spread (2026-10-11: 56 countries with 1–4 clubs, 46 with 5–19, 35 with
 * 20–99, 16 with 100–499, 5 with 500+).
 *
 * Palette, validated in __tests__/choroplethScale.test.ts with the map pin
 * spec's method (docs/design/map-pin-colour-modes.md §6):
 * - Light uses the spec's `sequential5` ramp: more clubs is darker.
 * - Dark reverses the lightness: more clubs is brighter, so the largest
 *   countries never sink into the dark background.
 * - "No clubs located" is the basemap land colour plus a hatch, so it never
 *   relies on colour alone. Dark uses the basemap water (ADR-016); light uses
 *   a warm grey sea, because the basemap's blue water is too close to the
 *   ramp for coastlines to read.
 */

export interface ChoroplethBin {
  min: number
  /** Inclusive upper bound; null for the open-ended top bin. */
  max: number | null
  label: string
}

export interface ChoroplethTheme {
  /** One fill per bin, fewest clubs first. */
  fills: readonly string[]
  /** Base fill of a country with no clubs located (drawn with `hatch`). */
  noClubs: string
  hatch: string
  water: string
  /** Hairline between neighbouring countries. */
  border: string
  /** Outline of a small-territory dot. */
  markerOutline: string
  /** The selected country gets a double ring: `outer` under `inner`. */
  selection: { inner: string; outer: string }
}

export const CHOROPLETH_BINS: readonly ChoroplethBin[] = [
  { min: 1, max: 4, label: '1–4' },
  { min: 5, max: 19, label: '5–19' },
  { min: 20, max: 99, label: '20–99' },
  { min: 100, max: 499, label: '100–499' },
  { min: 500, max: null, label: '500+' },
]

export const CHOROPLETH_THEME: Record<'light' | 'dark', ChoroplethTheme> = {
  light: {
    fills: ['#DCE9F5', '#9ECAE1', '#5A9FCF', '#2B6FB0', '#0B3F7A'],
    noClubs: '#F4F1EB',
    hatch: '#C9C3B8',
    water: '#D9D6D0',
    border: '#FFFFFF',
    markerOutline: '#3D3B38',
    selection: { inner: '#0F0E0D', outer: '#FFFFFF' },
  },
  dark: {
    fills: ['#25405C', '#2A6497', '#3D8BCC', '#86BEE8', '#D6EAF8'],
    noClubs: '#1A1816',
    hatch: '#3A3631',
    water: '#1E2A33',
    border: '#0F0E0D',
    markerOutline: '#F4F1EB',
    selection: { inner: '#F4F1EB', outer: '#0F0E0D' },
  },
}

/** The bin index for a club count, or null when there are no clubs. */
export function binFor(clubs: number): number | null {
  if (!(clubs >= 1)) return null
  const i = CHOROPLETH_BINS.findIndex(b => b.max === null || clubs <= b.max)
  return i === -1 ? null : i
}
