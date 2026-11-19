/**
 * Promote gate vs the March-close baseline fields (#1614 review note 2).
 *
 * `marchCloseNewPayments` / `marchCloseCharterPayments` first appear on the
 * April–June dates when those dates are rebuilt, or when a daily first
 * rewrites a month-end after the baseline lands. Prod's copy of the same
 * date has no such fields. These tests pin how the gate treats that:
 *
 * - A rebuild never auto-allows (#1673): the changed dates hold for review
 *   and promote only with allowValueChanges, as any re-derive does.
 * - A daily closing rewrite of a month-end (CPAA on) treats a field present
 *   on one side only as an optionality transition and holds for review. It
 *   does not auto-allow the new fields as base drift.
 * - A brand-new date is additive and promotes.
 */
import { describe, it, expect } from 'vitest'
import type {
  AllDistrictsRankingsData,
  DistrictRanking,
} from '@taverns-red/shared-contracts'
import {
  digestDate,
  diffSnapshots,
  evaluatePromote,
} from '../SnapshotValueDiff.js'

function district(overrides: Partial<DistrictRanking> = {}): DistrictRanking {
  return {
    districtId: '61',
    districtName: 'District 61',
    region: 'Region 7',
    paidClubs: 100,
    paidClubBase: 98,
    clubGrowthPercent: 2.04,
    totalPayments: 5000,
    paymentBase: 4800,
    paymentGrowthPercent: 4.17,
    activeClubs: 95,
    distinguishedClubs: 30,
    selectDistinguished: 10,
    presidentsDistinguished: 5,
    distinguishedPercent: 30,
    clubsRank: 3,
    paymentsRank: 4,
    distinguishedRank: 2,
    aggregateScore: 88.5,
    overallRank: 3,
    newPayments: 900,
    aprilPayments: 2500,
    octoberPayments: 2300,
    latePayments: 40,
    charterPayments: 100,
    ...overrides,
  }
}

function rankings(
  rows: DistrictRanking[],
  sourceCsvDate: string
): AllDistrictsRankingsData {
  return {
    metadata: {
      snapshotId: sourceCsvDate,
      calculatedAt: '2027-05-03T00:00:00.000Z',
      schemaVersion: '1.0.0',
      calculationVersion: '1.0.0',
      rankingVersion: '2.0',
      sourceCsvDate,
      csvFetchedAt: '2027-05-03T00:00:00.000Z',
      totalDistricts: rows.length,
      fromCache: false,
    },
    rankings: rows,
  }
}

const WITH_BASELINE = {
  marchCloseNewPayments: 820,
  marchCloseCharterPayments: 90,
}

/**
 * Staging carries the baseline fields; prod's copy of the same date does
 * not. `stagingSourceCsvDate` after the date = the closing signature.
 */
function firstAppearance(date: string, stagingSourceCsvDate: string) {
  const staging = [
    digestDate(date, rankings([district(WITH_BASELINE)], stagingSourceCsvDate)),
  ]
  const prod = [digestDate(date, rankings([district()], date))]
  return { report: diffSnapshots(staging, prod), digests: { staging, prod } }
}

describe('promote gate: March-close fields appearing on April–June dates (#1614)', () => {
  it('the first rebuild of 2026-04-30 holds for review (rebuilds never auto-allow)', () => {
    const { report, digests } = firstAppearance('2026-04-30', '2026-05-04')
    expect(report.changed.map(c => c.date)).toEqual(['2026-04-30'])

    const decision = evaluatePromote(
      report,
      { closingAutoAllow: false },
      digests
    )
    expect(decision.promote).toBe(false)
    expect(decision.requiresReview).toBe(true)
    expect(decision.autoAllowed).toBeUndefined()
  })

  it('the reviewed rebuild promotes with allowValueChanges', () => {
    const { report, digests } = firstAppearance('2026-06-30', '2026-07-20')
    const decision = evaluatePromote(
      report,
      { closingAutoAllow: false, allowValueChanges: true },
      digests
    )
    expect(decision.promote).toBe(true)
    expect(decision.requiresReview).toBe(true)
  })

  it('a daily closing rewrite where prod lacks the fields is an optionality transition, held for review', () => {
    const { report, digests } = firstAppearance('2027-04-30', '2027-05-03')
    const decision = evaluatePromote(report, {}, digests)
    expect(decision.promote).toBe(false)
    expect(decision.autoAllowed).toBeUndefined()
    const reasons = decision.reasons.join('\n')
    expect(reasons).toMatch(/marchCloseNewPayments: optionality transition/)
    expect(reasons).toMatch(/marchCloseCharterPayments: optionality transition/)
  })

  it('a daily closing rewrite with the fields on both sides auto-allows', () => {
    const date = '2027-04-30'
    const staging = [
      digestDate(
        date,
        rankings(
          [district({ ...WITH_BASELINE, aprilPayments: 2520 })],
          '2027-05-03'
        )
      ),
    ]
    const prod = [digestDate(date, rankings([district(WITH_BASELINE)], date))]
    const decision = evaluatePromote(
      diffSnapshots(staging, prod),
      {},
      {
        staging,
        prod,
      }
    )
    expect(decision.promote).toBe(true)
    expect(decision.autoAllowed).toBe('closing-reconciliation')
  })

  it('a new in-window date with the fields is additive and promotes', () => {
    const staging = [
      digestDate(
        '2027-04-15',
        rankings([district(WITH_BASELINE)], '2027-04-15')
      ),
    ]
    const report = diffSnapshots(staging, [])
    expect(report.added).toEqual(['2027-04-15'])
    const decision = evaluatePromote(report, {}, { staging, prod: [] })
    expect(decision.promote).toBe(true)
    expect(decision.requiresReview).toBe(false)
  })
})
