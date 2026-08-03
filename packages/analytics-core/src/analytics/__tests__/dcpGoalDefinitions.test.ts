/**
 * Unit tests for the shared DCP goal definitions (epic #1095, #1118).
 *
 * The definitions are the single source of truth for the 10 DCP goals.
 * Boundary cases per goal beat properties here (testing.md §7.3): the
 * official thresholds are a small fixed table.
 */

import { describe, it, expect } from 'vitest'
import type { ScrapedRecord } from '@taverns-red/shared-contracts'
import {
  DCP_GOAL_DEFINITIONS,
  hasDcpGoalColumns,
  missingDcpGoalHeaders,
  readDcpGoalColumn,
  isDcpGoalAchieved,
  computeDcpGoalsAchieved,
} from '../dcpGoalDefinitions.js'

function goal(n: number) {
  const def = DCP_GOAL_DEFINITIONS.find(d => d.goal === n)
  if (!def) throw new Error(`missing goal ${n}`)
  return def
}

describe('DCP_GOAL_DEFINITIONS', () => {
  it('defines exactly goals 1-10', () => {
    expect(DCP_GOAL_DEFINITIONS.map(d => d.goal)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ])
  })

  /**
   * #1399: TI's column is a single combined count with no split between a
   * Level 2 award and an Online Meeting Mastery completion, so the label is
   * the only place the distinction can be communicated. "14 Level 2 awards"
   * would otherwise be read as 14 actual Level 2s.
   */
  describe('goals 2-3 name the Online Meeting Mastery route (#1399)', () => {
    for (const goalNumber of [2, 3]) {
      it(`goal ${goalNumber}'s name and column label say so`, () => {
        const definition = goal(goalNumber)
        expect(definition.name).toMatch(/online meeting mastery/i)
        for (const requirement of definition.requirements) {
          for (const column of requirement.anyOf) {
            expect(column.label).toMatch(/online meeting mastery/i)
          }
        }
      })
    }
  })

  describe('official thresholds at the boundary', () => {
    const CASES: Array<{
      goalNumber: number
      column: string
      threshold: number
    }> = [
      { goalNumber: 1, column: 'Level 1s', threshold: 4 },
      { goalNumber: 2, column: 'Level 2s', threshold: 2 },
      { goalNumber: 3, column: 'Add. Level 2s', threshold: 2 },
      { goalNumber: 4, column: 'Level 3s', threshold: 2 },
      {
        goalNumber: 5,
        column: 'Level 4s, Path Completions, or DTM Awards',
        threshold: 1,
      },
      {
        goalNumber: 6,
        column: 'Add. Level 4s, Path Completions, or DTM award',
        threshold: 1,
      },
      { goalNumber: 7, column: 'New Members', threshold: 4 },
      { goalNumber: 8, column: 'Add. New Members', threshold: 4 },
    ]

    for (const { goalNumber, column, threshold } of CASES) {
      it(`goal ${goalNumber}: '${column}' >= ${threshold}`, () => {
        expect(
          isDcpGoalAchieved({ [column]: String(threshold) }, goal(goalNumber))
        ).toBe(true)
        expect(
          isDcpGoalAchieved(
            { [column]: String(threshold - 1) },
            goal(goalNumber)
          )
        ).toBe(false)
      })
    }
  })

  describe('goal 9 — both training rounds required', () => {
    it('achieved with 4+ trained in both rounds', () => {
      expect(
        isDcpGoalAchieved(
          { 'Off. Trained Round 1': '4', 'Off. Trained Round 2': '5' },
          goal(9)
        )
      ).toBe(true)
    })

    it('not achieved when either round is below 4', () => {
      expect(
        isDcpGoalAchieved(
          { 'Off. Trained Round 1': '4', 'Off. Trained Round 2': '3' },
          goal(9)
        )
      ).toBe(false)
      expect(
        isDcpGoalAchieved(
          { 'Off. Trained Round 1': '3', 'Off. Trained Round 2': '4' },
          goal(9)
        )
      ).toBe(false)
    })
  })

  describe('goal 10 — officer list + (Oct OR Apr dues), §10.2', () => {
    it('achieved with Oct-only dues + officer list', () => {
      expect(
        isDcpGoalAchieved(
          { 'Mem. dues on time Oct': '1', 'Off. List On Time': '1' },
          goal(10)
        )
      ).toBe(true)
    })

    it('achieved with Apr-only dues + officer list', () => {
      expect(
        isDcpGoalAchieved(
          { 'Mem. dues on time Apr': '1', 'Off. List On Time': '1' },
          goal(10)
        )
      ).toBe(true)
    })

    it('not achieved without the officer list', () => {
      expect(
        isDcpGoalAchieved(
          { 'Mem. dues on time Oct': '1', 'Mem. dues on time Apr': '1' },
          goal(10)
        )
      ).toBe(false)
    })

    it('not achieved with the officer list but no dues', () => {
      expect(isDcpGoalAchieved({ 'Off. List On Time': '1' }, goal(10))).toBe(
        false
      )
    })
  })

  describe('header aliases', () => {
    it('falls back to historical aliases in order', () => {
      expect(isDcpGoalAchieved({ 'Add Level 2s': '2' }, goal(3))).toBe(true)
      expect(isDcpGoalAchieved({ 'Level 4s': '1' }, goal(5))).toBe(true)
      expect(isDcpGoalAchieved({ 'Add Level 4': '1' }, goal(6))).toBe(true)
      expect(isDcpGoalAchieved({ 'Add New Members': '4' }, goal(8))).toBe(true)
    })

    it('prefers the first present alias', () => {
      const record: ScrapedRecord = {
        'Level 4s, Path Completions, or DTM Awards': '0',
        'Level 4s': '7',
      }
      const column = goal(5).requirements[0]!.anyOf[0]!
      expect(readDcpGoalColumn(record, column)).toBe(0)
    })

    /**
     * PY 2026-27 renamed goals 2 and 3 when TI made Online Meeting Mastery
     * ("EOM") completions an alternative route to them (#1399). Historical
     * snapshots carry the old names, new ones the new — both must resolve.
     */
    describe('goals 2-3: "or EOM" rename (#1399)', () => {
      it('reads the PY 2026-27 headers', () => {
        expect(isDcpGoalAchieved({ 'Level 2s or EOM': '2' }, goal(2))).toBe(true)
        expect(isDcpGoalAchieved({ 'Level 2s or EOM': '1' }, goal(2))).toBe(
          false
        )
        expect(
          isDcpGoalAchieved({ 'Add. Level 2s or EOM': '2' }, goal(3))
        ).toBe(true)
        expect(
          isDcpGoalAchieved({ 'Add. Level 2s or EOM': '1' }, goal(3))
        ).toBe(false)
      })

      it('still reads the historical headers', () => {
        expect(isDcpGoalAchieved({ 'Level 2s': '2' }, goal(2))).toBe(true)
        expect(isDcpGoalAchieved({ 'Add. Level 2s': '2' }, goal(3))).toBe(true)
      })

      it('does not double-count a record carrying both names (#486 M1)', () => {
        const record: ScrapedRecord = {
          'Level 2s or EOM': '3',
          'Level 2s': '9',
          'Add. Level 2s or EOM': '2',
          'Add. Level 2s': '5',
        }
        expect(readDcpGoalColumn(record, goal(2).requirements[0]!.anyOf[0]!))
          // first match wins — never 3 + 9
          .toBe(3)
        expect(
          readDcpGoalColumn(record, goal(3).requirements[0]!.anyOf[0]!)
        ).toBe(2)
      })
    })
  })

  describe('readDcpGoalColumn value handling', () => {
    const column = goal(1).requirements[0]!.anyOf[0]!

    it('accepts number-typed values', () => {
      expect(readDcpGoalColumn({ 'Level 1s': 5 }, column)).toBe(5)
    })

    it('returns 0 for missing, empty, or unparseable values', () => {
      expect(readDcpGoalColumn({}, column)).toBe(0)
      expect(readDcpGoalColumn({ 'Level 1s': '' }, column)).toBe(0)
      expect(readDcpGoalColumn({ 'Level 1s': 'N/A' }, column)).toBe(0)
      expect(readDcpGoalColumn({ 'Level 1s': null }, column)).toBe(0)
    })
  })

  /**
   * The sentinel spans ALL ten goals, not goal 1 alone (#1399).
   *
   * The old sentinel keyed on goal 1's header. When TI renamed goals 2-3
   * for PY 2026-27, 'Level 1s' was untouched, so the detector said "we have
   * goal data", consumers trusted it, and the pipeline published confident
   * zeros for two goals instead of degrading to the documented fallback.
   * A rename we do not know about must now fail the check.
   */
  describe('hasDcpGoalColumns', () => {
    const complete = (overrides: ScrapedRecord = {}): ScrapedRecord => ({
      'Level 1s': '0',
      'Level 2s or EOM': '0',
      'Add. Level 2s or EOM': '0',
      'Level 3s': '0',
      'Level 4s, Path Completions, or DTM Awards': '0',
      'Add. Level 4s, Path Completions, or DTM award': '0',
      'New Members': '0',
      'Add. New Members': '0',
      'Off. Trained Round 1': '0',
      'Off. Trained Round 2': '0',
      'Mem. dues on time Oct': '0',
      'Mem. dues on time Apr': '0',
      'Off. List On Time': '0',
      ...overrides,
    })

    it('detects records that carry every per-goal column', () => {
      expect(hasDcpGoalColumns(complete())).toBe(true)
      expect(hasDcpGoalColumns(complete({ 'Level 1s': 3 }))).toBe(true)
    })

    it('accepts the historical headers too', () => {
      const historical = complete()
      delete historical['Level 2s or EOM']
      delete historical['Add. Level 2s or EOM']
      historical['Level 2s'] = '0'
      historical['Add. Level 2s'] = '0'
      expect(hasDcpGoalColumns(historical)).toBe(true)
    })

    it('accepts goal 10 with only one of the two dues columns (§10.2)', () => {
      const octOnly = complete()
      delete octOnly['Mem. dues on time Apr']
      expect(hasDcpGoalColumns(octOnly)).toBe(true)
    })

    it('rejects records without them (legacy data falls back)', () => {
      expect(hasDcpGoalColumns({})).toBe(false)
      expect(hasDcpGoalColumns({ 'Level 1s': '' })).toBe(false)
      expect(hasDcpGoalColumns({ 'Level 1s': null })).toBe(false)
      expect(hasDcpGoalColumns({ 'Goals Met': '5' })).toBe(false)
      expect(hasDcpGoalColumns({ 'Level 1s': '4' })).toBe(false)
    })

    it('rejects a record whose non-goal-1 headers were renamed (#1399)', () => {
      const renamed = complete()
      delete renamed['Level 2s or EOM']
      renamed['Level 2s or Whatever TI Adds Next'] = '2'
      expect(hasDcpGoalColumns(renamed)).toBe(false)
    })

    it('names the goals whose headers it could not resolve', () => {
      const renamed = complete()
      delete renamed['Level 2s or EOM']
      delete renamed['Off. Trained Round 2']
      expect(missingDcpGoalHeaders(renamed)).toEqual([2, 9])
      expect(missingDcpGoalHeaders(complete())).toEqual([])
    })
  })

  describe('computeDcpGoalsAchieved', () => {
    it('returns one entry per goal, in goal order', () => {
      const record: ScrapedRecord = {
        'Level 1s': '4',
        'Mem. dues on time Apr': '1',
        'Off. List On Time': '1',
      }
      const achieved = computeDcpGoalsAchieved(record)
      expect(achieved).toHaveLength(10)
      expect(achieved[0]).toBe(true)
      expect(achieved[9]).toBe(true)
      expect(achieved.slice(1, 9)).toEqual(Array(8).fill(false))
    })
  })
})
