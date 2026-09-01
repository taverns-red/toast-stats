/**
 * Rules for the published `global-totals.json` shape (#1498, epic #1496).
 *
 * The frozen 2026-06-30 regression lives in `scripts/lib/__tests__/`; these
 * are the era- and availability-dependent rules stated small, because each
 * one is a place where "absent" would otherwise silently become "zero".
 */

import { describe, it, expect } from 'vitest'
import type { DistrictRanking } from '@taverns-red/shared-contracts'
import {
  buildGlobalTotals,
  programYearForSnapshotDate,
} from './globalTotals.js'

/** A ranking row with only the fields a given assertion cares about. */
const ranking = (
  districtId: string,
  fields: Partial<DistrictRanking> = {}
): DistrictRanking =>
  ({
    districtId,
    districtName: `District ${districtId}`,
    region: 'I',
    paidClubs: 0,
    paidClubBase: 0,
    clubGrowthPercent: 0,
    totalPayments: 0,
    paymentBase: 0,
    paymentGrowthPercent: 0,
    activeClubs: 0,
    distinguishedClubs: 0,
    selectDistinguished: 0,
    presidentsDistinguished: 0,
    distinguishedPercent: 0,
    clubsRank: 1,
    paymentsRank: 1,
    distinguishedRank: 1,
    aggregateScore: 0,
    overallRank: 1,
    ...fields,
  }) as DistrictRanking

describe('programYearForSnapshotDate (#1498)', () => {
  it('keys the program year on the snapshot date, July→June', () => {
    expect(programYearForSnapshotDate('2026-06-30')).toBe('2025-2026')
    expect(programYearForSnapshotDate('2026-07-01')).toBe('2026-2027')
    expect(programYearForSnapshotDate('2022-03-31')).toBe('2021-2022')
  })
})

describe('buildGlobalTotals — Smedley is absent before PY 2025-26 (#1498)', () => {
  const withStoredZero = (snapshotDate: string) =>
    buildGlobalTotals({
      snapshotDate,
      districts: [{ districtId: '61', clubs: [] }],
      // Old rankings files store a literal 0 back to 2022 — the tier did not
      // exist, so the artifact must model it as ABSENT, not echo the zero.
      rankings: [ranking('61', { smedleyDistinguished: 0 })],
    })

  it('reports null for a pre-2025-26 date even though the field stores 0', () => {
    expect(withStoredZero('2024-06-30').distinguishedClubs.smedley).toBeNull()
    expect(withStoredZero('2022-06-30').distinguishedClubs.smedley).toBeNull()
  })

  it('reports the count once the tier exists', () => {
    const totals = buildGlobalTotals({
      snapshotDate: '2026-06-30',
      districts: [{ districtId: '61', clubs: [] }],
      rankings: [ranking('61', { smedleyDistinguished: 7 })],
    })

    expect(totals.distinguishedClubs.smedley).toBe(7)
  })

  it('derives the base tier without the absent Smedley rung', () => {
    const totals = buildGlobalTotals({
      snapshotDate: '2024-06-30',
      districts: [{ districtId: '61', clubs: [] }],
      rankings: [
        ranking('61', {
          distinguishedClubs: 10,
          selectDistinguished: 3,
          presidentsDistinguished: 2,
          smedleyDistinguished: 0,
        }),
      ],
    })

    expect(totals.distinguishedClubs.base).toBe(5)
  })
})

describe('buildGlobalTotals — undefined verdicts are their own bucket (#1498)', () => {
  it('never counts an Unknown district as failing', () => {
    // 2022-06-30 scores under a ruleset whose prerequisite columns the era's
    // export does not carry, so the verdict is Unknown (#1116 item 5).
    const totals = buildGlobalTotals({
      snapshotDate: '2022-06-30',
      districts: [{ districtId: '61', clubs: [] }],
      rankings: [
        ranking('61', {
          paidClubs: 100,
          paidClubBase: 100,
          totalPayments: 5000,
          paymentBase: 4000,
          distinguishedPercent: 60,
        }),
      ],
    })

    const { byTier, undefinedVerdictDistricts, distinguishedOrBetter } =
      totals.distinguishedDistricts
    const failing = byTier.NotDistinguished
    expect(failing + distinguishedOrBetter + byTier.Unknown).toBe(1)
    expect(undefinedVerdictDistricts.length).toBe(byTier.Unknown)
  })
})

describe('buildGlobalTotals — divisor guards (#1498)', () => {
  it('reports averages as null rather than dividing by zero paid clubs', () => {
    const totals = buildGlobalTotals({
      snapshotDate: '2026-06-30',
      districts: [{ districtId: '61', clubs: [] }],
      rankings: [ranking('61', { paidClubs: 0 })],
    })

    expect(totals.membership.paidClubs).toBe(0)
    expect(totals.membership.avgClubSize).toBeNull()
    expect(totals.distinguishedClubs.percentOfPaidClubs).toBeNull()
  })
})

describe('buildGlobalTotals — the district set is the rankings set (#1498)', () => {
  it('refuses to build with no district scope rather than guess', () => {
    expect(() =>
      buildGlobalTotals({
        snapshotDate: '2026-06-30',
        districts: [{ districtId: '61', clubs: [] }],
        rankings: [],
      })
    ).toThrow(/district set/i)
  })

  it('labels the undistricted row separately from the district count', () => {
    const totals = buildGlobalTotals({
      snapshotDate: '2026-06-30',
      districts: [
        { districtId: '61', clubs: [] },
        { districtId: 'U', clubs: [] },
      ],
      rankings: [ranking('61'), ranking('U')],
    })

    expect(totals.districts.total).toBe(2)
    expect(totals.districts.numbered).toBe(1)
    expect(totals.districts.includesUndistricted).toBe(true)
  })

  it('records includesUndistricted false when the date has no U row', () => {
    const totals = buildGlobalTotals({
      snapshotDate: '2026-06-30',
      districts: [{ districtId: '61', clubs: [] }],
      rankings: [ranking('61')],
    })

    expect(totals.districts.includesUndistricted).toBe(false)
    expect(totals.districts.numbered).toBe(1)
  })
})
