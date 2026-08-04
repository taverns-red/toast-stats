import { describe, it, expect } from 'vitest'
import {
  isProvisionallyDistinguished,
  getConfirmedLevel,
} from '../provisionalDistinguished'
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

// #1139 — getConfirmedLevel mirrored the distinguished thresholds without
// the CSP gate, so a CSP-less club meeting goals/renewals was still
// returned as Distinguished. CSP is required for distinguished recognition
// from 2025-2026 onward.
describe('getConfirmedLevel CSP gate (#1139)', () => {
  const confirmedDistinguishedShape = {
    dcpGoalsTrend: [{ date: '2026-02-15', goalsAchieved: 5 }],
    aprilRenewals: 20,
    membershipBase: 20,
  }

  it('returns NotDistinguished when cspSubmitted is false', () => {
    const club = makeClub({
      ...confirmedDistinguishedShape,
      cspSubmitted: false,
    })
    expect(getConfirmedLevel(club)).toBe('NotDistinguished')
  })

  it('returns Distinguished when cspSubmitted is true', () => {
    const club = makeClub({
      ...confirmedDistinguishedShape,
      cspSubmitted: true,
    })
    expect(getConfirmedLevel(club)).toBe('Distinguished')
  })

  it('treats undefined cspSubmitted as submitted (pre-2025-26 historical data)', () => {
    const club = makeClub({
      ...confirmedDistinguishedShape,
      // cspSubmitted omitted → undefined
    })
    expect(getConfirmedLevel(club)).toBe('Distinguished')
  })
})

// #1406 — the club Smedley rung was introduced for PY 2025-26. The confirmed
// level must be resolved under the rules of the year being shown, so a
// historical club is never confirmed at a tier that did not exist.
describe('getConfirmedLevel per program year (#1406)', () => {
  const smedleyOnRenewals = {
    dcpGoalsTrend: [{ date: '2024-02-15', goalsAchieved: 10 }],
    aprilRenewals: 25,
    membershipBase: 20,
  }

  it('confirms President, not Smedley, before 2025-26', () => {
    const club = makeClub(smedleyOnRenewals)
    expect(getConfirmedLevel(club, '2023-2024')).toBe('President')
  })

  it('confirms Smedley from 2025-26 onward', () => {
    const club = makeClub(smedleyOnRenewals)
    expect(getConfirmedLevel(club, '2025-2026')).toBe('Smedley')
    expect(getConfirmedLevel(club, '2026-2027')).toBe('Smedley')
  })

  it('keeps the current ladder when no program year is passed', () => {
    expect(getConfirmedLevel(makeClub(smedleyOnRenewals))).toBe('Smedley')
  })
})
