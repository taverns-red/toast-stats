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
  region: 176,
  trend: 80,
  districts: 88,
  paidClubs: 80,
  payments: 88,
  distinguished: 112,
  score: 72,
  r1Dcp: 96,
  r1AllSeven: 96,
  r2Dcp: 96,
  r2AllSeven: 96,
  r1: 128,
  r2: 128,
}

export interface LeaderboardShape {
  showTrend: boolean
  showTraining: boolean
  /** Per round: split into 4+ and All 7 (true) or one column (false). */
  expanded: readonly [boolean, boolean]
}

/** Whether the Trend column shows at a tier. */
export const leaderboardShowsTrend = (
  _tier: BreakpointTier,
  hasTrends: boolean,
  _showTraining: boolean
): boolean => hasTrends

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
