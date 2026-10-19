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

// CIELAB (D65) for the area shades below.
const lin = (v: number) =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
const gam = (v: number) =>
  v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
const WHITE_POINT = [0.95047, 1, 1.08883] as const
const M_XYZ = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
] as const
const M_RGB = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252],
] as const

function toLab(hex: string): [number, number, number] {
  const rgb = [1, 3, 5].map(i => lin(parseInt(hex.slice(i, i + 2), 16) / 255))
  const f = (t: number) =>
    t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116
  const [fx, fy, fz] = M_XYZ.map((row, i) =>
    f(row.reduce((s, m, j) => s + m * rgb[j]!, 0) / WHITE_POINT[i]!)
  ) as [number, number, number]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/** Lab → sRGB, or null when out of gamut. */
function fromLab(L: number, a: number, b: number): string | null {
  const fy = (L + 16) / 116
  const inv = (t: number) =>
    t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27)
  const xyz = [fy + a / 500, fy, fy - b / 200].map(
    (t, i) => inv(t) * WHITE_POINT[i]!
  )
  const rgb = M_RGB.map(row => gam(row.reduce((s, m, j) => s + m * xyz[j]!, 0)))
  if (rgb.some(v => v < -0.001 || v > 1.001)) return null
  return (
    '#' +
    rgb
      .map(v =>
        Math.round(Math.min(1, Math.max(0, v)) * 255)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
      .toUpperCase()
  )
}

/**
 * L* rungs for area shades (#2178). Steps of 9 keep ΔE2000 ≥ 5 between
 * neighbouring rungs under every vision; the 46→57 gap skips the band where
 * neither white nor ink text clears 4.5:1, so every shade keeps its label.
 */
const AREA_LIGHTNESS = [28, 37, 46, 57, 66, 75, 84] as const

/**
 * `n` shades of a division hue (#2178): consecutive rungs centred on the
 * hue's own lightness, hue kept and chroma eased only to stay in gamut.
 */
export function areaShades(fill: string, n: number): string[] {
  const [L, a, b] = toLab(fill)
  const rungs = AREA_LIGHTNESS.length
  const span = Math.min(n, rungs)
  const centre = AREA_LIGHTNESS.reduce(
    (best, l, i) =>
      Math.abs(l - L) < Math.abs(AREA_LIGHTNESS[best]! - L) ? i : best,
    0
  )
  const start = Math.max(
    0,
    Math.min(rungs - span, centre - Math.floor((span - 1) / 2))
  )
  return Array.from({ length: n }, (_, i) => {
    const l = AREA_LIGHTNESS[start + (i % span)]!
    for (let k = 1; k >= 0; k -= 0.02) {
      const hex = fromLab(l, a * k, b * k)
      if (hex) return hex
    }
    return fromLab(l, 0, 0)!
  })
}

/** Area fills: each division's hue, its areas in lightness steps. */
function areaColours(clubs: readonly ClubTrend[]): Map<string, string> {
  const divisions = assignTerritoryColours(clubs, divisionKey)
  const areasOf = new Map<string, string[]>()
  for (const c of clubs) {
    const d = divisionKey(c)
    const list = areasOf.get(d) ?? []
    if (!list.includes(areaKey(c))) list.push(areaKey(c))
    areasOf.set(d, list)
  }
  const out = new Map<string, string>()
  for (const [d, areas] of areasOf) {
    areas.sort(compareLabel)
    const shades = areaShades(divisions.get(d)!, areas.length)
    areas.forEach((k, i) => out.set(k, shades[i]!))
  }
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
