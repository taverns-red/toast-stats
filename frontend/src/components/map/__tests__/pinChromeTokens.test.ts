import { describe, expect, it } from 'vitest'
import { OUTLINE } from '../pinModes'
import { HALO } from '../pinImages'
import { BASEMAP_COLOURS } from '../basemapStyle'
import { CHOROPLETH_THEME } from '../../worldmap/choroplethScale'
import { appToken, readCss, themeBlock } from '../../../test-utils/appTokens'

/* #2087 (follow-up to #2080) — until Phase 2 (ops#37) the map matches the
 * existing app palette. The pin outline and halo were warm Red Taverns
 * neutrals (--rt-ink-2 #3D3B38, --rt-paper #F4F1EB, --rt-bg-2 #1A1816). Now
 * the outline is each theme's slate --ink-2, and the halo (the gap between a
 * pin and its ring) is the land colour, an app surface token. */

describe('pin outline and halo use the app palette', () => {
  for (const theme of ['light', 'dark'] as const) {
    it(`outline is --ink-2 (${theme})`, () => {
      expect(OUTLINE[theme]).toBe(appToken('--ink-2', theme))
    })

    it(`halo is the basemap land, an app surface token (${theme})`, () => {
      expect(HALO[theme]).toBe(BASEMAP_COLOURS[theme].land)
      const surface = theme === 'light' ? '--surface' : '--surface-2'
      expect(HALO[theme]).toBe(appToken(surface, theme))
    })

    it(`legend swatches draw the same outline (${theme})`, () => {
      const block = themeBlock(readCss('components/map/districtMap.css'), theme)
      expect(block).toMatch(/--map-pin-outline:\s*var\(--ink-2\)\s*;/)
    })

    it(`world-map markers share the pin outline (${theme})`, () => {
      expect(CHOROPLETH_THEME[theme].markerOutline).toBe(OUTLINE[theme])
    })
  }
})
