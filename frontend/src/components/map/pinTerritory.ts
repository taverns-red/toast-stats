/**
 * Territory pin modes — division and area (#1784, spec §7). Split from
 * `pinModes` so the map route's first load carries only health and tier;
 * the page loads this after its first render.
 */
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import {
  CATEGORICAL8,
  SUSPENDED,
  byKey,
  compareLabel,
  withSuspended,
  type ModeModel,
  type PinCategory,
  type TerritoryMode,
} from './pinModes'

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
 * of a club of the other. Greedy Welsh–Powell over the 8 hues, ties broken
 * by key, so the result is stable day to day.
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
  const colour = new Map<string, number>()
  for (const k of order) {
    const used = new Set(
      [...adj.get(k)!].map(n => colour.get(n)).filter(i => i !== undefined)
    )
    let i = 0
    while (used.has(i) && i < CATEGORICAL8.length) i++
    colour.set(k, i % CATEGORICAL8.length)
  }
  return new Map(keys.map(k => [k, CATEGORICAL8[colour.get(k)!]!]))
}

export function territoryModel(
  mode: TerritoryMode,
  clubs: readonly ClubTrend[]
): ModeModel {
  const keyOf = mode === 'division' ? divisionKey : areaKey
  const colours = assignTerritoryColours(clubs, keyOf)
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
