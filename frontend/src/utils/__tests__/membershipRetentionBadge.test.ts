import { describe, it, expect } from 'vitest'
import { membershipRetentionBadgeFor } from '../membershipRetentionBadge'
import type {
  CompetitiveAwardStandings,
  MembershipRetentionAward,
  MembershipRetentionStanding,
} from '../../services/cdn'

const row = (
  districtId: string,
  rank: number,
  value: number,
  isWinner: boolean
): MembershipRetentionStanding => ({
  districtId,
  districtName: `District ${districtId}`,
  region: '1',
  rank,
  value,
  isWinner,
  retained: Math.round(value * 10),
  base: 1000,
})

const standingsWith = (
  award: MembershipRetentionAward | undefined
): CompetitiveAwardStandings => ({
  metadata: {
    snapshotId: '2026-05-31',
    calculatedAt: '2026-06-01T00:00:00Z',
    totalDistricts: 5,
  },
  extensionAward: [],
  twentyPlusAward: [],
  retentionAward: [],
  ...(award ? { membershipRetentionAward: award } : {}),
  byDistrict: {},
})

const fiveRows = [
  row('64', 1, 83.66, true),
  row('76', 2, 83.49, true),
  row('24', 3, 82.7, true),
  row('F', 4, 80.1, false),
  row('61', 5, 78.5, false),
]

describe('membershipRetentionBadgeFor (#1614)', () => {
  it('gives the rank, the count ranked and the value while in progress', () => {
    const badge = membershipRetentionBadgeFor(
      standingsWith({ status: 'in-progress', standings: fiveRows }),
      '61'
    )
    expect(badge).toEqual({
      rank: 5,
      of: 5,
      value: 78.5,
      isWinner: false,
      final: false,
      tied: false,
    })
  })

  it('marks a top-3 district and a final close', () => {
    const badge = membershipRetentionBadgeFor(
      standingsWith({ status: 'final', standings: fiveRows }),
      '76'
    )
    expect(badge).toMatchObject({ rank: 2, isWinner: true, final: true })
  })

  it('ranks District F like any other district', () => {
    const badge = membershipRetentionBadgeFor(
      standingsWith({ status: 'in-progress', standings: fiveRows }),
      'F'
    )
    expect(badge).toMatchObject({ rank: 4, of: 5 })
  })

  it('flags winners who share a rank (#1610)', () => {
    const tiedRows = [
      row('64', 1, 83.66, true),
      row('76', 2, 83.0, true),
      row('24', 2, 83.0, true),
      row('61', 4, 78.5, false),
    ]
    const badge = membershipRetentionBadgeFor(
      standingsWith({ status: 'final', standings: tiedRows }),
      '24'
    )
    expect(badge).toMatchObject({ rank: 2, tied: true })
  })

  it.each(['not-started', 'baseline-missing', 'something-new'])(
    'returns null when the status is %s',
    status => {
      expect(
        membershipRetentionBadgeFor(
          standingsWith({
            status: status as MembershipRetentionAward['status'],
            standings: fiveRows,
          }),
          '61'
        )
      ).toBeNull()
    }
  )

  it('returns null on an older file without the key', () => {
    expect(membershipRetentionBadgeFor(standingsWith(undefined), '61')).toBe(
      null
    )
  })

  it('returns null with no standings file or no district', () => {
    expect(membershipRetentionBadgeFor(null, '61')).toBeNull()
    expect(
      membershipRetentionBadgeFor(
        standingsWith({ status: 'in-progress', standings: fiveRows }),
        undefined
      )
    ).toBeNull()
  })

  it('returns null for a district left out of the ranking', () => {
    expect(
      membershipRetentionBadgeFor(
        standingsWith({ status: 'in-progress', standings: fiveRows }),
        'U'
      )
    ).toBeNull()
  })

  it('returns null when standings is not an array', () => {
    expect(
      membershipRetentionBadgeFor(
        standingsWith({
          status: 'in-progress',
          standings: null as unknown as MembershipRetentionStanding[],
        }),
        '61'
      )
    ).toBeNull()
  })

  it('drops rows with non-finite numbers and leaves them out of the count', () => {
    const rows = [
      ...fiveRows,
      { ...row('99', 6, 70, false), value: Number.NaN },
      { ...row('98', 7, 70, false), base: Number.POSITIVE_INFINITY },
    ]
    const standings = standingsWith({ status: 'in-progress', standings: rows })
    expect(membershipRetentionBadgeFor(standings, '99')).toBeNull()
    expect(membershipRetentionBadgeFor(standings, '98')).toBeNull()
    expect(membershipRetentionBadgeFor(standings, '61')).toMatchObject({
      of: 5,
    })
  })

  it('leaves out the count when the rank is past the renderable rows', () => {
    const rows = [...fiveRows.slice(0, 4), row('61', 7, 78.5, false)]
    expect(
      membershipRetentionBadgeFor(
        standingsWith({ status: 'in-progress', standings: rows }),
        '61'
      )
    ).toMatchObject({ rank: 7, of: null })
  })

  it('returns null when the rank is not a positive finite number', () => {
    const rows = [{ ...row('61', Number.NaN, 78.5, false) }]
    expect(
      membershipRetentionBadgeFor(
        standingsWith({ status: 'in-progress', standings: rows }),
        '61'
      )
    ).toBeNull()
  })
})
