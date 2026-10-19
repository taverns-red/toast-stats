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

/**
 * #1943 — every located club, projected into the box with no focus. The
 * district map's static preview draws these while MapLibre loads.
 */
export function projectClubPoints(
  clubs: readonly LocatorSource[],
  box: LocatorBox
): LocatorPoint[] {
  const pts = clubs.filter(located)
  if (pts.length === 0) return []

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

  return pts.map((c, i) => ({
    id: c.clubId,
    x: offX + (xs[i]! - minX) * scale,
    // North up: larger latitude → smaller y.
    y: offY + (maxY - ys[i]!) * scale,
  }))
}

/** Null when the focus club has no usable coordinates. */
export function projectClubLocator(
  clubs: readonly LocatorSource[],
  focusId: string,
  box: LocatorBox
): ClubLocator | null {
  const focusSrc = clubs
    .filter(located)
    .find(c => clubIdsMatch(c.clubId, focusId))
  if (!focusSrc) return null
  const points = projectClubPoints(clubs, box)
  const focus = points.find(p => p.id === focusSrc.clubId) ?? null
  return { points, focus }
}

type Located = LocatorSource & { coordinates: { lat: number; lng: number } }

/** [[west, south], [east, north]] in degrees, MapLibre's `LngLatBoundsLike`. */
export type LocatorBounds = [[number, number], [number, number]]

export interface LocatorFit {
  /** Located clubs kept in view; the focus club is one of them iff it is not
   *  an outlier. */
  inView: Located[]
  /** The focus club when it is in view, else null. */
  focus: Located | null
  /** The focus club has coordinates, but they are a far-off outlier. */
  focusIsOutlier: boolean
  /** Located clubs left out of the view as outliers. */
  trimmed: number
  bounds: LocatorBounds
}

/** #2162 — red stub. */
export function fitClubLocator(
  _clubs: readonly LocatorSource[],
  _focusId: string
): LocatorFit | null {
  return null
}
