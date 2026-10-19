import { hasCoordinates } from '@taverns-red/shared-contracts'

/**
 * Its own tiny module, so the map routes' first-load pin builder
 * (`pinFeatures`) carries only this, not the locator (ADR-016 D2 budget).
 */
export interface MapPointSource {
  coordinates?: { lat: number; lng: number } | undefined
  meetsOnline?: true | undefined
}

/**
 * A club the maps draw: a valid point (finite and not (0, 0), the shared
 * #2153 rule), and not an online-only club (#2174, Ron 2026-10-19: an
 * online club keeps its Find-A-Club point in the data, but no map shows it
 * — no proxy location). One rule for every club map: the pins, the static
 * preview and the club-page mini-map.
 */
export const hasMapPoint = <T extends MapPointSource>(
  c: T
): c is T & { coordinates: { lat: number; lng: number } } =>
  hasCoordinates(c.coordinates) && c.meetsOnline !== true
