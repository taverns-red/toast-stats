/**
 * The worldwide rollup must count each club once (#1466, epic #1426).
 *
 * 2026-06-30 is a free regression case: its directory holds 128 legacy
 * districts plus 30 renumbered PY 2026-27 ones (#1465), 4,673 clubs appear
 * twice, and the CORRECT total has an externally published expected value —
 * the TI CEO Report's 2025-26 membership-payments figure. So the assertion
 * below is against TI's number, not against our own output.
 *
 * The fixture is a frozen capture of the DEFECTIVE directory (see its
 * README). Nothing here depends on the archive ever being rewritten.
 */

import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import {
  rollUpGlobal,
  readSnapshotRollupInput,
  type GlobalRollupInput,
} from '../globalRollup'
import { CEO_REPORT_MEMBERSHIP_PAYMENTS } from '../ceoReportOracle'

const FIXTURE = join(
  __dirname,
  'fixtures',
  'global-rollup',
  '2026-06-30-club-payments.json'
)

interface Fixture {
  snapshotDate: string
  rankingsDistrictIds: string[]
  districts: Array<{ districtId: string; clubs: Array<[string, number]> }>
}

const fixture = JSON.parse(readFileSync(FIXTURE, 'utf-8')) as Fixture

const input: GlobalRollupInput = {
  rankingsDistrictIds: fixture.rankingsDistrictIds,
  districts: fixture.districts.map(d => ({
    districtId: d.districtId,
    clubs: d.clubs.map(([clubId, payments]) => ({ clubId, payments })),
  })),
}

/** What a rollup that trusts the directory listing would produce. */
function naiveSum(): { rows: number; payments: number } {
  let rows = 0
  let payments = 0
  for (const district of input.districts) {
    for (const club of district.clubs) {
      rows += 1
      payments += club.payments
    }
  }
  return { rows, payments }
}

describe('global rollup — 2026-06-30 (#1466)', () => {
  it('reproduces the overcount a directory-trusting sum produces', () => {
    // The defect, stated as arithmetic: 158 district files, 19,692 club rows,
    // 575,954 payments — against TI's published 548,483.
    expect(input.districts).toHaveLength(158)
    expect(naiveSum()).toEqual({ rows: 19692, payments: 575954 })
    expect(naiveSum().payments).not.toBe(
      CEO_REPORT_MEMBERSHIP_PAYMENTS['2025-2026']
    )
  })

  it('reproduces the TI CEO Report’s published 2025-26 payments figure', () => {
    const rollup = rollUpGlobal(input)

    // Source: TI CEO Report, August 2026, Numeric Snapshots — NOT our output.
    expect(CEO_REPORT_MEMBERSHIP_PAYMENTS['2025-2026']).toBe(548483)
    expect(rollup.totalPayments).toBe(
      CEO_REPORT_MEMBERSHIP_PAYMENTS['2025-2026']
    )
    expect(rollup.districtCount).toBe(128)
    expect(rollup.clubCount).toBe(15016)
    expect(rollup.missingDistricts).toEqual([])
  })

  it('names the 30 districts that did not belong to that date', () => {
    const rollup = rollUpGlobal(input)

    expect(rollup.excludedDistricts).toHaveLength(30)
    for (const districtId of rollup.excludedDistricts) {
      expect(Number(districtId)).toBeGreaterThanOrEqual(201)
      expect(Number(districtId)).toBeLessThanOrEqual(231)
    }
    // Nothing is double-counted once the date's own district set is applied.
    expect(rollup.duplicateClubs).toEqual([])
  })

  it('reports the 4,673 double-filed clubs when scoped to the directory itself', () => {
    // The anti-pattern the issue names: scope taken from "whatever files sit
    // in the directory". Canonical-club-id keying then counts each club once
    // — but WHICH row wins is file order, not truth, so the total is merely
    // different, not correct. What matters is that it is reported, loudly.
    const rollup = rollUpGlobal({
      ...input,
      rankingsDistrictIds: input.districts.map(d => d.districtId),
    })

    expect(rollup.duplicateClubs).toHaveLength(4673)
    expect(rollup.clubCount).toBe(15019)
    expect(rollup.totalPayments).not.toBe(
      CEO_REPORT_MEMBERSHIP_PAYMENTS['2025-2026']
    )
    for (const duplicate of rollup.duplicateClubs.slice(0, 50)) {
      expect(duplicate.districtIds.length).toBeGreaterThan(1)
      expect(duplicate.clubId).toBe(duplicate.clubId.replace(/^0+/, ''))
    }
  })
})

describe('rollUpGlobal — rules (#1466)', () => {
  const district = (districtId: string, clubs: Array<[string, number]>) => ({
    districtId,
    clubs: clubs.map(([clubId, payments]) => ({ clubId, payments })),
  })

  it('counts a club once when both padding forms of its id appear', () => {
    const rollup = rollUpGlobal({
      rankingsDistrictIds: ['61', '62'],
      districts: [
        district('61', [['00003045', 23]]),
        district('62', [['3045', 4]]),
      ],
    })

    expect(rollup.clubCount).toBe(1)
    expect(rollup.totalPayments).toBe(23)
    expect(rollup.duplicateClubs).toEqual([
      { clubId: '3045', districtIds: ['61', '62'] },
    ])
  })

  it('matches district ids across zero-padding and case', () => {
    const rollup = rollUpGlobal({
      rankingsDistrictIds: ['01', 'F'],
      districts: [district('1', [['10', 5]]), district('f', [['11', 7]])],
    })

    expect(rollup.districtCount).toBe(2)
    expect(rollup.totalPayments).toBe(12)
    expect(rollup.excludedDistricts).toEqual([])
  })

  it('reports a district the date lists but no file supplied', () => {
    const rollup = rollUpGlobal({
      rankingsDistrictIds: ['61', '62'],
      districts: [district('61', [['10', 5]])],
    })

    expect(rollup.districtCount).toBe(1)
    expect(rollup.missingDistricts).toEqual(['62'])
  })

  it('refuses to roll up with no district scope rather than guess', () => {
    expect(() =>
      rollUpGlobal({
        rankingsDistrictIds: [],
        districts: [district('61', [['10', 5]])],
      })
    ).toThrow(/district set/i)
  })
})

describe('readSnapshotRollupInput (#1466)', () => {
  it('takes its district set from the rankings file, not the directory listing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'global-rollup-'))
    try {
      const snapshotDir = join(dir, '2026-06-30')
      mkdirSync(snapshotDir)
      writeFileSync(
        join(snapshotDir, 'all-districts-rankings.json'),
        JSON.stringify({ rankings: [{ districtId: '61' }] })
      )
      for (const [districtId, clubId, payments] of [
        ['61', '00003045', 23],
        ['201', '00003045', 8],
      ] as const) {
        writeFileSync(
          join(snapshotDir, `district_${districtId}.json`),
          JSON.stringify({
            districtId,
            data: {
              districtPerformance: [
                { Club: clubId, 'Total to Date': String(payments) },
              ],
            },
          })
        )
      }

      const loaded = readSnapshotRollupInput(snapshotDir)

      expect(loaded.rankingsDistrictIds).toEqual(['61'])
      expect(loaded.districts.map(d => d.districtId).sort()).toEqual([
        '201',
        '61',
      ])
      expect(rollUpGlobal(loaded)).toMatchObject({
        totalPayments: 23,
        clubCount: 1,
        excludedDistricts: ['201'],
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
