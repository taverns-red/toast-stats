/**
 * The one rule for "does this club have a location?" (#2153).
 *
 * Toastmasters' Find-A-Club API returns `Coordinates: { Latitude: 0,
 * Longitude: 0 }` for a club it has not geocoded: the address is there, the
 * point is not. (0, 0) is open ocean in the Gulf of Guinea ("null island"),
 * so no real club sits on it, and treating it as a point draws a fake cluster
 * off West Africa and stretches every fit-to-bounds around it.
 *
 * A pair counts as coordinates only when both values are finite numbers,
 * latitude is within ±90, longitude within ±180, and the pair is not exactly
 * (0, 0). Anything else is "no coordinates": the club stays a row and is
 * counted as unmapped. Every reader of coordinates — the FAC normaliser, the
 * rollups, analytics and the map layers — goes through this function rather
 * than its own check.
 */

export interface LatLng {
  lat: number
  lng: number
}

/** The `{lat, lng}` pair when `value` is a real location, else undefined. */
export function parseCoordinates(value: unknown): LatLng | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { lat, lng } = value as { lat?: unknown; lng?: unknown }
  if (typeof lat !== 'number' || typeof lng !== 'number') return undefined
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined
  if (lat === 0 && lng === 0) return undefined
  return { lat, lng }
}

/** Type guard form of {@link parseCoordinates}. */
export function hasCoordinates(value: unknown): value is LatLng {
  return parseCoordinates(value) !== undefined
}
