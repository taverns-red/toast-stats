/**
 * Region district rankings column metadata (#2702, #2676, spec §14 M3).
 *
 * One record per column: the Columns-menu group, name and hint, the fixed
 * width in px, and whether it is on by default at each breakpoint tier. The
 * table never hides a column with CSS: `useTierColumnVisibility` turns these
 * defaults plus the user's overrides into TanStack's `columnVisibility`, so a
 * hidden column is absent from the DOM.
 *
 * The old table had a two-row header (a Base / Current / Change group under
 * each metric), which a one-row DataTable header cannot show, so every column
 * names itself: "Paid clubs base", "Paid clubs", "Paid clubs change".
 *
 * Defaults by width (budgets: 682, 938, 1177, 1514):
 *  - 768-1023: District, Region rank and Score always; the three metrics that
 *    make the Score (Paid clubs, Payments, Distinguished);
 *  - 1024-1279: adds World rank, the Tier reached and the membership Trend;
 *  - 1280-1599: adds the paid-clubs and payments change since the base;
 *  - 1600+: adds what is still needed to reach Distinguished, and Education /
 *    Training.
 * Base columns, Distinguished base and change (always 0 and equal to the
 * count, lesson 57) and CGD are one click away in Columns.
 */

import {
  BREAKPOINT_TIERS,
  TIER_BUDGET_PX,
  type BreakpointTier,
} from './clubsColumnMeta'

export { BREAKPOINT_TIERS, TIER_BUDGET_PX, type BreakpointTier }

export type RegionRankingsColumnId =
  | 'district'
  | 'rank'
  | 'trend'
  | 'worldRank'
  | 'score'
  | 'paidBase'
  | 'paidClubs'
  | 'paidDelta'
  | 'paymentsBase'
  | 'payments'
  | 'paymentsDelta'
  | 'distBase'
  | 'distinguished'
  | 'distDelta'
  | 'toPaid'
  | 'toPayments'
  | 'toDist'
  | 'education'
  | 'cgd'
  | 'tier'

export type RegionRankingsChooserGroup =
  'ranking' | 'paid' | 'payments' | 'distinguished' | 'needed' | 'awards'

/** Groups as the Columns menu lists them, in order. */
export const REGION_RANKINGS_CHOOSER_GROUPS: readonly {
  id: RegionRankingsChooserGroup
  label: string
}[] = [
  { id: 'ranking', label: 'Ranking' },
  { id: 'paid', label: 'Paid clubs' },
  { id: 'payments', label: 'Membership payments' },
  { id: 'distinguished', label: 'Distinguished clubs' },
  { id: 'needed', label: 'Still needed for Distinguished' },
  { id: 'awards', label: 'Officer awards' },
]

export interface RegionRankingsColumnMeta {
  group: RegionRankingsChooserGroup
  /** Header text and Columns-menu name. */
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
export const REGION_DISTRICT_MIN_SIZE = 180

/** Table order. */
export const REGION_RANKINGS_COLUMN_IDS: readonly RegionRankingsColumnId[] = [
  'district',
  'rank',
  'trend',
  'worldRank',
  'score',
  'paidBase',
  'paidClubs',
  'paidDelta',
  'paymentsBase',
  'payments',
  'paymentsDelta',
  'distBase',
  'distinguished',
  'distDelta',
  'toPaid',
  'toPayments',
  'toDist',
  'education',
  'cgd',
  'tier',
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

const OFF: Record<BreakpointTier, boolean> = {
  tablet: false,
  laptop: false,
  desktop: false,
  wide: false,
}

export const regionRankingsColumnMeta: Readonly<
  Record<RegionRankingsColumnId, RegionRankingsColumnMeta>
> = {
  district: {
    group: 'ranking',
    label: 'District',
    hint: 'The district, with a link to its page',
    size: REGION_DISTRICT_MIN_SIZE,
    defaultVisible: 'always',
  },
  rank: {
    group: 'ranking',
    label: 'Region rank',
    hint: 'Rank within this region by Score; tied districts share a rank',
    size: 96,
    defaultVisible: 'always',
  },
  trend: {
    group: 'ranking',
    label: 'Trend',
    hint: 'Membership this program year',
    size: 88,
    defaultVisible: from('laptop'),
  },
  worldRank: {
    group: 'ranking',
    label: 'World rank',
    hint: 'Rank among all districts worldwide',
    size: 88,
    defaultVisible: from('laptop'),
  },
  score: {
    group: 'ranking',
    label: 'Score',
    hint: 'Borda-count composite of the three rankings',
    size: 80,
    defaultVisible: 'always',
  },
  paidBase: {
    group: 'paid',
    label: 'Paid clubs base',
    hint: 'Paid clubs at the start of the program year',
    size: 80,
    defaultVisible: OFF,
  },
  paidClubs: {
    group: 'paid',
    label: 'Paid clubs',
    hint: 'Clubs that met renewal obligations now',
    size: 80,
    defaultVisible: from('tablet'),
  },
  paidDelta: {
    group: 'paid',
    label: 'Paid clubs change',
    hint: 'Net club growth since the base',
    size: 80,
    defaultVisible: from('desktop'),
  },
  paymentsBase: {
    group: 'payments',
    label: 'Payments base',
    hint: 'Membership payments at the start of the program year',
    size: 88,
    defaultVisible: OFF,
  },
  payments: {
    group: 'payments',
    label: 'Payments',
    hint: 'Year-to-date membership payments',
    size: 88,
    defaultVisible: from('tablet'),
  },
  paymentsDelta: {
    group: 'payments',
    label: 'Payments change',
    hint: 'Payments now minus the base',
    size: 88,
    defaultVisible: from('desktop'),
  },
  distBase: {
    group: 'distinguished',
    label: 'Distinguished base',
    hint: 'Always 0: Distinguished clubs restart every July 1',
    size: 112,
    defaultVisible: OFF,
  },
  distinguished: {
    group: 'distinguished',
    label: 'Distinguished',
    hint: 'Clubs at Distinguished or higher this program year',
    size: 112,
    defaultVisible: from('tablet'),
  },
  distDelta: {
    group: 'distinguished',
    label: 'Distinguished change',
    hint: 'Change since the base; equals the count, as the base is 0',
    size: 112,
    defaultVisible: OFF,
  },
  toPaid: {
    group: 'needed',
    label: 'Paid clubs needed for minimum Distinguished',
    hint: 'Paid clubs still needed for the minimum Distinguished tier',
    size: 88,
    defaultVisible: from('wide'),
  },
  toPayments: {
    group: 'needed',
    label: 'Payments needed for minimum Distinguished',
    hint: 'Payments still needed for the minimum Distinguished tier',
    size: 96,
    defaultVisible: from('wide'),
  },
  toDist: {
    group: 'needed',
    label: 'Distinguished clubs needed for minimum tier',
    hint: 'Distinguished clubs still needed for the minimum tier',
    size: 112,
    defaultVisible: from('wide'),
  },
  education: {
    group: 'awards',
    label: 'Education / Training',
    hint: 'Education and training officer award',
    size: 104,
    defaultVisible: from('wide'),
  },
  cgd: {
    group: 'awards',
    label: 'Club Growth Director (CGD)',
    hint: 'Club Growth Director officer award',
    size: 80,
    defaultVisible: OFF,
  },
  tier: {
    group: 'ranking',
    label: 'Tier',
    hint: 'Current Distinguished District tier',
    size: 120,
    defaultVisible: from('laptop'),
  },
}

/** Columns the user cannot switch off. */
export const ALWAYS_SHOWN_REGION_RANKINGS_IDS: readonly RegionRankingsColumnId[] =
  REGION_RANKINGS_COLUMN_IDS.filter(
    id => regionRankingsColumnMeta[id].defaultVisible === 'always'
  )

/** The default visibility of every column at a tier. */
export const regionRankingsTierDefaults = (
  tier: BreakpointTier
): Record<string, boolean> => {
  const out: Record<string, boolean> = {}
  for (const id of REGION_RANKINGS_COLUMN_IDS) {
    const d = regionRankingsColumnMeta[id].defaultVisible
    out[id] = d === 'always' ? true : d[tier]
  }
  return out
}
