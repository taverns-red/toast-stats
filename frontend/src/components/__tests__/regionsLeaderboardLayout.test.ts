/**
 * The regions leaderboard has no Columns menu, so its default columns must fit
 * each width budget (spec test 10; #2334 fixed exactly this at 1024). A sum of
 * sizes against the budget, as the rankings table's meta test does.
 */
import { describe, it, expect } from 'vitest'
import {
  CELL_PADDING_PX,
  CLASSIC_SCROLLBAR_PX,
  LEADERBOARD_BUDGET_PX,
  QUALIFYING_TODAY_LINE_PX,
  TIER_BUDGET_PX,
  leaderboardSizes,
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
    }),
    tier
  )

describe('regions leaderboard layout', () => {
  // A Windows visitor at 768 or 1024 has a classic scrollbar (#3266).
  it.each(['tablet', 'laptop'] as const)(
    'leaves room at %s for a classic scrollbar',
    tier => {
      expect(LEADERBOARD_BUDGET_PX[tier]).toBe(
        TIER_BUDGET_PX[tier] - CLASSIC_SCROLLBAR_PX
      )
    }
  )

  it.each(TIERS.flatMap(tier => SHAPES.map(shape => [tier, shape] as const)))(
    'fits %s with the training columns and a classic scrollbar (rounds expanded: %j)',
    (tier, shape) => {
      expect(widthWithTraining(tier, shape), tier).toBeLessThanOrEqual(
        LEADERBOARD_BUDGET_PX[tier]
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
    expect(leaderboardWidth(ids, 'tablet')).toBeLessThanOrEqual(
      LEADERBOARD_BUDGET_PX.tablet
    )
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

  // Score ranks paid clubs, payments and Distinguished, so a reader at any
  // width sees all three.
  it.each(TIERS)('keeps the three Score inputs at %s with training', tier => {
    const ids = leaderboardColumnIds({
      tier,
      showTrend: leaderboardShowsTrend(tier, true, true),
      showTraining: true,
      expanded: [true, false],
    })
    expect(ids).toEqual(
      expect.arrayContaining(['paidClubs', 'payments', 'distinguished'])
    )
  })

  // A wider column would overrun the tablet and laptop budgets above, so a
  // three-digit count wraps instead (#3264).
  it.each(TIERS)(
    'holds a two-digit "+N qualifying today" on one line at %s',
    tier => {
      expect(
        (leaderboardSizes(tier)['distinguished'] ?? 0) - CELL_PADDING_PX
      ).toBeGreaterThanOrEqual(QUALIFYING_TODAY_LINE_PX)
    }
  )

  it('keeps Trend where it fits', () => {
    expect(leaderboardShowsTrend('desktop', true, true)).toBe(true)
    expect(leaderboardShowsTrend('tablet', true, false)).toBe(true)
  })
})
