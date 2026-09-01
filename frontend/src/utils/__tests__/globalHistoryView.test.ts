/**
 * Worldwide-scoreboard view model (#1500, epic #1496 Sprint 4).
 *
 * These are the fast, page-mount-free guards (R22) for the rule that has cost
 * this repo the most: **absent is never zero**. The page tests prove the DOM;
 * these prove the model that feeds it, including combinations the live
 * artifact does not carry today but will (a Smedley value for every year once
 * 2025-26 is no longer the newest year; a report-basis new-club count from
 * 2026-27; a ten-row series once the 2016-17 → 2020-21 backfill lands).
 */

import { describe, it, expect } from 'vitest'
import type { GlobalHistory } from '@taverns-red/shared-contracts'
import {
  ABSENCE_TEXT,
  buildCountryRows,
  buildScoreboardModel,
  programYearLabel,
  type ScoreboardCell,
} from '../globalHistoryView'
import { globalHistoryFixture } from '../../__tests__/fixtures/globalHistory'

function findCell(
  history: GlobalHistory,
  rowKey: string,
  programYear: string
): ScoreboardCell {
  const model = buildScoreboardModel(history)
  const index = model.years.findIndex(y => y.programYear === programYear)
  expect(index).toBeGreaterThanOrEqual(0)
  for (const group of model.groups) {
    const row = group.rows.find(r => r.key === rowKey)
    if (row) {
      const cell = row.cells[index]
      expect(cell).toBeDefined()
      return cell as ScoreboardCell
    }
  }
  throw new Error(`no row ${rowKey}`)
}

describe('programYearLabel', () => {
  it('shortens a program year for a column header', () => {
    expect(programYearLabel('2025-2026')).toBe('2025-26')
    expect(programYearLabel('2016-2017')).toBe('2016-17')
  })

  it('falls back to the raw string rather than rendering NaN', () => {
    expect(programYearLabel('unknown')).toBe('unknown')
  })
})

describe('buildScoreboardModel — column ordering and count', () => {
  it('keeps the artifact order (newest first) and makes no assumption about length', () => {
    const model = buildScoreboardModel(globalHistoryFixture)
    expect(model.years.map(y => y.programYear)).toEqual([
      '2025-2026',
      '2024-2025',
      '2023-2024',
      '2022-2023',
      '2021-2022',
    ])

    const ten: GlobalHistory = {
      ...globalHistoryFixture,
      years: [
        ...globalHistoryFixture.years,
        ...globalHistoryFixture.years.map((y, i) => ({
          ...y,
          programYear: `${2016 + i}-${2017 + i}`,
        })),
      ],
    }
    const wide = buildScoreboardModel(ten)
    expect(wide.years).toHaveLength(10)
    for (const group of wide.groups) {
      for (const row of group.rows) {
        expect(row.cells).toHaveLength(10)
      }
    }
  })
})

describe('buildScoreboardModel — absent is never zero', () => {
  it('marks pre-2025-26 Smedley as not-applicable, not 0', () => {
    const cell = findCell(globalHistoryFixture, 'smedley', '2024-2025')
    expect(cell.absence).toBe('not-applicable')
    expect(cell.text).toBe(ABSENCE_TEXT['not-applicable'])
    expect(cell.text).not.toBe('0')
    expect(cell.note).toMatch(/did not exist/i)
  })

  it('renders a real Smedley count when the tier existed', () => {
    const cell = findCell(globalHistoryFixture, 'smedley', '2025-2026')
    expect(cell.absence).toBeUndefined()
    expect(cell.text).toBe('1,912')
  })

  it('marks a missing education year as not-on-file, not 0', () => {
    const cell = findCell(globalHistoryFixture, 'education-total', '2025-2026')
    expect(cell.absence).toBe('not-on-file')
    expect(cell.text).not.toBe('0')
  })

  it('marks a missing March-31 rollup as not-on-file, not 0', () => {
    const cell = findCell(
      globalHistoryFixture,
      'total-membership-march31',
      '2021-2022'
    )
    expect(cell.absence).toBe('not-on-file')
    expect(cell.text).not.toBe('0')
  })

  it('marks report-basis new clubs as forward-only — a third, distinct kind', () => {
    const cell = findCell(
      globalHistoryFixture,
      'new-clubs-report-basis',
      '2023-2024'
    )
    expect(cell.absence).toBe('forward-only')
    expect(cell.note).toMatch(/2026-2027/)
    // The three kinds must stay visually distinguishable from one another.
    expect(new Set(Object.values(ABSENCE_TEXT)).size).toBe(3)
  })

  it('renders a report-basis count once the source exists (the 2026-27 path)', () => {
    const forward: GlobalHistory = {
      ...globalHistoryFixture,
      years: globalHistoryFixture.years.map((y, i) =>
        i === 0
          ? { ...y, clubMovement: { ...y.clubMovement, newClubs: 932 } }
          : y
      ),
    }
    const cell = findCell(forward, 'new-clubs-report-basis', '2025-2026')
    expect(cell.absence).toBeUndefined()
    expect(cell.text).toBe('932')
  })

  it('never emits a bare empty string for any cell', () => {
    const model = buildScoreboardModel(globalHistoryFixture)
    for (const group of model.groups) {
      for (const row of group.rows) {
        for (const cell of row.cells) {
          expect(cell.text.trim()).not.toBe('')
        }
      }
    }
  })

  it('gives every absent cell a full explanatory sentence', () => {
    const model = buildScoreboardModel(globalHistoryFixture)
    for (const group of model.groups) {
      for (const row of group.rows) {
        for (const cell of row.cells) {
          if (cell.absence) {
            expect(cell.note && cell.note.length).toBeGreaterThan(30)
            expect(cell.note).toMatch(/not (applicable|on file|zero)|no /i)
          }
        }
      }
    }
  })
})

describe('buildScoreboardModel — ruled labelling', () => {
  it('never labels our still-active series as plain "new clubs"', () => {
    const model = buildScoreboardModel(globalHistoryFixture)
    const rows = model.groups.flatMap(g => g.rows)
    const ours = rows.find(r => r.key === 'new-clubs-still-active')
    const theirs = rows.find(r => r.key === 'new-clubs-report-basis')
    expect(ours?.label).toBe('New clubs still active at year end')
    expect(theirs?.label).toBe('New clubs (report basis)')
    expect(ours?.label).not.toBe(theirs?.label)
  })

  it('states the average-club-size basis on the row itself', () => {
    const row = buildScoreboardModel(globalHistoryFixture)
      .groups.flatMap(g => g.rows)
      .find(r => r.key === 'avg-club-size')
    expect(row?.basis).toBe('June-30 membership ÷ paid clubs')
  })

  it('states the district count with undistricted separate', () => {
    const cell = findCell(globalHistoryFixture, 'districts', '2025-2026')
    expect(cell.text).toBe('126 + undistricted')
  })

  it('omits the "+ undistricted" suffix when the year had no U row', () => {
    const noU: GlobalHistory = {
      ...globalHistoryFixture,
      years: globalHistoryFixture.years.map((y, i) =>
        i === 0
          ? { ...y, districts: { ...y.districts, includesUndistricted: false } }
          : y
      ),
    }
    expect(findCell(noU, 'districts', '2025-2026').text).toBe('126')
  })
})

describe('buildScoreboardModel — education group', () => {
  it('drops the group and flags it when NO year has education on file', () => {
    const none: GlobalHistory = {
      ...globalHistoryFixture,
      years: globalHistoryFixture.years.map(y => ({ ...y, education: null })),
    }
    const model = buildScoreboardModel(none)
    expect(model.educationAbsentEntirely).toBe(true)
    expect(model.groups.some(g => g.key === 'education')).toBe(false)
  })

  it('keeps the group when at least one year has data', () => {
    const model = buildScoreboardModel(globalHistoryFixture)
    expect(model.educationAbsentEntirely).toBe(false)
    expect(model.groups.some(g => g.key === 'education')).toBe(true)
  })
})

describe('buildCountryRows', () => {
  it('always sums to the clubs counted — listed + aggregated + unknown', () => {
    const rows = buildCountryRows(
      [
        { country: 'United States', clubs: 5664 },
        { country: 'India', clubs: 1066 },
      ],
      284,
      7014
    )
    expect(rows.reduce((sum, r) => sum + r.clubs, 0)).toBe(7014)
  })

  it('publishes Unknown as its own row with a share', () => {
    const rows = buildCountryRows([{ country: 'X', clubs: 50 }], 50, 100)
    const unknown = rows.find(r => r.key === 'unknown')
    expect(unknown).toMatchObject({ clubs: 50, sharePct: 50, unknown: true })
  })

  it('aggregates the long tail rather than truncating it (the sum must hold)', () => {
    const many = Array.from({ length: 158 }, (_, i) => ({
      country: `C${i}`,
      clubs: 158 - i,
    }))
    const total = many.reduce((s, c) => s + c.clubs, 0) + 7
    const rows = buildCountryRows(many, 7, total)
    expect(rows.find(r => r.key === 'other')).toBeDefined()
    expect(rows.reduce((sum, r) => sum + r.clubs, 0)).toBe(total)
  })

  it('ranks descending, ties broken by name', () => {
    const rows = buildCountryRows(
      [
        { country: 'B', clubs: 5 },
        { country: 'A', clubs: 5 },
        { country: 'C', clubs: 9 },
      ],
      0,
      19
    )
    expect(rows.map(r => r.label).slice(0, 3)).toEqual(['C', 'A', 'B'])
  })

  it('does not divide by zero when nothing was counted', () => {
    const rows = buildCountryRows([], 0, 0)
    expect(rows.every(r => Number.isFinite(r.sharePct))).toBe(true)
  })
})
