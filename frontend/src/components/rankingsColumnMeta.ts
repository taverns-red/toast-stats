/**
 * Landing rankings table column metadata (#2689, #2676, spec §14 M1).
 *
 * One record per column: the Columns-menu group, name and hint, the fixed
 * width in px, and whether it is on by default at each breakpoint tier. The
 * table never hides a column with CSS: `useTierColumnVisibility` turns these
 * defaults plus the user's overrides into TanStack's `columnVisibility`, so a
 * hidden column is absent from the DOM.
 *
 * District, Rank and Score always show (Ron, 2026-11-12). The three metrics
 * are the choice: at the narrowest table width (768-1023) the two that carry
 * most of the Borda score, Paid clubs and Total payments, show by default and
 * Distinguished is one click away; from 1024 all three fit.
 */

import {
  BREAKPOINT_TIERS,
  TIER_BUDGET_PX,
  type BreakpointTier,
} from './clubsColumnMeta'

export { BREAKPOINT_TIERS, TIER_BUDGET_PX, type BreakpointTier }

export type RankingsColumnId =
  'district' | 'rank' | 'clubs' | 'payments' | 'distinguished' | 'score'

export type RankingsChooserGroup = 'ranking' | 'metrics'

/** Groups as the Columns menu lists them, in order. */
export const RANKINGS_CHOOSER_GROUPS: readonly {
  id: RankingsChooserGroup
  label: string
}[] = [
  { id: 'ranking', label: 'Ranking' },
  { id: 'metrics', label: 'Metrics' },
]

export interface RankingsColumnMeta {
  group: RankingsChooserGroup
  /** Full column name for the Columns menu. */
  label: string
  /** One-line hint under the label, so terse headers need no tooltip. */
  hint: string
  /** Fixed width in px, including 8px padding per side. District takes the
   *  rest. */
  size: number
  /** `'always'`: shown at every width and cannot be switched off. */
  defaultVisible: 'always' | Readonly<Record<BreakpointTier, boolean>>
}

/** The District column never gets less than this. */
export const DISTRICT_MIN_SIZE = 180

/** Table order. */
export const RANKINGS_COLUMN_IDS: readonly RankingsColumnId[] = [
  'district',
  'rank',
  'clubs',
  'payments',
  'distinguished',
  'score',
]

/** Shown from this tier up. */
const from = (first: BreakpointTier): Record<BreakpointTier, boolean> => {
  const at = BREAKPOINT_TIERS.indexOf(first)
  return {
    tablet: at <= 0,
    laptop: at <= 1,
    desktop: at <= 2,
    wide: at <= 3,
  }
}

export const rankingsColumnMeta: Readonly<
  Record<RankingsColumnId, RankingsColumnMeta>
> = {
  district: {
    group: 'ranking',
    label: 'District',
    hint: 'The district, its recognition and a link to its page',
    size: DISTRICT_MIN_SIZE,
    defaultVisible: 'always',
  },
  rank: {
    group: 'ranking',
    label: 'Rank',
    hint: 'Overall rank by Score',
    size: 80,
    defaultVisible: 'always',
  },
  clubs: {
    group: 'metrics',
    label: 'Paid clubs',
    hint: 'Clubs that met renewal obligations, with rank and growth',
    size: 132,
    defaultVisible: from('tablet'),
  },
  payments: {
    group: 'metrics',
    label: 'Total payments',
    hint: 'Year-to-date membership payments, with rank and growth',
    size: 144,
    defaultVisible: from('tablet'),
  },
  distinguished: {
    group: 'metrics',
    label: 'Distinguished',
    hint: 'Clubs at Distinguished or higher, with rank and share',
    size: 140,
    defaultVisible: from('laptop'),
  },
  score: {
    group: 'ranking',
    label: 'Score',
    hint: 'Borda-count composite of the three rankings',
    size: 96,
    defaultVisible: 'always',
  },
}

/** Columns the user cannot switch off. */
export const ALWAYS_SHOWN_RANKINGS_IDS: readonly RankingsColumnId[] =
  RANKINGS_COLUMN_IDS.filter(
    id => rankingsColumnMeta[id].defaultVisible === 'always'
  )

/** The default visibility of every column at a tier. */
export const rankingsTierDefaults = (
  tier: BreakpointTier
): Record<string, boolean> => {
  const out: Record<string, boolean> = {}
  for (const id of RANKINGS_COLUMN_IDS) {
    const d = rankingsColumnMeta[id].defaultVisible
    out[id] = d === 'always' ? true : d[tier]
  }
  return out
}
