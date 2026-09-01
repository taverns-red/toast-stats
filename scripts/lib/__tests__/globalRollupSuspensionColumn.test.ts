/**
 * The suspension column, as ten published year-ends actually carry it (#1514).
 *
 * `v1/global-history.json` published `suspendedClubs: 0` for eight of its ten
 * program years while `newClubsStillActive` stayed healthy in every one of
 * them. The census below is the evidence that settled which defect that was:
 * the eight zero years carry **no `Susp` value on any districtPerformance row
 * of any in-scope district** — 0 of 15,261 rows at 2025-06-30, 0 of 16,203 at
 * 2023-06-30, and so on — while the CHARTER branch of the very same
 * `Charter Date/Suspend Date` column is populated on all ten dates. The parse
 * was right; the datum is absent, and absence is not zero.
 *
 * These assertions run against a frozen capture, never the network. See the
 * fixture README for its shape and why it must not be regenerated.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  rollUpGlobal,
  type GlobalRollup,
} from '../../../packages/analytics-core/src/rollup/globalRollup.js'

interface Census {
  readonly capturedAt: string
  readonly source: string
  readonly dates: ReadonlyArray<{
    readonly date: string
    readonly rankingsDistrictIds: string[]
    readonly clubRowsInFiles: number
    readonly districtsMissingFiles: string[]
    readonly districts: Array<{
      readonly districtId: string
      /** `[club id, Charter Date/Suspend Date]`, non-empty values only. */
      readonly clubs: Array<[string, string]>
    }>
  }>
}

const census = JSON.parse(
  readFileSync(
    join(
      __dirname,
      'fixtures',
      'global-rollup',
      'suspension-column-census.json'
    ),
    'utf-8'
  )
) as Census

const byDate = new Map(census.dates.map(entry => [entry.date, entry]))

function rollup(date: string): GlobalRollup {
  const entry = byDate.get(date)
  if (!entry) throw new Error(`no captured census for ${date}`)
  return rollUpGlobal({
    snapshotDate: date,
    rankingsDistrictIds: entry.rankingsDistrictIds,
    districts: entry.districts.map(d => ({
      districtId: d.districtId,
      clubs: d.clubs.map(([clubId, clubStatusField]) => ({
        clubId,
        payments: 0,
        clubStatusField,
      })),
    })),
  })
}

/** The eight years `global-history.json` published as a literal 0. */
const YEARS_WITH_NO_SUSPENSION_DATA = [
  '2025-06-30',
  '2024-06-30',
  '2023-06-30',
  '2021-06-30',
  '2020-06-30',
  '2019-06-30',
  '2018-06-30',
  '2017-06-30',
] as const

/** The two years whose Susp branch was collected, with their published counts. */
const YEARS_WITH_SUSPENSION_DATA = [
  ['2026-06-30', 716],
  ['2022-06-30', 1014],
] as const

describe('the published year-ends’ suspension column (#1514)', () => {
  it('captured every district the ten dates’ rankings list', () => {
    for (const entry of census.dates) {
      expect(entry.districtsMissingFiles).toEqual([])
      expect(entry.districts).toHaveLength(entry.rankingsDistrictIds.length)
    }
  })

  it.each(YEARS_WITH_NO_SUSPENSION_DATA)(
    '%s carries no Susp value at all, so suspendedClubs is null',
    date => {
      const result = rollup(date)

      expect(result.clubsWithSuspensionDate).toBe(0)
      expect(result.suspendedClubs).toBeNull()
      // Not an empty directory and not an empty column: the CHARTER branch of
      // the same field is populated, which is what makes the missing Susp
      // branch a collection gap rather than a quiet year.
      expect(result.newClubsStillActive).toBeGreaterThan(0)
    }
  )

  it.each(YEARS_WITH_SUSPENSION_DATA)(
    '%s keeps its measured count of %i',
    (date, expected) => {
      const result = rollup(date)

      expect(result.clubsWithSuspensionDate).toBeGreaterThan(0)
      expect(result.suspendedClubs).toBe(expected)
    }
  )

  it('counts only in-window suspensions on a date whose column is populated', () => {
    // 2022-06-30 carries four Susp rows stamped JULY 2022 — after its own
    // snapshot date, the later-rewrite shape of #1465. They prove the branch
    // was collected without being counted, which is exactly why the presence
    // signal is window-independent and the count is not.
    const result = rollup('2022-06-30')

    expect(result.clubsWithSuspensionDate).toBe(1018)
    expect(result.suspendedClubs).toBe(1014)
  })
})
