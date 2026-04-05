import { describe, it, expect } from 'vitest'
import { isProvisionallyDistinguished } from '../provisionalDistinguished'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'

function makeClub(overrides: Partial<ClubTrend> = {}): ClubTrend {
  return {
    clubId: '1234',
    clubName: 'Test Club',
    divisionId: 'A',
    divisionName: 'Division A',
    areaId: '1',
    areaName: 'Area 1',
    membershipTrend: [],
    dcpGoalsTrend: [],
    currentStatus: 'thriving',
    riskFactors: [],
    distinguishedLevel: 'Distinguished',
    ...overrides,
  }
}

describe('isProvisionallyDistinguished', () => {
  it('uses CDN field when available (true)', () => {
    const club = makeClub({
      isProvisionallyDistinguished: true,
    })
    expect(isProvisionallyDistinguished(club, '2026-03-15')).toBe(true)
  })

  it('uses CDN field when available (false)', () => {
    const club = makeClub({
      isProvisionallyDistinguished: false,
    })
    expect(isProvisionallyDistinguished(club, '2026-03-15')).toBe(false)
  })

  it('returns false for NotDistinguished clubs', () => {
    const club = makeClub({
      distinguishedLevel: 'NotDistinguished',
    })
    expect(isProvisionallyDistinguished(club, '2026-03-15')).toBe(false)
  })

  it('returns false for post-April data (month=4)', () => {
    const club = makeClub({ aprilRenewals: 0, membershipBase: 15 })
    expect(isProvisionallyDistinguished(club, '2026-04-15')).toBe(false)
  })

  it('returns false for post-April data (month=6)', () => {
    const club = makeClub({ aprilRenewals: 0, membershipBase: 15 })
    expect(isProvisionallyDistinguished(club, '2026-06-15')).toBe(false)
  })

  it('returns true for pre-April with insufficient renewals', () => {
    const club = makeClub({
      aprilRenewals: 10,
      membershipBase: 15,
    })
    // 10 < 20 and (10 - 15) = -5 < 3 → provisional
    expect(isProvisionallyDistinguished(club, '2026-03-15')).toBe(true)
  })

  it('returns false when aprilRenewals >= 20', () => {
    const club = makeClub({
      aprilRenewals: 22,
      membershipBase: 15,
    })
    expect(isProvisionallyDistinguished(club, '2026-03-15')).toBe(false)
  })

  it('returns false when net growth from renewals >= 3', () => {
    const club = makeClub({
      aprilRenewals: 18,
      membershipBase: 15,
    })
    // 18 - 15 = 3 → confirmed
    expect(isProvisionallyDistinguished(club, '2026-03-15')).toBe(false)
  })

  it('returns true for July (start of program year)', () => {
    const club = makeClub({
      aprilRenewals: 0,
      membershipBase: 15,
    })
    expect(isProvisionallyDistinguished(club, '2025-07-15')).toBe(true)
  })

  it('handles missing aprilRenewals as 0', () => {
    const club = makeClub({ membershipBase: 15 })
    // No aprilRenewals → defaults to 0 → provisional
    expect(isProvisionallyDistinguished(club, '2026-02-15')).toBe(true)
  })
})
