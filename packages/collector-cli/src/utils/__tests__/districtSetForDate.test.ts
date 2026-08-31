/**
 * The district set belongs to the DATE being written, not to today (#1465).
 *
 * `snapshots/2026-06-30/` ended up holding 158 district files — the 128
 * districts that existed at the 2025-26 close PLUS the 30 renumbered PY
 * 2026-27 districts (201-231) — because a rewrite on 2026-07-31 was handed
 * the then-current discovery set. 4,673 clubs then appear under two districts
 * on one date.
 *
 * The districtsummary CSV the program-year resolver already validated for that
 * date IS the authoritative district set for it. These tests pin the
 * reconciliation rule that uses it.
 */

import { describe, it, expect } from 'vitest'
import { reconcileDistrictsForDate } from '../districtSetForDate.js'

/** A districtsummary CSV body listing exactly the given district ids. */
function summaryCsv(districtIds: string[]): string {
  const rows = districtIds
    .map(id => `"${id}","Region 1","5000","5100","2.0%"`)
    .join('\n')
  return [
    '"DISTRICT","REGION","Paid Clubs Base","Paid Clubs","Club Growth"',
    rows,
    '"Month of Jun, As of 07/30/2026"',
  ].join('\n')
}

describe('reconcileDistrictsForDate (#1465)', () => {
  it('drops a district that does not appear in the date’s districtsummary', () => {
    const result = reconcileDistrictsForDate(
      ['61', '201', '231'],
      summaryCsv(['61', '62'])
    )

    expect(result.applied).toBe(true)
    expect(result.districts).toEqual(['61'])
    expect(result.skipped).toEqual(['201', '231'])
  })

  it('keeps every district that the date’s districtsummary lists', () => {
    const result = reconcileDistrictsForDate(
      ['61', 'F', 'U'],
      summaryCsv(['61', 'F', 'U'])
    )

    expect(result.applied).toBe(true)
    expect(result.districts).toEqual(['61', 'F', 'U'])
    expect(result.skipped).toEqual([])
  })

  it('matches across zero-padding and case, which the CSV and config disagree on', () => {
    const result = reconcileDistrictsForDate(
      ['01', '5', 'f'],
      summaryCsv(['1', '05', 'F'])
    )

    expect(result.applied).toBe(true)
    expect(result.districts).toEqual(['01', '5', 'f'])
    expect(result.skipped).toEqual([])
  })

  it('is UNDECIDED, not a verdict, when the summary is unusable (#1129)', () => {
    for (const content of [
      undefined,
      '',
      'Header\nRow1',
      '<html>error</html>',
    ]) {
      const result = reconcileDistrictsForDate(['61', '201'], content)
      expect(result.applied).toBe(false)
      expect(result.districts).toEqual(['61', '201'])
      expect(result.skipped).toEqual([])
    }
  })

  it('never invents a district the caller did not ask for', () => {
    const result = reconcileDistrictsForDate(['61'], summaryCsv(['61', '62']))

    expect(result.districts).toEqual(['61'])
  })

  it('preserves the caller’s order and its exact id spelling', () => {
    const result = reconcileDistrictsForDate(
      ['U', '02', '61'],
      summaryCsv(['61', '02', 'U'])
    )

    expect(result.districts).toEqual(['U', '02', '61'])
  })
})
