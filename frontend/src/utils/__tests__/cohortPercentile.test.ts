import { describe, it, expect } from 'vitest'
import type { GlobalClubRaceDistribution } from '@taverns-red/shared-contracts'
import { cohortPercentile, membershipBandLabel } from '../cohortPercentile'

/**
 * #1556 — the club page's private, cohort-based standing: "top X % of clubs
 * worldwide by goals met · top Y % among clubs with 20–24 members", computed
 * from the artifact's 44 histogram numbers, never from a per-club list.
 * A club is never told it is 11,204th; an empty cohort is null, never 100 %.
 */

const hist = (...pairs: Array<[number, number]>): number[] => {
  const h = Array.from({ length: 11 }, () => 0)
  for (const [goals, n] of pairs) h[goals] = n
  return h
}

const distribution: GlobalClubRaceDistribution = {
  // 100 clubs: 50 at 0 goals, 30 at 3, 15 at 5, 5 at 8.
  goalsMet: hist([0, 50], [3, 30], [5, 15], [8, 5]),
  membership: { lt12: 40, from12to19: 30, from20to24: 20, ge25: 10 },
  byTierRequirementsMet: {
    none: 80,
    Distinguished: 15,
    Select: 5,
    President: 0,
    Smedley: 0,
  },
  byOfficialCode: { none: 100, D: 0, S: 0, P: 0, M: 0 },
  cohorts: {
    lt12: hist([0, 35], [3, 5]),
    from12to19: hist([0, 15], [3, 15]),
    // 20 clubs: 10 at 3, 8 at 5, 2 at 8.
    from20to24: hist([3, 10], [5, 8], [8, 2]),
    ge25: hist([3, 0], [5, 7], [8, 3]),
  },
}

describe('cohortPercentile (#1556)', () => {
  it('places a club in the top X % overall and within its membership band', () => {
    // 5 goals, 22 members: overall 20 of 100 clubs have ≥ 5 goals → top 20 %;
    // in the 20–24 band, 10 of 20 have ≥ 5 → top 50 %.
    expect(cohortPercentile(distribution, 5, 22)).toEqual({
      band: 'from20to24',
      cohortSize: 20,
      topPercentOverall: 20,
      topPercentInBand: 50,
    })
  })

  it('rounds UP so a club is never told it is better than it is', () => {
    // 8 goals, 22 members: 5 of 100 overall → 5 %; 2 of 20 in band → 10 %.
    expect(cohortPercentile(distribution, 8, 22).topPercentOverall).toBe(5)
    // 3 goals, 30 members: ge25 band, 10 of 10 have ≥ 3 → top 100 %.
    expect(cohortPercentile(distribution, 3, 30).topPercentInBand).toBe(100)
    // 8 goals, 11 members: lt12 has nobody at 8 but the club itself is not in
    // the histogram (absent club) → counts only what is there: 0 of 40 → the
    // club is at least in the top 3 % (1 of 40 rounded up), never 0 %.
    expect(cohortPercentile(distribution, 8, 11).topPercentInBand).toBe(3)
  })

  it('returns null percentiles for an empty cohort, never 100 %', () => {
    const empty: GlobalClubRaceDistribution = {
      ...distribution,
      membership: { lt12: 0, from12to19: 0, from20to24: 0, ge25: 0 },
      cohorts: {
        lt12: hist(),
        from12to19: hist(),
        from20to24: hist(),
        ge25: hist(),
      },
    }
    expect(cohortPercentile(empty, 5, 22).topPercentInBand).toBeNull()
    expect(
      cohortPercentile({ ...empty, goalsMet: hist() }, 5, 22).topPercentOverall
    ).toBeNull()
  })

  it('uses the same band boundaries as the artifact (12, 20, 25)', () => {
    expect(cohortPercentile(distribution, 0, 11).band).toBe('lt12')
    expect(cohortPercentile(distribution, 0, 12).band).toBe('from12to19')
    expect(cohortPercentile(distribution, 0, 19).band).toBe('from12to19')
    expect(cohortPercentile(distribution, 0, 20).band).toBe('from20to24')
    expect(cohortPercentile(distribution, 0, 24).band).toBe('from20to24')
    expect(cohortPercentile(distribution, 0, 25).band).toBe('ge25')
  })

  it('labels bands in plain language', () => {
    expect(membershipBandLabel('lt12')).toBe('fewer than 12 members')
    expect(membershipBandLabel('from12to19')).toBe('12–19 members')
    expect(membershipBandLabel('from20to24')).toBe('20–24 members')
    expect(membershipBandLabel('ge25')).toBe('25 or more members')
  })
})
