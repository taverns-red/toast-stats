/**
 * Territory pin modes — division and area (#1784, spec §7). Split from
 * `pinModes` so the map route's first load carries only health and tier;
 * the page loads this after its first render.
 */
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import {
  CATEGORICAL12,
  SUSPENDED,
  byKey,
  compareLabel,
  withSuspended,
  type ModeModel,
  type PinCategory,
  type TerritoryMode,
} from './pinModes'
import { areaShades } from './pinAreaShades'

const divisionKey = (c: ClubTrend) => c.divisionId || c.divisionName || '?'
const areaKey = (c: ClubTrend) =>
  `${divisionKey(c)}|${c.areaId || c.areaName || '?'}`

function areaCode(c: ClubTrend): string {
  const div = c.divisionId || ''
  const area = c.areaId || ''
  return area.startsWith(div) ? area : `${div}${area}`
}

/**
 * Colour territories by adjacency, not hash (spec §7.1): two territories are
 * neighbours when a club of one is among the 3 nearest other-territory clubs
 * of a club of the other. Greedy Welsh–Powell, ties broken by key, so the
 * result is stable day to day. Up to 12 territories each get their own hue
 * (#2178: reusing a hue for two non-neighbours made B, F and I read as one);
 * only beyond that does a hue repeat, and then never between neighbours.
 */
export function assignTerritoryColours(
  clubs: readonly ClubTrend[],
  keyOf: (c: ClubTrend) => string
): Map<string, string> {
  const keys = [...new Set(clubs.map(keyOf))].sort(compareLabel)
  const located = clubs.filter(c => c.coordinates)
  const adj = new Map<string, Set<string>>(keys.map(k => [k, new Set()]))
  for (const a of located) {
    const ka = keyOf(a)
    const cos = Math.cos((a.coordinates!.lat * Math.PI) / 180 || 0)
    const near = located
      .filter(b => keyOf(b) !== ka)
      .map(b => ({
        k: keyOf(b),
        d:
          ((b.coordinates!.lng - a.coordinates!.lng) * cos) ** 2 +
          (b.coordinates!.lat - a.coordinates!.lat) ** 2,
      }))
      .sort((x, y) => x.d - y.d || compareLabel(x.k, y.k))
      .slice(0, 3)
    for (const { k } of near) {
      adj.get(ka)!.add(k)
      adj.get(k)!.add(ka)
    }
  }
  const order = [...keys].sort(
    (x, y) => adj.get(y)!.size - adj.get(x)!.size || compareLabel(x, y)
  )
  const palette = CATEGORICAL12
  const unique = keys.length <= palette.length
  const colour = new Map<string, number>()
  for (const k of order) {
    const others = unique ? colour.keys() : adj.get(k)!
    const used = new Set([...others].map(n => colour.get(n)))
    let i = 0
    while (used.has(i) && i < palette.length) i++
    colour.set(k, i % palette.length)
  }
  return new Map(keys.map(k => [k, palette[colour.get(k)!]!]))
}

/** Area fills: shades of each division's hue, picked district-wide. */
function areaColours(clubs: readonly ClubTrend[]): Map<string, string> {
  const divisions = assignTerritoryColours(clubs, divisionKey)
  const areasOf = new Map<string, string[]>()
  for (const c of clubs) {
    const d = divisionKey(c)
    const list = areasOf.get(d) ?? []
    if (!list.includes(areaKey(c))) list.push(areaKey(c))
    areasOf.set(d, list)
  }
  const groups = [...areasOf.keys()].sort(compareLabel)
  const shades = areaShades(
    groups.map(d => ({
      fill: divisions.get(d)!,
      count: areasOf.get(d)!.length,
    }))
  )
  const out = new Map<string, string>()
  groups.forEach((d, g) => {
    const areas = areasOf.get(d)!.sort(compareLabel)
    areas.forEach((k, i) => out.set(k, shades[g]![i]!))
  })
  return out
}

export function territoryModel(
  mode: TerritoryMode,
  clubs: readonly ClubTrend[]
): ModeModel {
  const keyOf = mode === 'division' ? divisionKey : areaKey
  const colours =
    mode === 'division'
      ? assignTerritoryColours(clubs, keyOf)
      : areaColours(clubs)
  const cats = new Map<string, PinCategory>()
  for (const c of clubs) {
    const key = keyOf(c)
    if (cats.has(key)) continue
    cats.set(key, {
      key,
      label:
        mode === 'division'
          ? c.divisionName || `Division ${c.divisionId}`
          : c.areaName || `Area ${c.areaId}`,
      fill: colours.get(key)!,
      shape: 'circle',
      code: mode === 'division' ? c.divisionId : areaCode(c),
    })
  }
  const categories = [...cats.values()].sort((a, b) =>
    compareLabel(a.code ?? a.label, b.code ?? b.label)
  )
  categories.push(SUSPENDED)
  return {
    mode,
    title: mode === 'division' ? 'Division' : 'Area',
    kind: 'categorical',
    categories,
    categoryOf: withSuspended(c => byKey(categories, keyOf(c))),
    isDashed: () => false,
    facet: {
      param: mode === 'division' ? 'divisions' : 'areas',
      valueOf: cat => cat.label,
    },
  }
}
