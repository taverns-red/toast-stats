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

  describe('hasDcpGoalColumns', () => {
    it('detects records that carry the per-goal columns', () => {
      expect(hasDcpGoalColumns({ 'Level 1s': '0' })).toBe(true)
      expect(hasDcpGoalColumns({ 'Level 1s': 3 })).toBe(true)
    })

    it('rejects records without them (legacy data falls back)', () => {
      expect(hasDcpGoalColumns({})).toBe(false)
      expect(hasDcpGoalColumns({ 'Level 1s': '' })).toBe(false)
      expect(hasDcpGoalColumns({ 'Level 1s': null })).toBe(false)
      expect(hasDcpGoalColumns({ 'Goals Met': '5' })).toBe(false)
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
