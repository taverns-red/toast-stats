/**
 * #2162 — the club mini-map's pins, as a colour mode of the shared pin code
 * (`components/map/pinModes` → `pinLayer` → `pinRuntime`). Two categories:
 * this club in the app red, the district's other clubs in grey. The shapes,
 * icons and grouping are the shared ones, so a redesign of the club pins
 * reaches the mini-map with no change here. Pure: no MapLibre import.
 */
import type { ModeModel, PinCategory } from '../map/pinModes'
import type { PinFeatureCollection } from '../map/pinFeatures'
import type { LocatedClub } from '../../utils/clubLocator'

/** The pin the SVG locator draws in `--rt-red` (#1843). */
export const LOCATOR_FOCUS: PinCategory = {
  key: 'this',
  label: 'This club',
  fill: '#E63946',
  shape: 'circle',
}

/** The SVG locator's grey dots. */
export const LOCATOR_OTHER: PinCategory = {
  key: 'other',
  label: 'Other clubs in the district',
  fill: '#8C8A82',
  shape: 'circle',
}

export const LOCATOR_MODEL: ModeModel = {
  mode: 'locator',
  title: 'Club location',
  kind: 'categorical',
  fixedOrder: true,
  categories: [LOCATOR_FOCUS, LOCATOR_OTHER],
  // Features are built by `locatorPinFeatures`, which knows the focus.
  categoryOf: () => LOCATOR_OTHER,
  isDashed: () => false,
  facet: null,
}

/** This club's pin, drawn again above any group it falls into. */
export const MINIMAP_FOCUS_SOURCE_ID = 'club-minimap-focus'
export const MINIMAP_FOCUS_LAYER_ID = 'club-minimap-focus'

export function locatorPinFeatures(
  clubs: readonly LocatedClub[],
  focusId: string | null
): PinFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: clubs.map(club => {
      const cat = club.clubId === focusId ? LOCATOR_FOCUS : LOCATOR_OTHER
      return {
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [club.coordinates.lng, club.coordinates.lat] as [
            number,
            number,
          ],
        },
        properties: {
          id: club.clubId,
          k: LOCATOR_MODEL.categories.indexOf(cat),
          s: cat.shape,
          f: cat.fill,
          c: '',
          d: 0 as const,
        },
      }
    }),
  }
}
