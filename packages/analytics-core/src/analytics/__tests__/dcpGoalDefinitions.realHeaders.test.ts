/**
 * Captured-header tests for the DCP goal columns (#1399).
 *
 * TI added Online Meeting Mastery ("EOM") completions as an alternative way
 * to satisfy DCP goals 2 and 3 for PY 2026-27 and renamed the two columns
 * with it: `Level 2s` → `Level 2s or EOM`, `Add. Level 2s` →
 * `Add. Level 2s or EOM`. Every other header is unchanged.
 *
 * Goal columns resolve by exact key lookup, so the rename silently produced
 * 0 for goals 2 and 3 across every PY 2026-27 snapshot.
 *
 * Synthetic fixtures validate the code; only a captured real pair validates
 * the policy (Lesson 154) — so both headers are pinned here against the real
 * District 61 club-performance exports:
 *
 *   - raw-csv/2026-06-09 → PY 2025-26 header (`Level 2s`)
 *   - raw-csv/2026-08-01 → PY 2026-27 header (`Level 2s or EOM`)
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ScrapedRecord } from '@taverns-red/shared-contracts'
import {
  DCP_GOAL_DEFINITIONS,
  hasDcpGoalColumns,
  readDcpGoalColumn,
  type DcpGoalColumn,
} from '../dcpGoalDefinitions.js'

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'transformation',
  '__tests__',
  'fixtures'
)

/**
 * Load a captured club-performance export as records. TI appends a two-cell
 * "Month of …, As of …" footer row to the CSV; the collector's parser drops
 * short rows, so drop it here too rather than emit a junk record.
 */
const loadRecords = (capture: string): ScrapedRecord[] => {
  const rows = JSON.parse(
    readFileSync(join(FIXTURE_DIR, capture, 'club-performance.json'), 'utf-8')
  ) as string[][]
  const header = rows[0]!
  return rows
    .slice(1)
    .filter(row => row.length === header.length)
    .map(
      row =>
        Object.fromEntries(
          header.map((key, index) => [key, row[index] ?? ''])
        ) as ScrapedRecord
    )
}

const goalColumn = (goalNumber: number): DcpGoalColumn =>
  DCP_GOAL_DEFINITIONS.find(d => d.goal === goalNumber)!.requirements[0]!
    .anyOf[0]!

const tally = (records: ScrapedRecord[], column: DcpGoalColumn) => {
  const values = records.map(record => readDcpGoalColumn(record, column))
  return {
    awards: values.reduce((sum, value) => sum + value, 0),
    clubs: values.filter(value => value > 0).length,
  }
}

describe('DCP goal columns against captured District 61 exports (#1399)', () => {
  describe('PY 2026-27 header (raw-csv/2026-08-01, "… or EOM")', () => {
    const records = loadRecords('d61-2026-08-01')

    it('loads the captured export', () => {
      expect(records).toHaveLength(161)
      expect(records[0]).toHaveProperty('Level 2s or EOM')
      expect(records[0]).toHaveProperty('Add. Level 2s or EOM')
    })

    it('reads goal 2 from "Level 2s or EOM" — 14 awards across 13 clubs', () => {
      expect(tally(records, goalColumn(2))).toEqual({ awards: 14, clubs: 13 })
    })

    it('recognises the goal 3 header "Add. Level 2s or EOM"', () => {
      const column = goalColumn(3)
      for (const record of records) {
        expect(
          column.aliases.some(alias => alias in record),
          `no known goal 3 alias in ${JSON.stringify(Object.keys(record))}`
        ).toBe(true)
      }
      // Legitimately zero this early in the program year — the point is that
      // the column resolves at all, not that anyone has earned one yet.
      expect(tally(records, column)).toEqual({ awards: 0, clubs: 0 })
    })

    it('detects that the record carries per-goal columns', () => {
      expect(hasDcpGoalColumns(records[0]!)).toBe(true)
    })
  })

  describe('PY 2025-26 header (raw-csv/2026-06-09, "Level 2s")', () => {
    const records = loadRecords('d61-2026-06-09')

    it('still reads goal 2 from the historical header', () => {
      expect(tally(records, goalColumn(2))).toEqual({ awards: 161, clubs: 102 })
    })

    it('still reads goal 3 from the historical header', () => {
      expect(tally(records, goalColumn(3))).toEqual({ awards: 97, clubs: 37 })
    })

    it('detects that the record carries per-goal columns', () => {
      expect(hasDcpGoalColumns(records[0]!)).toBe(true)
    })
  })
})
