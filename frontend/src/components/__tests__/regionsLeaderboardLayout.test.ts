/**
 * The regions leaderboard has no Columns menu, so its default columns must fit
 * each width budget (spec test 10; #2334 fixed exactly this at 1024). A sum of
 * sizes against the budget, as the rankings table's meta test does.
 */
import { describe, it, expect } from 'vitest'
import {
  TIER_BUDGET_PX,
  leaderboardColumnIds,
  leaderboardShowsTrend,
  leaderboardWidth,
  type BreakpointTier,
} from '../regionsLeaderboardLayout'

const widest = (tier: BreakpointTier) =>
  leaderboardWidth(
    leaderboardColumnIds({
      showTrend: leaderboardShowsTrend(tier, true, true),
      showTraining: true,
      expanded: [true, true],
    })
  )

describe('regions leaderboard layout', () => {
  it.each(['laptop', 'desktop', 'wide'] as const)(
    'fits %s with both training rounds expanded',
    tier => {
      expect(widest(tier), tier).toBeLessThanOrEqual(TIER_BUDGET_PX[tier])
    }
  )

  it('fits the narrowest width without the training columns', () => {
    const ids = leaderboardColumnIds({
      showTrend: leaderboardShowsTrend('tablet', true, false),
      showTraining: false,
      expanded: [false, false],
    })
    expect(leaderboardWidth(ids)).toBeLessThanOrEqual(TIER_BUDGET_PX.tablet)
  })

  it('keeps Trend where it fits', () => {
    expect(leaderboardShowsTrend('desktop', true, true)).toBe(true)
    expect(leaderboardShowsTrend('tablet', true, false)).toBe(true)
  })
})
