import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import { DCPGoalAnalysis } from '../DCPGoalAnalysis'

/* Provider-free unit-test render (#473): the panel is presentational. */

const goal = (goalNumber: number) => ({
  goalNumber,
  achievementCount: 13,
  achievementPercentage: 8,
})

describe('DCPGoalAnalysis goal names', () => {
  afterEach(() => cleanup())

  /**
   * #1399: for PY 2026-27 an Online Meeting Mastery completion satisfies DCP
   * goals 2 and 3, and TI reports it in the same combined column as a Level 2
   * award. The panel names each goal, so it must not describe those two as
   * Level 2 awards alone.
   */
  it('names the Online Meeting Mastery route on goals 2 and 3', () => {
    render(
      <DCPGoalAnalysis
        dcpGoalAnalysis={{
          mostCommonlyAchieved: [goal(2), goal(1)],
          leastCommonlyAchieved: [goal(3), goal(4)],
        }}
        isLoading={false}
      />
    )

    // Each goal renders in both the most- and least-achieved lists.
    expect(
      screen.getAllByText(
        /^Level 2 or Online Meeting Mastery awards \(2 required\)$/
      ).length
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByText(
        /^More Level 2 or Online Meeting Mastery awards \(2 required\)$/
      ).length
    ).toBeGreaterThan(0)
  })

  it('leaves the unaffected goal names alone', () => {
    render(
      <DCPGoalAnalysis
        dcpGoalAnalysis={{
          mostCommonlyAchieved: [goal(1)],
          leastCommonlyAchieved: [goal(4)],
        }}
        isLoading={false}
      />
    )

    expect(
      screen.getAllByText('Level 1 awards (4 required)').length
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByText('Level 3 awards (2 required)').length
    ).toBeGreaterThan(0)
  })
})
