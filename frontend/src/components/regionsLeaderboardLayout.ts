/**
 * Column widths and which columns show for the regions leaderboard (#2702).
 *
 * The leaderboard has no Columns menu, so its defaults must fit the width
 * (spec test 10, #2334): a pure function of the tier and the table's shape, so
 * "fits" is a sum against the budget, not a layout guess.
 */

import {
  CLASSIC_SCROLLBAR_PX,
  TIER_BUDGET_PX,
  type BreakpointTier,
} from './clubsColumnMeta'

export { CLASSIC_SCROLLBAR_PX, TIER_BUDGET_PX, type BreakpointTier }

/** The leaderboard's width per tier with a classic scrollbar showing. It has
 *  no Columns menu to recover from an overflow, so it budgets for Windows at
 *  every tier; the desktop budget already has the scrollbar off.
 *  Checked by regionsLeaderboardLayout.test.ts and the classic-scrollbar
 *  smoke (regions-classic-scrollbar.smoke.ts). */
export const LEADERBOARD_BUDGET_PX: Readonly<Record<BreakpointTier, number>> = {
  tablet: TIER_BUDGET_PX.tablet - CLASSIC_SCROLLBAR_PX,
  laptop: TIER_BUDGET_PX.laptop - CLASSIC_SCROLLBAR_PX,
  desktop: TIER_BUDGET_PX.desktop,
  wide: TIER_BUDGET_PX.wide - CLASSIC_SCROLLBAR_PX,
}

/** Fixed widths in px (8px padding per side included); Region takes the rest
 *  but is counted at its size here. */
export const LEADERBOARD_SIZES: Readonly<Record<string, number>> = {
  // The widest region cell ("Region 14" chip, nowrap "leader:" line) is
  // 108px with padding (Chromium, Source Sans 3); the smoke named below
  // checks it.
  region: 156,
  trend: 80,
  districts: 80,
  // The header wraps to "Paid / clubs"; "clubs", the 4px gap and the 8px
  // sort icon need about 44px inside the sort button's 8px padding.
  // regions-classic-scrollbar.smoke.ts fails if header text or an icon
  // leaves the button's content box, or cell text leaves the cell's.
  paidClubs: 60,
  payments: 88,
  distinguished: 120,
  score: 64,
  r1Dcp: 88,
  r1AllSeven: 88,
  r2Dcp: 88,
  r2AllSeven: 88,
  r1: 112,
  r2: 112,
}

/** The 8px a side of cell padding that each size includes. */
export const CELL_PADDING_PX = 16

/** "+99 qualifying today" at the table's 12px, measured in Chromium with
 *  Source Sans 3 (103.1px). The Distinguished column holds it on one line;
 *  a wider count wraps "today" (regionsLeaderboardLayout.test.ts). */
export const QUALIFYING_TODAY_LINE_PX = 104

/** Sizes at a tier. At the tablet tier a round's one column ("Round 2
 *  training, opens Nov 1") is as narrow as a 4+ column; its header wraps. */
export const leaderboardSizes = (
  tier: BreakpointTier
): Readonly<Record<string, number>> =>
  tier === 'tablet'
    ? { ...LEADERBOARD_SIZES, r1: 88, r2: 88 }
    : LEADERBOARD_SIZES

export interface LeaderboardShape {
  tier: BreakpointTier
  showTrend: boolean
  showTraining: boolean
  /** Per round: split into 4+ and All 7 (true) or one column (false). */
  expanded: readonly [boolean, boolean]
}

/**
 * Whether the Trend column shows at a tier. With the training columns the
 * table needs the room below 1280 (four 14px round columns, #2334), and the
 * leaderboard has no Columns menu to give a column back, so Trend yields.
 */
export const leaderboardShowsTrend = (
  tier: BreakpointTier,
  hasTrends: boolean,
  showTraining: boolean
): boolean =>
  hasTrends && !(showTraining && (tier === 'tablet' || tier === 'laptop'))

/**
 * At the tablet tier the training columns leave no room for everything
 * (920px against 665 with a classic scrollbar), so Districts and each
 * round's All 7 column yield.
 * Paid clubs, Payments and Distinguished stay: Score ranks all three. 4+ is
 * DCP goal 9, and each figure links to the Training page, which has All 7.
 * Checked per tier and shape by regionsLeaderboardLayout.test.ts.
 */
const tabletCompact = (shape: LeaderboardShape): boolean =>
  shape.tier === 'tablet' && shape.showTraining

/** Column ids in table order. */
export const leaderboardColumnIds = (shape: LeaderboardShape): string[] => {
  const compact = tabletCompact(shape)
  return [
    'region',
    ...(shape.showTrend ? ['trend'] : []),
    ...(compact ? [] : ['districts']),
    'paidClubs',
    'payments',
    'distinguished',
    'score',
    ...(shape.showTraining
      ? ([1, 2] as const).flatMap(round =>
          shape.expanded[round - 1]
            ? compact
              ? [`r${round}Dcp`]
              : [`r${round}Dcp`, `r${round}AllSeven`]
            : [`r${round}`]
        )
      : []),
  ]
}

export const leaderboardWidth = (
  ids: readonly string[],
  tier: BreakpointTier
): number => {
  const sizes = leaderboardSizes(tier)
  return ids.reduce((sum, id) => sum + (sizes[id] ?? 0), 0)
}
