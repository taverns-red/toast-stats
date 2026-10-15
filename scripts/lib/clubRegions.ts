/**
 * Buffered club regions for the street-level basemap (#2084, ADR-016 follow-up).
 *
 * The basemap is world z0–10 (ADR-016 D1). Street names and POIs exist in the
 * Protomaps v4 schema only at z12–14, so the follow-up merges that file with a
 * z11–14 extract over the places clubs actually are. This lib turns club
 * coordinates into the `--region` input of `pmtiles extract`:
 *
 *   1. read `data.allClubs[].coordinates` from each district's analytics file
 *      (Find-A-Club enrichment, #429), deduplicated by club id;
 *   2. buffer each club by `bufferKm` into a lat/lng box;
 *   3. merge overlapping boxes into their union until no two overlap, so a
 *      metro area becomes one box and the output stays small;
 *   4. emit a GeoJSON FeatureCollection of Polygon features — the form
 *      go-pmtiles 1.31.2 `UnmarshalRegion` (pmtiles/region.go) accepts.
 *
 * Pure: no I/O. The runner (scripts/build-club-regions.ts) does the CDN reads.
 */

/** [minLng, minLat, maxLng, maxLat]. minLng > maxLng means it crosses 180°. */
export type Box = [number, number, number, number]

export interface ClubPoint {
  clubId: string
  lat: number
  lng: number
}

export interface Region {
  box: Box
  /** Clubs whose buffer went into this box. */
  count: number
}

/** Web Mercator's latitude limit; tiles do not exist beyond it. */
export const MAX_MERCATOR_LAT = 85.0511

const KM_PER_DEG_LAT = 111.32

export interface ExtractResult {
  points: ClubPoint[]
  /** Clubs listed, with or without coordinates. */
  total: number
  /** Clubs with no `coordinates` field (not geocoded by Find-A-Club). */
  missing: number
  /** Clubs whose coordinates are present but unusable. */
  invalid: number
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

/**
 * Club points from one `district_{id}_analytics.json`. Throws when the file
 * has no `data.allClubs` array: a renamed field must fail the build, not
 * silently produce an empty region.
 */
export function extractClubPoints(file: unknown): ExtractResult {
  const data = isRecord(file) ? file['data'] : undefined
  const clubs = isRecord(data) ? data['allClubs'] : undefined
  if (!Array.isArray(clubs)) {
    throw new Error('analytics file has no data.allClubs array')
  }
  const points: ClubPoint[] = []
  let missing = 0
  let invalid = 0
  for (const c of clubs) {
    if (!isRecord(c)) continue
    const coords = c['coordinates']
    if (!isRecord(coords)) {
      missing++
      continue
    }
    const lat = coords['lat']
    const lng = coords['lng']
    if (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180 ||
      (lat === 0 && lng === 0) // "null island": a failed geocode, not a club
    ) {
      invalid++
      continue
    }
    points.push({ clubId: String(c['clubId']), lat, lng })
  }
  return { points, total: clubs.length, missing, invalid }
}

const wrapLng = (lng: number): number =>
  lng > 180 ? lng - 360 : lng < -180 ? lng + 360 : lng

/** A `km` buffer around a point, as a lat/lng box. */
export function bufferBox(p: { lat: number; lng: number }, km: number): Box {
  const dLat = km / KM_PER_DEG_LAT
  // Floor the cosine so a polar club cannot produce an unbounded width.
  const cos = Math.max(Math.cos((p.lat * Math.PI) / 180), 0.01)
  const dLng = Math.min(dLat / cos, 180)
  return [
    wrapLng(p.lng - dLng),
    Math.max(p.lat - dLat, -MAX_MERCATOR_LAT),
    wrapLng(p.lng + dLng),
    Math.min(p.lat + dLat, MAX_MERCATOR_LAT),
  ]
}

/** Split a box that crosses the antimeridian into two that do not. */
export function splitAntimeridian(b: Box): Box[] {
  if (b[0] <= b[2]) return [b]
  return [
    [b[0], b[1], 180, b[3]],
    [-180, b[1], b[2], b[3]],
  ]
}

const overlaps = (a: Box, b: Box): boolean =>
  a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]

const union = (a: Box, b: Box): Box => [
  Math.min(a[0], b[0]),
  Math.min(a[1], b[1]),
  Math.max(a[2], b[2]),
  Math.max(a[3], b[3]),
]

/**
 * Merge overlapping boxes into their unions until the result is pairwise
 * disjoint. A union can reach a box neither part touched, so it repeats until
 * a pass merges nothing. Boxes must not cross the antimeridian (split first).
 * Quadratic per pass in the worst case; ~14k clubs run in well under a second.
 */
export function clusterBoxes(boxes: Box[]): Region[] {
  let regions: Region[] = boxes.map(box => ({ box: [...box] as Box, count: 1 }))
  for (;;) {
    const out: Region[] = []
    let merged = false
    for (const r of regions) {
      let cur = r
      // Absorb every kept region it overlaps.
      for (let i = out.length - 1; i >= 0; i--) {
        const o = out[i]!
        if (overlaps(o.box, cur.box)) {
          cur = { box: union(o.box, cur.box), count: o.count + cur.count }
          out.splice(i, 1)
          merged = true
        }
      }
      out.push(cur)
    }
    regions = out
    if (!merged) return regions
  }
}

export interface ClubRegionsStats {
  districts: number
  clubsTotal: number
  clubsWithCoordinates: number
  clubsMissingCoordinates: number
  clubsInvalidCoordinates: number
  /** Clubs whose own point lies inside an output box (should equal WithCoordinates). */
  clubsInsideBuffer: number
  bufferKm: number
  regions: number
  /** Approximate area of the output boxes, km² (equirectangular). */
  areaKm2: number
}

export interface ClubRegions {
  regions: Region[]
  stats: ClubRegionsStats
}

const boxAreaKm2 = (b: Box): number => {
  const midLat = ((b[1] + b[3]) / 2) * (Math.PI / 180)
  return (
    (b[2] - b[0]) *
    KM_PER_DEG_LAT *
    Math.cos(midLat) *
    (b[3] - b[1]) *
    KM_PER_DEG_LAT
  )
}

const contains = (b: Box, p: ClubPoint): boolean =>
  p.lng >= b[0] && p.lng <= b[2] && p.lat >= b[1] && p.lat <= b[3]

/** Buffered, clustered regions from a set of district analytics files. */
export function buildClubRegions(
  files: unknown[],
  opts: { bufferKm: number }
): ClubRegions {
  const { bufferKm } = opts
  if (!(bufferKm >= 1 && bufferKm <= 50)) {
    throw new Error(`buffer must be 1..50 km, got ${bufferKm}`)
  }
  // A club id is unique worldwide; a club listed twice is counted once.
  const seen = new Map<string, ClubPoint | null>()
  let invalid = 0
  for (const f of files) {
    const r = extractClubPoints(f)
    for (const p of r.points) seen.set(p.clubId, p)
    const data = (f as { data: { allClubs: unknown[] } }).data
    for (const c of data.allClubs) {
      if (!isRecord(c)) continue
      const id = String(c['clubId'])
      if (!seen.has(id)) seen.set(id, null)
    }
    invalid += r.invalid
  }
  const points = [...seen.values()].filter((p): p is ClubPoint => p !== null)
  const boxes = points.flatMap(p => splitAntimeridian(bufferBox(p, bufferKm)))
  const regions = clusterBoxes(boxes)
  const inside = points.filter(p => regions.some(r => contains(r.box, p)))
  return {
    regions,
    stats: {
      districts: files.length,
      clubsTotal: seen.size,
      clubsWithCoordinates: points.length,
      clubsMissingCoordinates: seen.size - points.length,
      clubsInvalidCoordinates: invalid,
      clubsInsideBuffer: inside.length,
      bufferKm,
      regions: regions.length,
      areaKm2: Math.round(regions.reduce((s, r) => s + boxAreaKm2(r.box), 0)),
    },
  }
}

export interface RegionFeatureCollection {
  type: 'FeatureCollection'
  features: {
    type: 'Feature'
    properties: { clubs: number }
    geometry: { type: 'Polygon'; coordinates: number[][][] }
  }[]
}

/** The `pmtiles extract --region` file: one Polygon feature per box. */
export function regionsToGeoJson(regions: Region[]): RegionFeatureCollection {
  const round = (n: number): number => Math.round(n * 1e5) / 1e5
  return {
    type: 'FeatureCollection',
    features: regions.flatMap(r =>
      splitAntimeridian(r.box).map(b => {
        const [x0, y0, x1, y1] = b.map(round) as Box
        return {
          type: 'Feature' as const,
          properties: { clubs: r.count },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [
              [
                [x0, y0],
                [x1, y0],
                [x1, y1],
                [x0, y1],
                [x0, y0],
              ],
            ],
          },
        }
      })
    ),
  }
}
