/**
 * Rules for the extended single-pass rollup (#1498, epic #1496).
 *
 * The frozen-fixture regression that pins the real 2026-06-30 numbers lives
 * in `scripts/lib/__tests__/` next to the CEO-report oracle constants it
 * asserts against. These are the pure rules, stated small.
 */

import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  rollUpGlobal,
  readSnapshotRollupInput,
  type ClubPaymentRow,
} from './globalRollup.js'

const district = (districtId: string, clubs: ClubPaymentRow[]) => ({
  districtId,
  clubs,
})

const club = (
  clubId: string,
  extra: Partial<ClubPaymentRow> = {}
): ClubPaymentRow => ({ clubId, payments: 0, ...extra })

describe('rollUpGlobal — membership (#1498)', () => {
  it('sums Active Members over every club counted once', () => {
    const rollup = rollUpGlobal({
      rankingsDistrictIds: ['61', '62'],
      districts: [
        district('61', [club('1', { activeMembers: 20 })]),
        district('62', [club('2', { activeMembers: 13 })]),
      ],
    })

    expect(rollup.totalMembership).toBe(33)
  })

  it('counts a double-filed club’s membership once, not twice', () => {
    const rollup = rollUpGlobal({
      rankingsDistrictIds: ['61', '62'],
      districts: [
        district('61', [club('00000003', { activeMembers: 20 })]),
        district('62', [club('3', { activeMembers: 999 })]),
      ],
    })

    expect(rollup.clubCount).toBe(1)
    expect(rollup.totalMembership).toBe(20)
    expect(rollup.duplicateClubs).toHaveLength(1)
  })

  it('leaves membership out of the sum for an out-of-scope district', () => {
    const rollup = rollUpGlobal({
      rankingsDistrictIds: ['61'],
      districts: [
        district('61', [club('1', { activeMembers: 20 })]),
        district('201', [club('9', { activeMembers: 500 })]),
      ],
    })

    expect(rollup.totalMembership).toBe(20)
    expect(rollup.excludedDistricts).toEqual(['201'])
  })
})

describe('rollUpGlobal — club movement (#1498)', () => {
  const movement = (statuses: string[], snapshotDate?: string) =>
    rollUpGlobal({
      snapshotDate,
      rankingsDistrictIds: ['61'],
      districts: [
        district(
          '61',
          statuses.map((clubStatusField, i) =>
            club(String(i + 1), { clubStatusField })
          )
        ),
      ],
    })

  it('counts charters and suspensions inside the snapshot date’s program year', () => {
    const rollup = movement(
      ['Charter 03/26/26', ' Susp 03/31/26', ''],
      '2026-06-30'
    )

    expect(rollup.newClubsStillActive).toBe(1)
    expect(rollup.suspendedClubs).toBe(1)
  })

  it('excludes a row dated outside the snapshot date’s program year', () => {
    // 2025-06-30 belongs to PY 2024-25 (July 1 2024 → June 30 2025), so a
    // March 2026 suspension is a LATER year's event and must not be counted.
    const rollup = movement(
      ['Charter 03/26/26', ' Susp 03/31/26', 'Charter 08/01/24'],
      '2025-06-30'
    )

    expect(rollup.newClubsStillActive).toBe(1)
    expect(rollup.suspendedClubs).toBe(0)
  })

  it('reports movement as unknown, not zero, when no snapshot date is given', () => {
    const rollup = movement(['Charter 03/26/26', ' Susp 03/31/26'])

    expect(rollup.newClubsStillActive).toBeNull()
    expect(rollup.suspendedClubs).toBeNull()
  })
})

describe('rollUpGlobal — clubs by country (#1498)', () => {
  it('publishes an explicit unknown bucket rather than dropping the clubs', () => {
    const rollup = rollUpGlobal({
      rankingsDistrictIds: ['61'],
      districts: [
        district('61', [
          club('1', { country: 'Canada' }),
          club('2', { country: 'Canada' }),
          club('3', { country: 'Japan' }),
          club('4'),
          club('5', { country: '   ' }),
        ]),
      ],
    })

    expect(rollup.clubsByCountry).toEqual([
      { country: 'Canada', clubs: 2 },
      { country: 'Japan', clubs: 1 },
    ])
    expect(rollup.clubsWithUnknownCountry).toBe(2)
    const listed = rollup.clubsByCountry.reduce((s, r) => s + r.clubs, 0)
    expect(listed + rollup.clubsWithUnknownCountry).toBe(rollup.clubCount)
  })

  it('breaks ties by country name so the ordering is stable', () => {
    const rollup = rollUpGlobal({
      rankingsDistrictIds: ['61'],
      districts: [
        district('61', [
          club('1', { country: 'Zambia' }),
          club('2', { country: 'Albania' }),
        ]),
      ],
    })

    expect(rollup.clubsByCountry.map(r => r.country)).toEqual([
      'Albania',
      'Zambia',
    ])
  })
})

describe('readSnapshotRollupInput — extended read (#1498)', () => {
  it('joins payments, Active Members, status and Find-A-Club country', () => {
    const dir = mkdtempSync(join(tmpdir(), 'global-rollup-read-'))
    try {
      const snapshotDir = join(dir, '2026-06-30')
      mkdirSync(snapshotDir)
      writeFileSync(
        join(snapshotDir, 'all-districts-rankings.json'),
        JSON.stringify({ rankings: [{ districtId: '61' }] })
      )
      writeFileSync(
        join(snapshotDir, 'district_61.json'),
        JSON.stringify({
          districtId: '61',
          data: {
            districtPerformance: [
              {
                Club: '00003045',
                'Total to Date': '23',
                'Charter Date/Suspend Date': ' Susp 03/31/26',
              },
            ],
            clubPerformance: [
              { 'Club Number': '3045', 'Active Members': '19' },
            ],
            clubs: [{ clubId: '00003045', address: { country: 'Canada' } }],
          },
        })
      )

      const loaded = readSnapshotRollupInput(snapshotDir)

      expect(loaded.districts[0]!.clubs[0]).toEqual({
        clubId: '00003045',
        payments: 23,
        activeMembers: 19,
        clubStatusField: ' Susp 03/31/26',
        country: 'Canada',
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
