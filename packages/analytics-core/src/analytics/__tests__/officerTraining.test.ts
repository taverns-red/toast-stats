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
import {
  OFFICER_TRAINING_DCP_THRESHOLD,
  officersTrainedInRound,
  summarizeOfficerTraining,
} from '../officerTraining.js'
import {
  DCP_GOAL_DEFINITIONS,
  isDcpGoalAchieved,
  readDcpGoalColumn,
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

  describe('cross-check against goal 9 itself (the per-club DCP panel)', () => {
    const goal9 = DCP_GOAL_DEFINITIONS.find(d => d.goal === 9)!
    /** Goal 9's own verdict for one round's requirement on one record. */
    const requirementMet = (r: ScrapedRecord, round: 1 | 2): boolean => {
      const column = goal9.requirements[round - 1]!.anyOf[0]!
      return readDcpGoalColumn(r, column) >= column.required
    }
    /** Every pairing of round values, including non-zero Round 2, blanks,
     *  fractions and out-of-range cells, so "both rounds" is exercised. */
    const synthetic = (): ScrapedRecord[] => {
      const cells = ['0', '1', '3', '4', '5', '7', '9', '', '4.5', '-2', 6]
      return cells.flatMap(a => cells.map(b => record(a, b)))
    }

    for (const [name, load] of [
      ['captured D61 2026-10-11', loadCapture],
      ['synthetic, every pairing', synthetic],
    ] as const) {
      it(`${name}: each club's round at 4+ equals goal 9's requirement`, () => {
        for (const r of load()) {
          for (const round of [1, 2] as const) {
            expect(
              officersTrainedInRound(r, round) >=
                OFFICER_TRAINING_DCP_THRESHOLD,
              `${JSON.stringify(r)} round ${round}`
            ).toBe(requirementMet(r, round))
          }
          expect(
            officersTrainedInRound(r, 1) >= OFFICER_TRAINING_DCP_THRESHOLD &&
              officersTrainedInRound(r, 2) >= OFFICER_TRAINING_DCP_THRESHOLD
          ).toBe(isDcpGoalAchieved(r, goal9))
        }
      })

      it(`${name}: the roll-up at 4+ counts exactly the clubs goal 9 credits, per round`, () => {
        const records = load()
        const summary = summarizeOfficerTraining(records)!
        for (const round of [1, 2] as const) {
          const atFour = (round === 1 ? summary.round1 : summary.round2)
            .slice(OFFICER_TRAINING_DCP_THRESHOLD)
            .reduce((a, b) => a + b, 0)
          expect(atFour).toBe(
            records.filter(r => requirementMet(r, round)).length
          )
        }
      })
    }

    it('the synthetic set does credit goal 9 to some clubs (not vacuous)', () => {
      expect(
        synthetic().filter(r => isDcpGoalAchieved(r, goal9)).length
      ).toBeGreaterThan(0)
    })
  })

  it('reads a fractional cell as goal 9 does (4.5 → 4), never as an index', () => {
    expect(summarizeOfficerTraining([record('4.5', 6.7)])).toEqual({
      round1: [0, 0, 0, 0, 1, 0, 0, 0],
      round2: [0, 0, 0, 0, 0, 0, 1, 0],
    })
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
