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

const TIERS = ['tablet', 'laptop', 'desktop', 'wide'] as const

/* A round is one column before it has figures and two once it has, so each
   tier must fit every mix of the two. */
const SHAPES: ReadonlyArray<readonly [boolean, boolean]> = [
  [true, true],
  [true, false],
  [false, false],
]

const widthWithTraining = (
  tier: BreakpointTier,
  expanded: readonly [boolean, boolean]
) =>
  leaderboardWidth(
    leaderboardColumnIds({
      tier,
      showTrend: leaderboardShowsTrend(tier, true, true),
      showTraining: true,
      expanded,
    })
  )

describe('regions leaderboard layout', () => {
  it.each(TIERS.flatMap(tier => SHAPES.map(shape => [tier, shape] as const)))(
    'fits %s with the training columns (rounds expanded: %j)',
    (tier, shape) => {
      expect(widthWithTraining(tier, shape), tier).toBeLessThanOrEqual(
        TIER_BUDGET_PX[tier]
      )
    }
  )

  it('fits the narrowest width without the training columns', () => {
    const ids = leaderboardColumnIds({
      tier: 'tablet',
      showTrend: leaderboardShowsTrend('tablet', true, false),
      showTraining: false,
      expanded: [false, false],
    })
    expect(leaderboardWidth(ids)).toBeLessThanOrEqual(TIER_BUDGET_PX.tablet)
  })

  it('keeps every column at the tablet width when there is no training', () => {
    expect(
      leaderboardColumnIds({
        tier: 'tablet',
        showTrend: true,
        showTraining: false,
        expanded: [false, false],
      })
    ).toEqual([
      'region',
      'trend',
      'districts',
      'paidClubs',
      'payments',
      'distinguished',
      'score',
    ])
  })

  it('keeps Trend where it fits', () => {
    expect(leaderboardShowsTrend('desktop', true, true)).toBe(true)
    expect(leaderboardShowsTrend('tablet', true, false)).toBe(true)
  })
})
