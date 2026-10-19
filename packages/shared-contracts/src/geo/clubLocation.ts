/**
 * The one ingest decision for "does this club get a map point?" (#2160).
 *
 * It extends {@link parseCoordinates} (#2153) with two rules, applied in
 * this order:
 *
 * 1. **Fully online clubs get no point.** A club that meets only online has
 *    no meeting place, so a pin (FAC's geocode of its mailing address) would
 *    mislead. "Fully online" is FAC's `AllowsVirtualAttendance === true`
 *    AND every meeting in the parsed schedule (`meetingSchedule[].mode`,
 *    #1789) is `online`. A hybrid club keeps its pin. FAC has no structured
 *    meeting-format field: AllowsVirtualAttendance is true for hybrid and
 *    online clubs alike (and for 4,415 clubs whose text says in person), so
 *    it is a necessary condition, never a sufficient one. Only when no
 *    meeting mode is known does the city text decide ("Virtual", "Online").
 * 2. **A geocode far from its peers is dropped.** FAC geocodes some clubs to
 *    a same-named place elsewhere ("Windsor, CT" → Thane, India; "Doha" →
 *    Miami). Peers are the clubs of the same district with the same address
 *    country; a group of fewer than {@link OUTLIER.minGroup} is not judged.
 *    A point is an outlier when it is BOTH
 *    - farther from the group's median point than
 *      max({@link OUTLIER.floorKm}, median + {@link OUTLIER.spread} × MAD)
 *      (MAD scaled by 1.4826 to estimate a standard deviation), and
 *    - isolated: fewer than {@link OUTLIER.minNeighbours} peers lie within
 *      {@link OUTLIER.neighbourKm}.
 *    The isolation guard keeps real far-flung clusters (District 2's Alaska
 *    clubs, ~2,300 km from Seattle). Measured on prod 2026-10-18 (#2160):
 *    161 of 14,145 geocoded clubs flagged worldwide.
 *
 * A club that does not resolve to a point keeps its row and is counted as
 * unmapped; the frontend shows its text place instead.
 */

import { parseCoordinates, type LatLng } from './coordinates.js'

/** Tuning for rule 2; see the module comment and #2160 for the measurement. */
export const OUTLIER = {
  floorKm: 2000,
  spread: 5,
  neighbourKm: 500,
  minNeighbours: 3,
  minGroup: 5,
} as const

export type MeetingMode = 'in-person' | 'online' | 'hybrid'

/** The fields the decision reads; a district file club row satisfies it. */
export interface ClubLocationInput {
  clubId: string
  coordinates?: unknown
  address?: { city?: string; country?: string }
  allowsVirtualAttendance?: boolean
  meetingSchedule?: ReadonlyArray<{ mode?: MeetingMode }>
}

export type UnmappedReason =
  'no-coordinates' | 'meets-online' | 'geocode-outlier'

export type ClubLocation =
  | { mapped: true; coordinates: LatLng }
  | { mapped: false; reason: UnmappedReason }

/** Place text that says the club meets online rather than naming a place. */
const ONLINE_PLACE =
  /^(?:online|on-line|virtual|virtuel|en ligne|zoom|remote)(?:\s+(?:club|meeting|only))?$/i

/** True when the club meets only online (rule 1). */
export function meetsOnlyOnline(club: ClubLocationInput): boolean {
  if (club.allowsVirtualAttendance !== true) return false
  const modes = (club.meetingSchedule ?? [])
    .map(entry => entry.mode)
    .filter((mode): mode is MeetingMode => mode !== undefined)
  if (modes.length > 0) return modes.every(mode => mode === 'online')
  const city = club.address?.city?.trim()
  return city !== undefined && ONLINE_PLACE.test(city)
}

const EARTH_RADIUS_KM = 6371
const rad = (deg: number): number => (deg * Math.PI) / 180

function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** Ids of the points in one peer group that fail rule 2. */
function outliersIn(group: { clubId: string; point: LatLng }[]): Set<string> {
  const out = new Set<string>()
  if (group.length < OUTLIER.minGroup) return out
  const centre = {
    lat: median(group.map(g => g.point.lat)),
    lng: median(group.map(g => g.point.lng)),
  }
  const dist = group.map(g => distanceKm(centre, g.point))
  const mid = median(dist)
  const mad = median(dist.map(d => Math.abs(d - mid))) * 1.4826
  const threshold = Math.max(OUTLIER.floorKm, mid + OUTLIER.spread * mad)
  group.forEach((g, i) => {
    if (dist[i]! <= threshold) return
    let neighbours = 0
    for (const peer of group) {
      if (peer === g) continue
      if (distanceKm(peer.point, g.point) <= OUTLIER.neighbourKm) {
        neighbours += 1
        if (neighbours >= OUTLIER.minNeighbours) return
      }
    }
    out.add(g.clubId)
  })
  return out
}

/**
 * Resolve every club of ONE district. Pass the whole district: rule 2
 * judges each point against its peers, so a partial list changes answers.
 */
export function resolveClubLocations(
  clubs: readonly ClubLocationInput[]
): Map<string, ClubLocation> {
  const result = new Map<string, ClubLocation>()
  const groups = new Map<string, { clubId: string; point: LatLng }[]>()
  const points = new Map<string, LatLng>()
  for (const club of clubs) {
    const point = parseCoordinates(club.coordinates)
    if (!point) {
      result.set(club.clubId, {
        mapped: false,
        reason: meetsOnlyOnline(club) ? 'meets-online' : 'no-coordinates',
      })
      continue
    }
    points.set(club.clubId, point)
    // Every geocoded club is a peer, online ones included: their points
    // are still FAC's geocode of an address in the district.
    const country = club.address?.country?.trim().toLowerCase()
    if (!country) continue
    const group = groups.get(country) ?? []
    group.push({ clubId: club.clubId, point })
    groups.set(country, group)
  }
  const outliers = new Set<string>()
  for (const group of groups.values()) {
    for (const id of outliersIn(group)) outliers.add(id)
  }
  for (const club of clubs) {
    const point = points.get(club.clubId)
    if (!point) continue
    if (meetsOnlyOnline(club)) {
      result.set(club.clubId, { mapped: false, reason: 'meets-online' })
    } else if (outliers.has(club.clubId)) {
      result.set(club.clubId, { mapped: false, reason: 'geocode-outlier' })
    } else {
      result.set(club.clubId, { mapped: true, coordinates: point })
    }
  }
  return result
}
