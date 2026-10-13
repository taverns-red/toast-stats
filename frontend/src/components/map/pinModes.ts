/**
 * Pin colour modes for the club maps (#1784), per
 * docs/design/map-pin-colour-modes.md (#1785).
 *
 * One registry: each mode defines its categories once (fill, non-colour
 * shape, label) and the legend, the pins, the clusters and the filters all
 * read that definition, so they cannot drift (Lesson 052). Pure: no React,
 * no MapLibre. #1787 adds modes by adding a `ModeDef`; #1788 adds facets.
 *
 * Fills are theme-stable (spec §1.4); only the outline flips with the theme.
 * `mapPalette.test.ts` validates every palette here (CVD ΔE, contrast).
 */
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'

export type MapColorMode =
  'health' | 'tier' | 'division' | 'area' | ExtendedMode

/** #1787: built in `pinExtended`, loaded after the first render. */
export type ExtendedMode = 'status' | 'size' | 'growth' | 'dcp' | 'age'

/** Picker order, in the spec's groups (§5). */
export const MAP_COLOR_MODES: readonly {
  id: MapColorMode
  label: string
  group: string
}[] = [
  { id: 'health', label: 'Club health', group: 'Health & status' },
  { id: 'tier', label: 'Distinguished level', group: 'Health & status' },
  { id: 'status', label: 'TI club status', group: 'Health & status' },
  { id: 'size', label: 'Members', group: 'Membership & DCP' },
  { id: 'growth', label: 'Net growth', group: 'Membership & DCP' },
  { id: 'dcp', label: 'DCP goals', group: 'Membership & DCP' },
  { id: 'age', label: 'Club age', group: 'Membership & DCP' },
  { id: 'division', label: 'Division', group: 'Territory' },
  { id: 'area', label: 'Area', group: 'Territory' },
]

/** `?color=` is URL-seedable: whitelist at the parse (Lessons 124/144). */
export function parseMapColorMode(raw: string | null): MapColorMode {
  return MAP_COLOR_MODES.some(m => m.id === raw)
    ? (raw as MapColorMode)
    : 'health'
}

export type PinShape =
  | 'circle'
  | 'triangle'
  | 'square'
  | 'suspended'
  | 'fill0'
  | 'fill25'
  | 'fill50'
  | 'fill75'
  | 'fill100'
  | 'up'
  | 'upHalf'
  | 'down'
  | 'downHalf'
  | 'na'

export const PIN_SHAPES: readonly PinShape[] = [
  'circle',
  'triangle',
  'square',
  'suspended',
  'fill0',
  'fill25',
  'fill50',
  'fill75',
  'fill100',
  'up',
  'upHalf',
  'down',
  'downHalf',
  'na',
]

export const HEALTH_FILLS = {
  thriving: '#2A8F6E',
  vulnerable: '#E0A030',
  'intervention-required': '#C93D3D',
} as const

export const TIER_FILLS = {
  NotDistinguished: '#D6D3CC',
  Distinguished: '#7FB8D9',
  Select: '#2C6E90',
  President: '#004165',
  Smedley: '#7B1828',
} as const

/** Paul Tol "muted" (spec §3.3). */
export const CATEGORICAL8 = [
  '#332288',
  '#44AA99',
  '#DDCC77',
  '#CC6677',
  '#88CCEE',
  '#117733',
  '#882255',
  '#999933',
] as const

export const SUSPENDED_FILL = '#8C8A82'

/** Pin outline per theme; clears 3:1 on land and water (spec §6.2). */
export const OUTLINE = { light: '#3D3B38', dark: '#F4F1EB' } as const

const INK = '#0F0E0D'
const WHITE = '#FFFFFF'

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** The better of white or ink text on a fill (spec §6.1: ≥ 4.5:1). */
export function labelColourOn(fill: string): string {
  const l = luminance(fill)
  const onWhite = 1.05 / (l + 0.05)
  const onInk = (l + 0.05) / (luminance(INK) + 0.05)
  return onWhite >= onInk ? WHITE : INK
}

export interface PinCategory {
  key: string
  label: string
  fill: string
  shape: PinShape
  /** On-pin code for territory modes (`B`, `B12`). */
  code?: string
}

export interface ModeModel {
  mode: MapColorMode
  title: string
  kind: 'status' | 'ordinal' | 'categorical'
  /** Every category the mode can draw, in legend order. */
  categories: PinCategory[]
  categoryOf(club: ClubTrend): PinCategory
  /** Dashed outline: a provisional (projected) tier. */
  isDashed(club: ClubTrend): boolean
  /** The URL facet its legend chips write; null when the chips only explain. */
  facet: { param: string; valueOf(cat: PinCategory): string } | null
  /** The category clusters flag with a pip when it isn't the fill. */
  exceptionKey?: string
}

export const SUSPENDED: PinCategory = {
  key: 'suspended',
  label: 'Suspended',
  fill: SUSPENDED_FILL,
  shape: 'suspended',
}

/** The read-time renewal overlay only promotes to Active (Lesson 172). */
function isSuspended(club: ClubTrend): boolean {
  if (club.statusOverlay) return false
  return club.clubStatus?.toLowerCase() === 'suspended'
}

const HEALTH_CATS: PinCategory[] = [
  {
    key: 'thriving',
    label: 'Thriving',
    fill: HEALTH_FILLS.thriving,
    shape: 'circle',
  },
  {
    key: 'vulnerable',
    label: 'Vulnerable',
    fill: HEALTH_FILLS.vulnerable,
    shape: 'triangle',
  },
  {
    key: 'intervention-required',
    label: 'Intervention required',
    fill: HEALTH_FILLS['intervention-required'],
    shape: 'square',
  },
  SUSPENDED,
]

const STATUS_ALIAS: Record<string, string> = {
  thriving: 'thriving',
  vulnerable: 'vulnerable',
  'intervention-required': 'intervention',
}

/** Ladder order, top first; fill level rises with the tier (spec §3.2). */
const TIER_CATS: PinCategory[] = [
  {
    key: 'Smedley',
    label: 'Smedley',
    fill: TIER_FILLS.Smedley,
    shape: 'fill100',
  },
  {
    key: 'President',
    label: "President's",
    fill: TIER_FILLS.President,
    shape: 'fill75',
  },
  { key: 'Select', label: 'Select', fill: TIER_FILLS.Select, shape: 'fill50' },
  {
    key: 'Distinguished',
    label: 'Distinguished',
    fill: TIER_FILLS.Distinguished,
    shape: 'fill25',
  },
  {
    key: 'NotDistinguished',
    label: 'Not yet Distinguished',
    fill: TIER_FILLS.NotDistinguished,
    shape: 'fill0',
  },
  SUSPENDED,
]

export const byKey = (cats: PinCategory[], key: string) =>
  cats.find(c => c.key === key) ?? SUSPENDED

export function withSuspended(pick: (club: ClubTrend) => PinCategory) {
  return (club: ClubTrend) => (isSuspended(club) ? SUSPENDED : pick(club))
}

export const compareLabel = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

export type TerritoryMode = 'division' | 'area'

export const isTerritoryMode = (m: MapColorMode): m is TerritoryMode =>
  m === 'division' || m === 'area'

/** Health and tier are built here; every other mode in an on-demand chunk
 *  (`pinTerritory`, `pinExtended`), kept off the route's first load. */
export const isLazyMode = (m: MapColorMode) => m !== 'health' && m !== 'tier'

/** The legend-chip keys of the `pinExtended` modes (#1787). */
export const EXTENDED_FACET_PARAMS = [
  'clubStatus',
  'size',
  'growth',
  'dcp',
  'age',
] as const

export function buildModeModel(mode: 'health' | 'tier'): ModeModel {
  if (mode === 'tier') {
    return {
      mode,
      title: 'Distinguished level',
      kind: 'ordinal',
      categories: TIER_CATS,
      categoryOf: withSuspended(c =>
        byKey(TIER_CATS, c.distinguishedLevel || 'NotDistinguished')
      ),
      isDashed: c => c.isProvisionallyDistinguished === true,
      facet: { param: 'distinguished', valueOf: cat => cat.key },
    }
  }
  return {
    mode: 'health',
    title: 'Club health',
    kind: 'status',
    categories: HEALTH_CATS,
    categoryOf: withSuspended(c => byKey(HEALTH_CATS, c.currentStatus)),
    isDashed: () => false,
    facet: {
      param: 'status',
      valueOf: cat => STATUS_ALIAS[cat.key] ?? cat.key,
    },
    exceptionKey: 'intervention-required',
  }
}

export interface LegendChip extends PinCategory {
  count: number
}

/**
 * Legend chips with counts over every club in scope, mapped or not (spec
 * §4.3). Status and categorical modes hide zero chips; ordinal modes keep
 * every rung so the ladder reads. Categorical chips sort by count.
 */
export function legendChips(
  model: ModeModel,
  clubs: readonly ClubTrend[]
): LegendChip[] {
  const counts = new Map<string, number>()
  for (const c of clubs) {
    const k = model.categoryOf(c).key
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const chips = model.categories.map(cat => ({
    ...cat,
    count: counts.get(cat.key) ?? 0,
  }))
  // Shared states (suspended, not available) are no rung: hidden at 0.
  const shown = chips.filter(
    c =>
      c.count > 0 ||
      (model.kind === 'ordinal' && c.shape !== 'suspended' && c.shape !== 'na')
  )
  if (model.kind === 'categorical')
    shown.sort((a, b) => b.count - a.count || compareLabel(a.label, b.label))
  return shown
}

/* ── URL facets: the Clubs-table keys (clubFilterUrl.ts), so one link
   filters both the map and the list (spec §9). ─────────────────────── */

const STATUS_FROM_ALIAS: Record<string, string> = {
  thriving: 'thriving',
  vulnerable: 'vulnerable',
  intervention: 'intervention-required',
}

const FACETS: Array<{
  param: string
  valueOf: (c: ClubTrend) => string
  parse?: (v: string) => string | undefined
}> = [
  {
    param: 'status',
    valueOf: c => c.currentStatus,
    parse: v => STATUS_FROM_ALIAS[v],
  },
  { param: 'distinguished', valueOf: c => c.distinguishedLevel },
  { param: 'divisions', valueOf: c => c.divisionName },
  { param: 'areas', valueOf: c => c.areaName },
]

export function facetValues(params: URLSearchParams, param: string): string[] {
  return (params.get(param) ?? '').split(',').filter(Boolean)
}

/** The Filters control's keys (#1788); the rest of the filter logic loads
 *  on demand from `mapFilters`. */
export const MAP_FILTER_PARAMS = [
  'visit',
  'online',
  'divisions',
  'areas',
] as const
export type MapFilterParam = (typeof MAP_FILTER_PARAMS)[number]

export const activeMapFilterCount = (params: URLSearchParams) =>
  MAP_FILTER_PARAMS.filter(k => facetValues(params, k).length).length

/** Apply every facet present in the URL (AND across facets, OR within). */
export function applyFacets(
  clubs: readonly ClubTrend[],
  params: URLSearchParams
): ClubTrend[] {
  let out = [...clubs]
  for (const f of FACETS) {
    const raw = facetValues(params, f.param)
    const wanted = new Set(f.parse ? raw.map(f.parse).filter(Boolean) : raw)
    if (wanted.size === 0) continue
    out = out.filter(c => wanted.has(f.valueOf(c)))
  }
  return out
}

/** Toggle one facet value: one URL write per handler (Lesson: two
 *  URL-state hooks in one handler lose a facet). */
export function toggleFacetValue(
  params: URLSearchParams,
  param: string,
  value: string
): URLSearchParams {
  const next = new URLSearchParams(params)
  const values = facetValues(params, param)
  const updated = values.includes(value)
    ? values.filter(v => v !== value)
    : [...values, value]
  if (updated.length) next.set(param, updated.join(','))
  else next.delete(param)
  return next
}
