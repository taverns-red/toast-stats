/**
 * World territory colour modes (#1809): Region and District over every
 * club in the world.
 *
 * The region map's district mode (`pinDistrict`) finds neighbours club to
 * club, which is quadratic: fine for a region's ~1k clubs, minutes for the
 * world's ~15k. Here two territories are neighbours when one's centroid is
 * among the 3 nearest centroids of the other — a few hundred keys, so the
 * mode builds in milliseconds — with the same greedy Welsh–Powell colouring
 * over `CATEGORICAL12` (spec §7.1, #2178), ties broken by key so it is
 * stable day to day. An on-demand chunk (`worldModels`).
 */
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import type { RegionClub } from '../../utils/regionClubs'
import { UNASSIGNED, worldRegionLabel } from '../../utils/worldClubs'
import {
  CATEGORICAL12,
  SUSPENDED,
  byKey,
  compareLabel,
  withSuspended,
  type ModeModel,
  type PinCategory,
} from './pinModes'

const NEIGHBOURS = 3

/** Territory colours by centroid adjacency; linear in clubs. */
export function assignCentroidColours(
  clubs: readonly ClubTrend[],
  keyOf: (c: ClubTrend) => string
): Map<string, string> {
  const sums = new Map<string, { lat: number; x: number; n: number }>()
  const keys = new Set<string>()
  for (const c of clubs) {
    const k = keyOf(c)
    keys.add(k)
    const at = c.coordinates
    if (!at) continue
    const s = sums.get(k) ?? { lat: 0, x: 0, n: 0 }
    s.lat += at.lat
    s.x += at.lng
    s.n++
    sums.set(k, s)
  }
  const sorted = [...keys].sort(compareLabel)
  const centres = [...sums.entries()].map(([k, s]) => {
    const lat = s.lat / s.n
    return { k, lat, x: (s.x / s.n) * Math.cos((lat * Math.PI) / 180) }
  })
  const adj = new Map<string, Set<string>>(sorted.map(k => [k, new Set()]))
  for (const a of centres) {
    const near = centres
      .filter(b => b.k !== a.k)
      .map(b => ({ k: b.k, d: (b.x - a.x) ** 2 + (b.lat - a.lat) ** 2 }))
      .sort((p, q) => p.d - q.d || compareLabel(p.k, q.k))
      .slice(0, NEIGHBOURS)
    for (const { k } of near) {
      adj.get(a.k)!.add(k)
      adj.get(k)!.add(a.k)
    }
  }
  const order = [...sorted].sort(
    (p, q) => adj.get(q)!.size - adj.get(p)!.size || compareLabel(p, q)
  )
  const palette = CATEGORICAL12
  const unique = sorted.length <= palette.length
  const colour = new Map<string, number>()
  for (const k of order) {
    const others = unique ? colour.keys() : adj.get(k)!
    const used = new Set([...others].map(n => colour.get(n)))
    let i = 0
    while (used.has(i) && i < palette.length) i++
    colour.set(k, i % palette.length)
  }
  return new Map(sorted.map(k => [k, palette[colour.get(k)!]!]))
}

const regionOf = (c: ClubTrend) =>
  (c as Partial<RegionClub>).regionId ?? UNASSIGNED
const districtOf = (c: ClubTrend) =>
  (c as Partial<RegionClub>).districtId ?? '?'

function territoryModel(
  mode: 'region' | 'district',
  title: string,
  clubs: readonly RegionClub[],
  keyOf: (c: ClubTrend) => string,
  label: (key: string) => string,
  code: (key: string) => string
): ModeModel {
  const colours = assignCentroidColours(clubs, keyOf)
  const categories: PinCategory[] = [...colours.keys()]
    .sort((a, b) =>
      a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : compareLabel(a, b)
    )
    .map(key => ({
      key,
      label: label(key),
      fill: colours.get(key)!,
      shape: 'circle',
      code: code(key),
    }))
  categories.push(SUSPENDED)
  return {
    mode,
    title,
    kind: 'categorical',
    categories,
    categoryOf: withSuspended(c => byKey(categories, keyOf(c))),
    isDashed: () => false,
    facet: { param: mode, valueOf: cat => cat.key },
  }
}

/** One category per region (the shard key), `?region=` from its chips. */
export const worldRegionModel = (clubs: readonly RegionClub[]) =>
  territoryModel('region', 'Region', clubs, regionOf, worldRegionLabel, k =>
    k === UNASSIGNED ? '' : k
  )

/** One category per district, `?district=` from its chips. */
export const worldDistrictModel = (clubs: readonly RegionClub[]) =>
  territoryModel(
    'district',
    'District',
    clubs,
    districtOf,
    k => `District ${k}`,
    k => k
  )
