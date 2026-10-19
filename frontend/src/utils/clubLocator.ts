import { clubIdsMatch } from '@taverns-red/shared-contracts'
import { hasMapPoint } from './mapPoint'

export { hasMapPoint }

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
  /** #2174: an online-only club has no place on a map. */
  meetsOnline?: true | undefined
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

const located = hasMapPoint

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

/** A club with usable coordinates. */
export type LocatedClub = LocatorSource & {
  coordinates: { lat: number; lng: number }
}
type Located = LocatedClub

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

/** Below this radius from the district's centre, no club is an outlier. */
export const OUTLIER_MIN_KM = 250
/** A club further out than this many times the 90th-percentile radius is an
 *  outlier. */
export const OUTLIER_P90_FACTOR = 3

const KM_PER_DEGREE = 111.2

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

/**
 * #2162 — the tiled mini-map's view: the district's located clubs with
 * far-off geocodes trimmed, and their bounds.
 *
 * FAC sometimes geocodes a club to another continent (D53's Voya, a CT club,
 * sits in Mumbai), which would zoom the mini-map out to the whole world.
 * Rule: measure every club's distance from the district's median point (the
 * median is not pulled by the outliers themselves); a club further out than
 * max(250 km, 3 × the 90th-percentile distance) is an outlier. On the
 * 2026-10-18 snapshot this trims D53's Mumbai and Wilmington NC geocodes and
 * nothing in D59, D61, D91, D95 or D128, while D109's real overseas cluster
 * (a sixth of its clubs) stays. With few clubs the 90th percentile is the
 * furthest club, so a handful is never trimmed.
 *
 * The focus club is kept, and its pin drawn, only when it is not an outlier:
 * a mis-geocoded pin would point at the wrong place. Distances are
 * equirectangular, which is ample for "near or far"; no antimeridian
 * handling (no district straddles it today).
 *
 * Null when the focus club has no usable coordinates.
 */
export function fitClubLocator(
  clubs: readonly LocatorSource[],
  focusId: string
): LocatorFit | null {
  const pts = clubs.filter(located)
  const focusSrc = pts.find(c => clubIdsMatch(c.clubId, focusId))
  if (!focusSrc) return null

  const midLat = median(pts.map(c => c.coordinates.lat))
  const midLng = median(pts.map(c => c.coordinates.lng))
  const k = Math.cos((midLat * Math.PI) / 180)
  const dist = (c: Located) =>
    Math.hypot((c.coordinates.lng - midLng) * k, c.coordinates.lat - midLat) *
    KM_PER_DEGREE
  const ds = pts.map(dist)
  const sorted = [...ds].sort((a, b) => a - b)
  const p90 = sorted[Math.round(0.9 * (sorted.length - 1))]!
  const cutoff = Math.max(OUTLIER_MIN_KM, OUTLIER_P90_FACTOR * p90)

  const inView = pts.filter((_, i) => ds[i]! <= cutoff)
  const focus = inView.includes(focusSrc) ? focusSrc : null
  const lngs = inView.map(c => c.coordinates.lng)
  const lats = inView.map(c => c.coordinates.lat)
  return {
    inView,
    focus,
    focusIsOutlier: focus === null,
    trimmed: pts.length - inView.length,
    bounds: [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
  }
}
