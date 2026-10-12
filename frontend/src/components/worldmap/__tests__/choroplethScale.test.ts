/**
 * Country choropleth scale and palette (#1797).
 *
 * The bins are fixed (not quantiles of the day's data), so a country's colour
 * means the same thing on every date and the legend never re-labels itself.
 * The palette is validated with the map pin spec's method
 * (docs/design/map-pin-colour-modes.md §6): adjacent steps ≥ ΔE 8 and a
 * monotone L* under normal vision and every CVD simulation, in both themes,
 * and the lowest bin stays distinct from a country with no clubs.
 */
import { describe, expect, it } from 'vitest'
import { CHOROPLETH_BINS, CHOROPLETH_THEME, binFor } from '../choroplethScale'
import { BASEMAP_COLOURS } from '../../map/basemapStyle'
import {
  VISIONS,
  contrast,
  deltaE,
  lab,
  simulate,
} from '../../../test-utils/colourScience'

describe('binFor', () => {
  it.each([
    [1, 0],
    [4, 0],
    [5, 1],
    [19, 1],
    [20, 2],
    [99, 2],
    [100, 3],
    [499, 3],
    [500, 4],
    [5662, 4],
  ])('%i clubs → bin %i', (clubs, bin) => {
    expect(binFor(clubs)).toBe(bin)
  })

  it('has no bin for zero clubs: "no clubs located" is its own state', () => {
    expect(binFor(0)).toBeNull()
  })

  it('labels every bin with its range, the last one open-ended', () => {
    expect(CHOROPLETH_BINS.map(b => b.label)).toEqual([
      '1–4',
      '5–19',
      '20–99',
      '100–499',
      '500+',
    ])
  })
})

describe.each(['light', 'dark'] as const)('palette (%s)', theme => {
  const t = CHOROPLETH_THEME[theme]

  it('has one fill per bin', () => {
    expect(t.fills).toHaveLength(CHOROPLETH_BINS.length)
  })

  it('sits on the same land and water as the basemap (ADR-016)', () => {
    expect(t.noClubs).toBe(BASEMAP_COLOURS[theme].land)
    expect(t.water).toBe(BASEMAP_COLOURS[theme].water)
  })

  for (const v of VISIONS) {
    it(`adjacent bins ≥ ΔE 8 and L* monotone under ${v}`, () => {
      for (let i = 1; i < t.fills.length; i++) {
        expect(deltaE(t.fills[i - 1]!, t.fills[i]!, v)).toBeGreaterThanOrEqual(
          8
        )
      }
      const ls = t.fills.map(c => lab(simulate(c, v))[0])
      // Light: more clubs is darker. Dark: more clubs is brighter, so the
      // biggest countries never sink into the dark background.
      for (let i = 1; i < ls.length; i++) {
        if (theme === 'light') expect(ls[i]!).toBeLessThan(ls[i - 1]!)
        else expect(ls[i]!).toBeGreaterThan(ls[i - 1]!)
      }
    })

    it(`the lowest bin stays distinct from "no clubs" under ${v}`, () => {
      expect(deltaE(t.noClubs, t.fills[0]!, v)).toBeGreaterThanOrEqual(8)
    })
  }

  it('every fill is distinct from the water around it (≥ ΔE 8)', () => {
    for (const fill of t.fills) {
      expect(deltaE(fill, t.water, 'normal')).toBeGreaterThanOrEqual(8)
    }
  })

  it('the selection ring clears 3:1 against every fill (WCAG 1.4.11)', () => {
    for (const fill of [...t.fills, t.noClubs]) {
      const best = Math.max(
        contrast(t.selection.inner, fill),
        contrast(t.selection.outer, fill)
      )
      expect(best).toBeGreaterThanOrEqual(3)
    }
  })

  it('a territory dot outline clears 3:1 against the water', () => {
    expect(contrast(t.markerOutline, t.water)).toBeGreaterThanOrEqual(3)
  })
})
