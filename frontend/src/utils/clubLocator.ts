import { clubIdsMatch } from '@taverns-red/shared-contracts'

/**
 * #1843 — geometry for the club page's static mini-map ("locator").
 *
 * The district's clubs become dots and the viewed club a pin, projected from
 * the coordinates the page's data already carries. No tiles and no map
 * library: the club route stays off MapLibre (ADR-016 route budget), and the
 * full map is one tap away at /district/:id/map?club=.
 *
 * Projection: equirectangular with a cos(mean latitude) correction, so a
 * district a few hundred kilometres across keeps its shape. One scale serves
 * both axes (aspect preserved), and the cloud is centred in the box. A flat
 * extent (one club, or every club at one point) is padded symmetrically
 * rather than divided by zero (the `range === 0` tripwire).
 */
export interface LocatorSource {
  clubId: string
  coordinates?: { lat: number; lng: number } | undefined
}

export interface LocatorPoint {
  id: string
  x: number
  y: number
}

export interface LocatorBox {
  width: number
  height: number
  /** Inset on every side, in the same units. */
  pad: number
}

export interface ClubLocator {
  /** Every located club, the focus club included. */
  points: LocatorPoint[]
  focus: LocatorPoint | null
}

const located = (
  c: LocatorSource
): c is LocatorSource & { coordinates: { lat: number; lng: number } } =>
  !!c.coordinates &&
  Number.isFinite(c.coordinates.lat) &&
  Number.isFinite(c.coordinates.lng)

/** Null when the focus club has no usable coordinates. */
export function projectClubLocator(
  clubs: readonly LocatorSource[],
  focusId: string,
  box: LocatorBox
): ClubLocator | null {
  const pts = clubs.filter(located)
  const focusSrc = pts.find(c => clubIdsMatch(c.clubId, focusId))
  if (!focusSrc) return null

  const lats = pts.map(c => c.coordinates.lat)
  const meanLat = lats.reduce((s, v) => s + v, 0) / lats.length
  const k = Math.cos((meanLat * Math.PI) / 180)
  const xs = pts.map(c => c.coordinates.lng * k)
  const ys = lats

  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const spanX = maxX - minX
  const spanY = maxY - minY

  const innerW = box.width - 2 * box.pad
  const innerH = box.height - 2 * box.pad
  // A zero span on both axes means a single point: any finite scale centres
  // it, so use 1 rather than dividing by zero.
  const scale =
    spanX === 0 && spanY === 0
      ? 1
      : Math.min(
          spanX === 0 ? Infinity : innerW / spanX,
          spanY === 0 ? Infinity : innerH / spanY
        )
  const offX = box.pad + (innerW - spanX * scale) / 2
  const offY = box.pad + (innerH - spanY * scale) / 2

  const points = pts.map((c, i) => ({
    id: c.clubId,
    x: offX + (xs[i]! - minX) * scale,
    // North up: larger latitude → smaller y.
    y: offY + (maxY - ys[i]!) * scale,
  }))
  const focus = points.find(p => p.id === focusSrc.clubId) ?? null
  return { points, focus }
}
