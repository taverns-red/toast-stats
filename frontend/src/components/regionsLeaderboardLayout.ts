/**
 * Column widths and which columns show for the regions leaderboard (#2702).
 *
 * The leaderboard has no Columns menu, so its defaults must fit the width
 * (spec test 10, #2334): a pure function of the tier and the table's shape, so
 * "fits" is a sum against the budget, not a layout guess.
 */

import { TIER_BUDGET_PX, type BreakpointTier } from './clubsColumnMeta'

export { TIER_BUDGET_PX, type BreakpointTier }

/** Fixed widths in px (8px padding per side included); Region takes the rest
 *  but is counted at its size here. */
export const LEADERBOARD_SIZES: Readonly<Record<string, number>> = {
  region: 160,
  trend: 80,
  districts: 80,
  paidClubs: 72,
  payments: 88,
  distinguished: 112,
  score: 64,
  r1Dcp: 88,
  r1AllSeven: 88,
  r2Dcp: 88,
  r2AllSeven: 88,
  r1: 112,
  r2: 112,
}

export interface LeaderboardShape {
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

/** Column ids in table order. */
export const leaderboardColumnIds = (shape: LeaderboardShape): string[] => [
  'region',
  ...(shape.showTrend ? ['trend'] : []),
  'districts',
  'paidClubs',
  'payments',
  'distinguished',
  'score',
  ...(shape.showTraining
    ? ([1, 2] as const).flatMap(round =>
        shape.expanded[round - 1]
          ? [`r${round}Dcp`, `r${round}AllSeven`]
          : [`r${round}`]
      )
    : []),
]

export const leaderboardWidth = (ids: readonly string[]): number =>
  ids.reduce((sum, id) => sum + (LEADERBOARD_SIZES[id] ?? 0), 0)
