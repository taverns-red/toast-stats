/**
 * One confirmed / provisional Distinguished classification per club, and one
 * `distinguishedCounts` per level (#2553, epic #2555).
 *
 * Confirmed is the rankings' rule: TI's 'Club Distinguished Status' once TI
 * recognises clubs, and before that the clubs whose April renewals alone
 * meet a rung (`countConfirmedDistinguishedClubs`). Provisional is the
 * frontend's `isProvisionallyDistinguished` rule (`isDistinguishedProvisional`).
 * A club counted as confirmed is never also counted as provisional.
 *
 * Every expected number below is worked by hand from the fixture comments.
 */

import { describe, expect, it } from 'vitest'
import { DistinguishedCountsSchema } from '@taverns-red/shared-contracts'
import type { ClubStatistics } from '../interfaces.js'
import { countConfirmedDistinguishedClubs } from '../rankings/confirmedDistinguished.js'
import {
  classifyClubDistinguished,
  computeDistinguishedCounts,
  distinguishedCountBasis,
  tallyDistinguished,
} from './distinguishedCounts.js'

function club(
  clubId: string,
  over: Partial<ClubStatistics> & Pick<ClubStatistics, 'divisionId' | 'areaId'>
): ClubStatistics {
  return {
    clubId,
    clubName: `Club ${clubId}`,
    divisionName: `Division ${over.divisionId}`,
    areaName: `Area ${over.areaId}`,
    membershipCount: 0,
    paymentsCount: 0,
    dcpGoals: 0,
    status: 'Active',
    clubStatus: 'Active',
    octoberRenewals: 0,
    aprilRenewals: 0,
    newMembers: 0,
    membershipBase: 0,
    cspSubmitted: true,
    ...over,
  }
}

/**
 * PY 2025-26 (Smedley exists). Before TI recognises anyone: no letters.
 *
 * - A  6 goals, 22 members, base 18, 21 renewals → confirmed Distinguished
 *      (21 ≥ 20); on current membership also Distinguished, renewals hold
 *      it → not provisional.
 * - B  7 goals, 22 members, base 20, 10 renewals → Select on current
 *      membership; renewals 10, growth −10 confirm nothing → provisional
 *      Select. After April it falls out: neither.
 * - C  10 goals, 26 members, base 24, 12 renewals → Smedley on current
 *      membership, nothing confirmed → provisional Smedley.
 * - D  10 goals, 27 members, base 20, 25 renewals → confirmed Smedley.
 * - E  7 goals, 21 members, base 10, 14 renewals → confirmed Distinguished
 *      (growth 4 ≥ 3, not ≥ 5); Select on current membership is
 *      unconfirmed, so its provisional level is Select, but it is counted
 *      once, as confirmed Distinguished.
 * - F  9 goals, 25 members, base 20, 22 renewals, no Club Success Plan →
 *      nothing at any level.
 * - G  Suspended (unpaid), 5 goals, 8 members, base 12, 20 renewals →
 *      confirmed Distinguished: the base is every club on the report, as
 *      the rankings count it.
 * - H  9 goals, 23 members, base 20, 20 renewals, Division B → confirmed
 *      President's (9 goals, 20 renewals).
 */
const CLUBS: ClubStatistics[] = [
  club('A', {
    divisionId: 'A',
    areaId: '01',
    dcpGoals: 6,
    membershipCount: 22,
    membershipBase: 18,
    aprilRenewals: 21,
  }),
  club('B', {
    divisionId: 'A',
    areaId: '01',
    dcpGoals: 7,
    membershipCount: 22,
    membershipBase: 20,
    aprilRenewals: 10,
  }),
  club('C', {
    divisionId: 'A',
    areaId: '02',
    dcpGoals: 10,
    membershipCount: 26,
    membershipBase: 24,
    aprilRenewals: 12,
  }),
  club('D', {
    divisionId: 'A',
    areaId: '02',
    dcpGoals: 10,
    membershipCount: 27,
    membershipBase: 20,
    aprilRenewals: 25,
  }),
  club('E', {
    divisionId: 'B',
    areaId: '03',
    dcpGoals: 7,
    membershipCount: 21,
    membershipBase: 10,
    aprilRenewals: 14,
  }),
  club('F', {
    divisionId: 'B',
    areaId: '03',
    dcpGoals: 9,
    membershipCount: 25,
    membershipBase: 20,
    aprilRenewals: 22,
    cspSubmitted: false,
  }),
  club('G', {
    divisionId: 'B',
    areaId: '04',
    dcpGoals: 5,
    membershipCount: 8,
    membershipBase: 12,
    aprilRenewals: 20,
    clubStatus: 'Suspended',
  }),
  club('H', {
    divisionId: 'B',
    areaId: '04',
    dcpGoals: 9,
    membershipCount: 23,
    membershipBase: 20,
    aprilRenewals: 20,
  }),
]

/** The same clubs as TI's raw CSV rows, as the rankings read them. */
function rawRows(clubs: readonly ClubStatistics[]) {
  return {
    clubPerformance: clubs.map(c => ({
      'Club Number': c.clubId,
      'Goals Met': String(c.dcpGoals),
      'Mem. Base': String(c.membershipBase),
      'Active Members': String(c.membershipCount),
      CSP: c.cspSubmitted === false ? 'N' : 'Y',
      'Club Distinguished Status': c.distinguishedStatus ?? '',
    })),
    districtPerformance: clubs.map(c => ({
      Club: c.clubId,
      'Apr. Ren.': String(c.aprilRenewals),
    })),
  }
}

const PRE_APRIL = '2025-11-15'
const POST_APRIL = '2026-04-20'
const PY = '2025-2026'

function opts(snapshotDate: string, clubs = CLUBS) {
  return {
    snapshotDate,
    programYear: PY,
    basis: distinguishedCountBasis(clubs),
  }
}

const byId = (snapshotDate: string, clubs = CLUBS) =>
  Object.fromEntries(
    clubs.map(c => [
      c.clubId,
      classifyClubDistinguished(c, opts(snapshotDate, clubs)),
    ])
  )

describe('classifyClubDistinguished — before April, nobody recognised by TI (#2553)', () => {
  it('reads the April-renewals basis when no club carries a TI status', () => {
    expect(distinguishedCountBasis(CLUBS)).toBe('april-renewals')
  })

  it('classifies each club into its confirmed and provisional level', () => {
    expect(byId(PRE_APRIL)).toEqual({
      A: { confirmedLevel: 'Distinguished', provisionalLevel: null },
      B: { confirmedLevel: null, provisionalLevel: 'Select' },
      C: { confirmedLevel: null, provisionalLevel: 'Smedley' },
      D: { confirmedLevel: 'Smedley', provisionalLevel: null },
      E: { confirmedLevel: 'Distinguished', provisionalLevel: 'Select' },
      F: { confirmedLevel: null, provisionalLevel: null },
      G: { confirmedLevel: 'Distinguished', provisionalLevel: null },
      H: { confirmedLevel: 'President', provisionalLevel: null },
    })
  })

  it('counts confirmed and provisional as disjoint sets, tiers partitioning each', () => {
    const counts = tallyDistinguished(
      CLUBS.map(c => classifyClubDistinguished(c, opts(PRE_APRIL)))
    )
    expect(counts).toEqual({
      confirmed: 5,
      provisional: 2,
      byTier: {
        distinguished: { confirmed: 3, provisional: 0 },
        select: { confirmed: 0, provisional: 1 },
        presidents: { confirmed: 1, provisional: 0 },
        smedley: { confirmed: 1, provisional: 1 },
      },
    })
    expect(DistinguishedCountsSchema.safeParse(counts).success).toBe(true)
  })

  it('district confirmed equals the rankings count for the same rows', () => {
    const { district } = computeDistinguishedCounts(CLUBS, PRE_APRIL)
    const { clubPerformance, districtPerformance } = rawRows(CLUBS)
    expect(district.confirmed).toBe(
      countConfirmedDistinguishedClubs(clubPerformance, districtPerformance, PY)
    )
    expect(district.confirmed).toBe(5)
  })
})

describe('classifyClubDistinguished — after April renewals (#2553)', () => {
  it('a club provisional before April that renewals do not confirm falls out of both', () => {
    const after = byId(POST_APRIL)
    expect(after['B']).toEqual({ confirmedLevel: null, provisionalLevel: null })
    expect(after['C']).toEqual({ confirmedLevel: null, provisionalLevel: null })
  })

  it('nothing is provisional after April; confirmed still matches the rankings', () => {
    const { district } = computeDistinguishedCounts(CLUBS, POST_APRIL)
    expect(district.provisional).toBe(0)
    const { clubPerformance, districtPerformance } = rawRows(CLUBS)
    expect(district.confirmed).toBe(
      countConfirmedDistinguishedClubs(clubPerformance, districtPerformance, PY)
    )
  })
})

describe('classifyClubDistinguished — TI recognises clubs (#2553)', () => {
  // TI's own letters: A D, D M, E S, H P. B and C carry no letter.
  const LETTERS: Record<string, string> = { A: 'D', D: 'M', E: 'S', H: 'P' }
  const RECOGNISED = CLUBS.map(c =>
    LETTERS[c.clubId]
      ? { ...c, distinguishedStatus: LETTERS[c.clubId] }
      : { ...c, distinguishedStatus: '' }
  )

  it('switches to TI basis when any club carries a TI status', () => {
    expect(distinguishedCountBasis(RECOGNISED)).toBe('ti-recognised')
  })

  it("confirmed is TI's tier per club, and the district total is TI's count", () => {
    const { district } = computeDistinguishedCounts(RECOGNISED, '2026-05-31')
    expect(district).toEqual({
      confirmed: 4,
      provisional: 0,
      byTier: {
        distinguished: { confirmed: 1, provisional: 0 },
        select: { confirmed: 1, provisional: 0 },
        presidents: { confirmed: 1, provisional: 0 },
        smedley: { confirmed: 1, provisional: 0 },
      },
    })
  })

  it('reads the historical word forms TI used to spell the tier', () => {
    const words = [
      { ...CLUBS[0]!, distinguishedStatus: "President's Distinguished" },
    ]
    expect(
      classifyClubDistinguished(words[0]!, {
        snapshotDate: '2024-06-30',
        programYear: '2023-2024',
        basis: distinguishedCountBasis(words),
      }).confirmedLevel
    ).toBe('President')
  })
})

describe('computeDistinguishedCounts — division and area levels (#2553)', () => {
  it('groups every club into its division and area; levels sum to the district', () => {
    const { district, divisions } = computeDistinguishedCounts(CLUBS, PRE_APRIL)
    expect(divisions.map(d => d.divisionId)).toEqual(['A', 'B'])
    const [a, b] = divisions
    expect(a!.distinguishedCounts.confirmed).toBe(2) // A, D
    expect(a!.distinguishedCounts.provisional).toBe(2) // B, C
    expect(b!.distinguishedCounts.confirmed).toBe(3) // E, G, H
    expect(b!.distinguishedCounts.provisional).toBe(0)
    expect(
      a!.areas.map(x => [x.areaId, x.distinguishedCounts.confirmed])
    ).toEqual([
      ['01', 1],
      ['02', 1],
    ])
    expect(
      b!.areas.map(x => [x.areaId, x.distinguishedCounts.confirmed])
    ).toEqual([
      ['03', 1],
      ['04', 2],
    ])
    expect(
      divisions.reduce((n, d) => n + d.distinguishedCounts.confirmed, 0)
    ).toBe(district.confirmed)
    expect(
      divisions.reduce((n, d) => n + d.distinguishedCounts.provisional, 0)
    ).toBe(district.provisional)
  })

  it('an empty district has zero counts, not missing ones', () => {
    const { district, divisions } = computeDistinguishedCounts([], PRE_APRIL)
    expect(district.confirmed).toBe(0)
    expect(district.provisional).toBe(0)
    expect(divisions).toEqual([])
  })
})
