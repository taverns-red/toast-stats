/**
 * District Club Growth Achievement predicate (#1474, epic #1473).
 *
 * TI's rule, verbatim from the announcement quoted in #1473:
 *   September 30 Milestones — Charter 3 or 5 new clubs
 *   March 31 Milestones     — Charter 3, 5, or 10 new clubs
 *
 * Everything else is an operator ruling recorded on #1473:
 *   A1 effective PY 2026-27 (gated like the club Smedley rung, #1406)
 *   A2 counts are cumulative from July 1 — March includes the September clubs
 *   A3 3/5/10 are tiers; a district holds the highest one reached
 *   A5 forward-only: an earlier program year is NOT-APPLICABLE, never "not earned"
 */
import { describe, it, expect } from 'vitest'
import {
  resolveClubGrowthAchievement,
  clubGrowthCheckpoints,
  CLUB_GROWTH_ACHIEVEMENT_FIRST_PROGRAM_YEAR,
  type ClubGrowthCheckpointState,
} from '../clubGrowthAchievement'

/** The Sep-30 state of an applicable result, or a hard failure. */
const september = (
  result: ReturnType<typeof resolveClubGrowthAchievement>
): ClubGrowthCheckpointState => {
  if (!result.applicable) throw new Error('expected an applicable result')
  return result.checkpoints[0]!
}

const march = (
  result: ReturnType<typeof resolveClubGrowthAchievement>
): ClubGrowthCheckpointState => {
  if (!result.applicable) throw new Error('expected an applicable result')
  return result.checkpoints[1]!
}

describe('resolveClubGrowthAchievement — program-year gate (A1/A5)', () => {
  it('is not applicable for 2025-2026 even with a milestone-sized count', () => {
    const result = resolveClubGrowthAchievement({
      programYear: '2025-2026',
      asOfDate: '2026-06-30',
      sep30Count: 7,
    })
    expect(result.applicable).toBe(false)
    expect(result.applicable === false && result.reason).toBe(
      'before-first-program-year'
    )
  })

  it.each(['2019-2020', '2022-2023', '2024-2025', '2025-2026'])(
    'is not applicable for PY %s (the achievement did not exist)',
    programYear => {
      expect(
        resolveClubGrowthAchievement({
          programYear,
          asOfDate: '2026-06-30',
          sep30Count: 12,
          mar31Count: 12,
        }).applicable
      ).toBe(false)
    }
  )

  it('is applicable from the first program year onward', () => {
    expect(CLUB_GROWTH_ACHIEVEMENT_FIRST_PROGRAM_YEAR).toBe('2026-2027')
    for (const programYear of ['2026-2027', '2027-2028', '2030-2031']) {
      expect(
        resolveClubGrowthAchievement({ programYear, asOfDate: '2099-06-30' })
          .applicable
      ).toBe(true)
    }
  })

  it('reports an unusable program year as its own reason, not "too early"', () => {
    for (const programYear of ['', 'this year', '2026', '2026-2028']) {
      const result = resolveClubGrowthAchievement({
        programYear,
        asOfDate: '2026-09-30',
      })
      expect(result.applicable).toBe(false)
      expect(result.applicable === false && result.reason).toBe(
        'unrecognised-program-year'
      )
    }
  })
})

describe('clubGrowthCheckpoints — the checkpoint calendar', () => {
  it('places Sep 30 in the start year and Mar 31 in the end year', () => {
    expect(clubGrowthCheckpoints('2026-2027')).toEqual([
      { id: 'september30', date: '2026-09-30', milestones: [3, 5] },
      { id: 'march31', date: '2027-03-31', milestones: [3, 5, 10] },
    ])
  })

  it('returns null for a program year it cannot place', () => {
    expect(clubGrowthCheckpoints('nonsense')).toBeNull()
  })

  it('is the same calendar the predicate reports', () => {
    const result = resolveClubGrowthAchievement({
      programYear: '2027-2028',
      asOfDate: '2027-08-01',
    })
    expect(result.applicable && result.checkpoints.map(c => c.date)).toEqual([
      '2027-09-30',
      '2028-03-31',
    ])
  })
})

describe('settled September 30 checkpoint — highest tier reached (A3)', () => {
  const settledSeptember = (sep30Count?: number) =>
    september(
      resolveClubGrowthAchievement({
        programYear: '2026-2027',
        asOfDate: '2026-10-31',
        sep30Count,
      })
    )

  it.each([
    [0, null],
    [2, null],
    [3, 3],
    [4, 3],
    [5, 5],
    [9, 5],
    [10, 5],
    [11, 5],
  ])('count %s settles at milestone %s', (count, milestone) => {
    const state = settledSeptember(count)
    expect(state.status).toBe('settled')
    expect(state.status === 'settled' && state.count).toBe(count)
    expect(state.status === 'settled' && state.milestoneReached).toBe(milestone)
  })

  it('never invents a 10-club September milestone (TI lists only 3 and 5)', () => {
    expect(settledSeptember(10).milestones).toEqual([3, 5])
  })

  it('an unknown count for a passed checkpoint is unknown, never zero', () => {
    const state = settledSeptember(undefined)
    expect(state.status).toBe('unknown')
    expect(state).not.toHaveProperty('count')
  })
})

describe('settled March 31 checkpoint — cumulative from July 1 (A2)', () => {
  const settledMarch = (mar31Count?: number) =>
    march(
      resolveClubGrowthAchievement({
        programYear: '2026-2027',
        asOfDate: '2027-04-30',
        sep30Count: 3,
        mar31Count,
      })
    )

  it.each([
    [2, null],
    [3, 3],
    [4, 3],
    [5, 5],
    [9, 5],
    [10, 10],
    [11, 10],
  ])('count %s settles at milestone %s', (count, milestone) => {
    const state = settledMarch(count)
    expect(state.status).toBe('settled')
    expect(state.status === 'settled' && state.milestoneReached).toBe(milestone)
  })

  it('does not subtract the September clubs — the March count is the running total', () => {
    // 3 chartered by Sep 30, 10 by Mar 31 → the March tier is 10, not 7.
    const state = settledMarch(10)
    expect(state.status === 'settled' && state.count).toBe(10)
    expect(state.status === 'settled' && state.milestoneReached).toBe(10)
  })

  it('an unknown March count is unknown even when September settled', () => {
    expect(settledMarch(undefined).status).toBe('unknown')
  })
})

describe('pending checkpoint — countdown to the same gate it settles on', () => {
  const pendingSeptember = (toDateCount?: number, asOfDate = '2026-09-10') =>
    september(
      resolveClubGrowthAchievement({
        programYear: '2026-2027',
        asOfDate,
        toDateCount,
      })
    )

  it('counts down to the next milestone', () => {
    const state = pendingSeptember(1)
    expect(state.status).toBe('pending')
    expect(state.status === 'pending' && state.count).toBe(1)
    expect(state.status === 'pending' && state.milestoneReached).toBeNull()
    expect(state.status === 'pending' && state.nextMilestone).toBe(3)
    expect(state.status === 'pending' && state.remaining).toBe(2)
  })

  it.each([
    [0, 3, 3],
    [2, 3, 1],
    [3, 5, 2],
    [4, 5, 1],
  ])('count %s → next milestone %s, %s more', (count, next, remaining) => {
    const state = pendingSeptember(count)
    expect(state.status === 'pending' && state.nextMilestone).toBe(next)
    expect(state.status === 'pending' && state.remaining).toBe(remaining)
  })

  it('clamps at the top tier: every milestone secured → 0 more, never negative', () => {
    const state = pendingSeptember(6)
    expect(state.status).toBe('pending')
    expect(state.status === 'pending' && state.milestoneReached).toBe(5)
    expect(state.status === 'pending' && state.nextMilestone).toBeNull()
    expect(state.status === 'pending' && state.remaining).toBe(0)
  })

  it('treats the deadline day itself as settled, the day before as pending', () => {
    expect(pendingSeptember(4, '2026-09-29').status).toBe('pending')
    expect(
      september(
        resolveClubGrowthAchievement({
          programYear: '2026-2027',
          asOfDate: '2026-09-30',
          sep30Count: 4,
        })
      ).status
    ).toBe('settled')
  })

  it('is unknown, not zero, when the live count is unavailable', () => {
    expect(pendingSeptember(undefined).status).toBe('unknown')
  })

  it('runs both checkpoints pending before September 30', () => {
    const result = resolveClubGrowthAchievement({
      programYear: '2026-2027',
      asOfDate: '2026-09-10',
      toDateCount: 3,
    })
    expect(result.applicable && result.checkpoints.map(c => c.status)).toEqual([
      'pending',
      'pending',
    ])
    // March is still counting the same running total (A2).
    const marchState = march(result)
    expect(marchState.status === 'pending' && marchState.nextMilestone).toBe(5)
    expect(marchState.status === 'pending' && marchState.remaining).toBe(2)
  })

  it('a settled September and a pending March coexist mid-year', () => {
    const result = resolveClubGrowthAchievement({
      programYear: '2026-2027',
      asOfDate: '2027-01-31',
      sep30Count: 5,
      toDateCount: 8,
    })
    expect(result.applicable && result.checkpoints.map(c => c.status)).toEqual([
      'settled',
      'pending',
    ])
    const marchState = march(result)
    expect(marchState.status === 'pending' && marchState.nextMilestone).toBe(10)
    expect(marchState.status === 'pending' && marchState.remaining).toBe(2)
  })

  it('does not use the live count to decide a checkpoint that already passed', () => {
    // The live total (9) is bigger than what stood on Sep 30 (2) — clubs kept
    // chartering. The settled verdict must come from the checkpoint's own
    // count, never from today's (#1473 comment: read the checkpoint snapshot).
    const state = september(
      resolveClubGrowthAchievement({
        programYear: '2026-2027',
        asOfDate: '2027-01-31',
        sep30Count: 2,
        toDateCount: 9,
      })
    )
    expect(state.status).toBe('settled')
    expect(state.status === 'settled' && state.count).toBe(2)
    expect(state.status === 'settled' && state.milestoneReached).toBeNull()
  })
})

describe('as-of date hygiene', () => {
  it('cannot place undated data in time — every checkpoint is unknown', () => {
    const result = resolveClubGrowthAchievement({
      programYear: '2026-2027',
      asOfDate: 'not-a-date',
      sep30Count: 5,
      toDateCount: 5,
    })
    expect(result.applicable && result.checkpoints.map(c => c.status)).toEqual([
      'unknown',
      'unknown',
    ])
  })

  it('tolerates a full ISO timestamp on the deadline day (no timezone flip)', () => {
    const state = september(
      resolveClubGrowthAchievement({
        programYear: '2026-2027',
        asOfDate: '2026-09-30T23:59:00Z',
        sep30Count: 3,
      })
    )
    expect(state.status).toBe('settled')
    expect(state.status === 'settled' && state.milestoneReached).toBe(3)
  })
})
