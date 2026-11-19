import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DistrictRanking } from '@taverns-red/shared-contracts'

import { CompetitiveAwardsCalculator } from './CompetitiveAwardsCalculator.js'
import { calculateMembershipRetention } from './MembershipRetentionCalculator.js'

/**
 * #1614: President's Membership Retention Award estimate.
 * value = April / (October + late + March-close new + March-close charter) x 100
 */

interface Overrides {
  districtId: string
  april?: number
  october?: number
  late?: number
  marchNew?: number
  marchCharter?: number
}

/** A row with the five payment fields; pass undefined to drop one. */
function row(o: Overrides): DistrictRanking {
  const has = (k: keyof Overrides, d: number): number | undefined =>
    k in o ? (o[k] as number | undefined) : d
  return {
    districtId: o.districtId,
    districtName: o.districtId,
    region: '01',
    paidClubs: 10,
    paidClubBase: 10,
    clubGrowthPercent: 0,
    totalPayments: 0,
    paymentBase: 0,
    paymentGrowthPercent: 0,
    activeClubs: 10,
    distinguishedClubs: 0,
    selectDistinguished: 0,
    presidentsDistinguished: 0,
    distinguishedPercent: 0,
    clubsRank: 1,
    paymentsRank: 1,
    distinguishedRank: 1,
    aggregateScore: 1,
    overallRank: 1,
    aprilPayments: has('april', 80),
    octoberPayments: has('october', 60),
    latePayments: has('late', 10),
    marchCloseNewPayments: has('marchNew', 20),
    marchCloseCharterPayments: has('marchCharter', 10),
  } as DistrictRanking
}

describe('calculateMembershipRetention', () => {
  it('computes april / (october + late + marchNew + marchCharter) x 100', () => {
    const r = calculateMembershipRetention(
      [row({ districtId: '1' })],
      '2026-05-31'
    )
    expect(r.standings).toHaveLength(1)
    expect(r.standings[0]).toMatchObject({
      districtId: '1',
      rank: 1,
      retained: 80,
      base: 100,
      value: 80,
    })
  })

  describe('status by logical date', () => {
    const rows = [row({ districtId: '1' })]
    it.each([
      ['2026-03-31', 'not-started'],
      ['2026-04-01', 'in-progress'],
      ['2026-06-29', 'in-progress'],
      ['2026-06-30', 'final'],
      ['2026-07-15', 'not-started'],
      ['2025-12-01', 'not-started'],
    ])('%s is %s', (date, status) => {
      expect(calculateMembershipRetention(rows, date).status).toBe(status)
    })

    it('has empty standings when not started', () => {
      expect(
        calculateMembershipRetention(rows, '2026-03-31').standings
      ).toEqual([])
      expect(
        calculateMembershipRetention(rows, '2026-07-15').standings
      ).toEqual([])
    })

    it('names the March close as the baseline date inside the window', () => {
      expect(
        calculateMembershipRetention(rows, '2026-05-31').baselineDate
      ).toBe('2026-03-31')
    })

    it('is baseline-missing in the window when no district has the baseline fields', () => {
      const noBaseline = [
        row({ districtId: '1', marchNew: undefined, marchCharter: undefined }),
      ]
      const r = calculateMembershipRetention(noBaseline, '2026-05-31')
      expect(r.status).toBe('baseline-missing')
      expect(r.standings).toEqual([])
    })
  })

  describe('exclusions', () => {
    it('ranks district F and leaves out U (clubs not in a district), any case', () => {
      const r = calculateMembershipRetention(
        [
          row({ districtId: 'F', april: 70 }),
          row({ districtId: 'U', april: 99 }),
          row({ districtId: 'u', april: 98 }),
          row({ districtId: '5', april: 60 }),
        ],
        '2026-05-31'
      )
      expect(r.standings.map(s => s.districtId)).toEqual(['F', '5'])
      expect(r.standings.map(s => s.rank)).toEqual([1, 2])
    })

    it('leaves out a district missing any one baseline field', () => {
      const r = calculateMembershipRetention(
        [
          row({ districtId: '1', late: undefined }),
          row({ districtId: '2', marchCharter: undefined }),
          row({ districtId: '3', april: undefined }),
          row({ districtId: '4', october: undefined }),
          row({ districtId: '5', marchNew: undefined }),
          row({ districtId: '6' }),
        ],
        '2026-05-31'
      )
      expect(r.standings.map(s => s.districtId)).toEqual(['6'])
    })

    it('leaves out a zero denominator', () => {
      const r = calculateMembershipRetention(
        [
          row({
            districtId: '1',
            october: 0,
            late: 0,
            marchNew: 0,
            marchCharter: 0,
          }),
          row({ districtId: '2' }),
        ],
        '2026-05-31'
      )
      expect(r.standings.map(s => s.districtId)).toEqual(['2'])
    })
  })

  describe('ranking', () => {
    it('shares a rank on ties and skips the next (competition ranking)', () => {
      const r = calculateMembershipRetention(
        [
          row({ districtId: '1', april: 90 }),
          row({ districtId: '2', april: 80 }),
          row({ districtId: '3', april: 80 }),
          row({ districtId: '4', april: 50 }),
        ],
        '2026-05-31'
      )
      expect(r.standings.map(s => [s.districtId, s.rank])).toEqual([
        ['1', 1],
        ['2', 2],
        ['3', 2],
        ['4', 4],
      ])
    })

    it('marks the top 3 as winners with no threshold', () => {
      const r = calculateMembershipRetention(
        [
          row({ districtId: '1', april: 10 }),
          row({ districtId: '2', april: 9 }),
          row({ districtId: '3', april: 8 }),
          row({ districtId: '4', april: 7 }),
        ],
        '2026-05-31'
      )
      expect(r.standings.map(s => s.isWinner)).toEqual([
        true,
        true,
        true,
        false,
      ])
    })
  })
})

describe('CompetitiveAwardsCalculator with a logical date (#1614)', () => {
  const rows = [
    row({ districtId: '1', april: 90 }),
    row({ districtId: 'U', april: 99 }),
    row({ districtId: '3', marchNew: undefined }),
  ]

  it('adds membershipRetentionAward and byDistrict fields', () => {
    const s = new CompetitiveAwardsCalculator().calculate(rows, '2026-05-31')
    expect(s.membershipRetentionAward?.status).toBe('in-progress')
    expect(s.membershipRetentionAward?.standings).toHaveLength(1)
    expect(s.byDistrict['1']).toMatchObject({
      membershipRetentionRank: 1,
      membershipRetentionValue: 90,
      membershipRetentionIsWinner: true,
    })
  })

  it('leaves the byDistrict retention fields absent for excluded districts', () => {
    const s = new CompetitiveAwardsCalculator().calculate(rows, '2026-05-31')
    for (const id of ['U', '3']) {
      expect(s.byDistrict[id]).toBeDefined()
      expect(s.byDistrict[id]).not.toHaveProperty('membershipRetentionRank')
      expect(s.byDistrict[id]).not.toHaveProperty('membershipRetentionValue')
      expect(s.byDistrict[id]).not.toHaveProperty('membershipRetentionIsWinner')
    }
  })

  it('leaves existing callers unchanged when no date is passed', () => {
    const s = new CompetitiveAwardsCalculator().calculate(rows)
    expect(s.membershipRetentionAward).toBeUndefined()
    expect(s.byDistrict['1']).not.toHaveProperty('membershipRetentionRank')
  })
})

describe('2025-26 reproduction (#1614)', () => {
  // Compact copy of live CDN data: aprilPayments, octoberPayments and
  // latePayments from snapshots/2026-06-30, and newPayments/charterPayments
  // from snapshots/2026-03-31 (as the March-close fields).
  const fixture = JSON.parse(
    readFileSync(
      new URL('./__fixtures__/retention-2025-26.json', import.meta.url),
      'utf8'
    )
  ) as DistrictRanking[]
  const r = calculateMembershipRetention(fixture, '2026-06-30')
  const byId = (id: string) => r.standings.find(s => s.districtId === id)

  it('is final on June 30', () => {
    expect(r.status).toBe('final')
  })

  it('ranks D64, D76 and D24 as the winners', () => {
    expect(r.standings.slice(0, 3).map(s => s.districtId)).toEqual([
      '64',
      '76',
      '24',
    ])
    expect(r.standings.slice(0, 3).map(s => s.value.toFixed(2))).toEqual([
      '83.66',
      '83.49',
      '82.70',
    ])
    expect(r.standings.slice(0, 3).every(s => s.isWinner)).toBe(true)
  })

  it('puts D61 13th at 78.5%', () => {
    expect(byId('61')?.rank).toBe(13)
    expect(byId('61')?.value.toFixed(1)).toBe('78.5')
  })

  it('ranks district F 81st at 69.07% and leaves out U', () => {
    expect(byId('F')?.rank).toBe(81)
    expect(byId('F')?.value.toFixed(2)).toBe('69.07')
    expect(byId('U')).toBeUndefined()
    expect(r.standings).toHaveLength(127)
  })

  it('carries retained and base for the winner', () => {
    expect(byId('64')).toMatchObject({ retained: 727, base: 869 })
  })
})
