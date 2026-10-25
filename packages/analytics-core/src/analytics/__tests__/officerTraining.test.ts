/**
 * Officer-training roll-up (#2296).
 *
 * The distribution is read from the same goal-9 columns the per-club DCP
 * panel reads (dcpGoalDefinitions), so the roll-up and the panel cannot
 * disagree. Pinned against a captured D61 export (2026-10-11), whose Round 1
 * spread is the one in the issue: 0×19, 1×5, 2×3, 3×14, 4×43, 5×25, 6×27,
 * 7×25.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ScrapedRecord } from '@taverns-red/shared-contracts'
import { summarizeOfficerTraining } from '../officerTraining.js'
import {
  DCP_GOAL_DEFINITIONS,
  isDcpGoalAchieved,
} from '../dcpGoalDefinitions.js'

const loadCapture = (): ScrapedRecord[] => {
  const rows = JSON.parse(
    readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        'fixtures',
        'd61-2026-10-11-club-performance.json'
      ),
      'utf-8'
    )
  ) as string[][]
  const header = rows[0]!
  // TI's two-cell "Month of …, As of …" footer is dropped, as the collector does.
  return rows
    .slice(1)
    .filter(row => row.length === header.length)
    .map(
      row =>
        Object.fromEntries(
          header.map((key, i) => [key, row[i] ?? ''])
        ) as ScrapedRecord
    )
}

const record = (round1: unknown, round2: unknown): ScrapedRecord =>
  ({
    'Club Number': '1',
    'Club Name': 'A',
    'Off. Trained Round 1': round1,
    'Off. Trained Round 2': round2,
  }) as ScrapedRecord

describe('summarizeOfficerTraining (#2296)', () => {
  it('reproduces the captured D61 2026-10-11 Round 1 spread', () => {
    const summary = summarizeOfficerTraining(loadCapture())
    expect(summary).toEqual({
      round1: [19, 5, 3, 14, 43, 25, 27, 25],
      round2: [161, 0, 0, 0, 0, 0, 0, 0],
    })
  })

  it('agrees with goal 9 per club: clubs at 4+ in BOTH rounds = clubs achieving goal 9', () => {
    const records = loadCapture()
    const goal9 = DCP_GOAL_DEFINITIONS.find(d => d.goal === 9)!
    const achieved = records.filter(r => isDcpGoalAchieved(r, goal9)).length
    // Round 2 is all zero on this date, so no club has goal 9 yet...
    expect(achieved).toBe(0)
    // ...and the Round 1 roll-up at the goal-9 threshold counts the clubs
    // whose Round 1 requirement alone is met.
    const summary = summarizeOfficerTraining(records)!
    const round1Required = goal9.requirements[0]!.anyOf[0]!.required
    const atThreshold = summary.round1
      .slice(round1Required)
      .reduce((a, b) => a + b, 0)
    expect(atThreshold).toBe(43 + 25 + 27 + 25)
  })

  it('counts numbers and numeric strings alike', () => {
    expect(summarizeOfficerTraining([record(4, '7'), record('0', 2)])).toEqual({
      round1: [1, 0, 0, 0, 1, 0, 0, 0],
      round2: [0, 0, 1, 0, 0, 0, 0, 1],
    })
  })

  it('clamps an out-of-range count into 0–7 rather than dropping the club', () => {
    expect(summarizeOfficerTraining([record('9', '-1')])).toEqual({
      round1: [0, 0, 0, 0, 0, 0, 0, 1],
      round2: [1, 0, 0, 0, 0, 0, 0, 0],
    })
  })

  it('is undefined when no record carries either column (not measured, not zeros)', () => {
    expect(
      summarizeOfficerTraining([
        { 'Club Number': '1', 'Club Name': 'A' } as ScrapedRecord,
      ])
    ).toBeUndefined()
    expect(summarizeOfficerTraining([])).toBeUndefined()
  })

  it('counts a club with a blank cell as 0 when the export carries the column', () => {
    expect(summarizeOfficerTraining([record('', '3')])).toEqual({
      round1: [1, 0, 0, 0, 0, 0, 0, 0],
      round2: [0, 0, 0, 1, 0, 0, 0, 0],
    })
  })
})
