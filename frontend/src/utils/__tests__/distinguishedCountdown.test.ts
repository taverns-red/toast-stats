import { describe, it, expect } from 'vitest'
import {
  getDistinguishedCountdown,
  type DistinguishedCountdown,
} from '../distinguishedCountdown'
import type {
  CompetitiveAwardStandings,
  DistinguishedDistrictStatus,
} from '../../services/cdn'

/* Unit tests for the per-district countdown helper used by the Region
   page. As of #688 (epic #683 F4) the three numeric metrics render the
   ABSOLUTE count remaining to the *minimum* Distinguished tier — paid
   clubs / payments / distinguished clubs — not the percentage-point gap
   they used to show. Two officer-award booleans (education-training,
   club-growth) are unchanged.

   Data source (lesson 103 — derive the countdown from the same gate):
   - prefer the canonical `*Remaining` fields (#686, post-pipeline);
   - else derive from the gate's own clamped gap %: ceil(gap/100 × base),
     which is mathematically identical to the canonical field because the
     current counts are integers — so the column renders correctly on a
     pre-pipeline snapshot with zero drift. */

const mkAwards = (
  status: DistinguishedDistrictStatus | undefined,
  educationQualifies: boolean,
  clubGrowthQualifies: boolean
): CompetitiveAwardStandings =>
  ({
    metadata: { snapshotId: 'x', calculatedAt: 'x', totalDistricts: 1 },
    extensionAward: [],
    twentyPlusAward: [],
    retentionAward: [],
    byDistrict: {},
    distinguishedDistrict: status ? { [status.districtId]: status } : {},
    officerAwards: {
      educationTraining: [
        {
          districtId: '61',
          districtName: 'District 61',
          region: '2',
          qualifies: educationQualifies,
        },
      ],
      clubGrowth: [
        {
          districtId: '61',
          districtName: 'District 61',
          region: '2',
          qualifies: clubGrowthQualifies,
        },
      ],
    },
  }) as CompetitiveAwardStandings

const ddStatus = (
  overrides: Partial<DistinguishedDistrictStatus> = {}
): DistinguishedDistrictStatus => ({
  districtId: '61',
  currentTier: 'NotDistinguished',
  allPrerequisitesMet: false,
  prerequisites: {
    dspSubmitted: false,
    trainingMet: false,
    marketAnalysisSubmitted: false,
    communicationPlanSubmitted: false,
    regionAdvisorVisitMet: false,
  },
  nextTierGap: {
    tier: 'Distinguished',
    netClubGrowthGap: 3,
    paymentGrowthGap: 4.1,
    distinguishedPercentGap: 9.189189189189186,
    clubGrowthGap: 7.76,
    paidClubBase: 148,
    paymentBase: 6738,
  },
  ...overrides,
})

describe('getDistinguishedCountdown — absolute remaining counts (#688 #683)', () => {
  it('prefers the canonical *Remaining fields when present (post-pipeline)', () => {
    const awards = mkAwards(
      ddStatus({
        paidClubsRemaining: 12,
        paymentsRemaining: 277,
        distinguishedClubsRemaining: 31,
      }),
      false,
      true
    )
    const c = getDistinguishedCountdown('61', awards)
    expect(c).not.toBeNull()
    expect(c!.paidClubsRemaining).toEqual({ kind: 'count', value: 12 })
    expect(c!.paymentsRemaining).toEqual({ kind: 'count', value: 277 })
    expect(c!.distinguishedClubsRemaining).toEqual({ kind: 'count', value: 31 })
    expect(c!.educationTraining).toEqual({ kind: 'boolean', met: false })
    expect(c!.clubGrowth).toEqual({ kind: 'boolean', met: true })
  })

  it('renders ✓ (met) when a canonical remaining field is 0', () => {
    const awards = mkAwards(
      ddStatus({
        paidClubsRemaining: 0,
        paymentsRemaining: 0,
        distinguishedClubsRemaining: 5,
      }),
      false,
      false
    )
    const c = getDistinguishedCountdown('61', awards)
    expect(c!.paidClubsRemaining).toEqual({ kind: 'met' })
    expect(c!.paymentsRemaining).toEqual({ kind: 'met' })
    expect(c!.distinguishedClubsRemaining).toEqual({ kind: 'count', value: 5 })
  })

  it('derives the count from the gate gap when canonical fields are absent (pre-pipeline) — D47 payments = 277', () => {
    // Anchor from the live 2026-05-23 prod snapshot: D47 nextTierGap has
    // paymentGrowthGap=4.1, paymentBase=6738 → ceil(4.1/100×6738)=277.
    const awards = mkAwards(ddStatus({ districtId: '47' }), false, false)
    const c = getDistinguishedCountdown('47', awards)
    expect(c!.paymentsRemaining).toEqual({ kind: 'count', value: 277 })
    // clubGrowthGap=7.76, paidClubBase=148 → ceil(7.76/100×148)=ceil(11.48)=12
    expect(c!.paidClubsRemaining).toEqual({ kind: 'count', value: 12 })
    // distinguishedPercentGap≈9.189, paidClubBase=148 → ceil(13.6)=14
    expect(c!.distinguishedClubsRemaining).toEqual({ kind: 'count', value: 14 })
  })

  it('canonical field wins over the gap-derived fallback when both are present', () => {
    const awards = mkAwards(
      ddStatus({ districtId: '47', paymentsRemaining: 300 }),
      false,
      false
    )
    const c = getDistinguishedCountdown('47', awards)
    expect(c!.paymentsRemaining).toEqual({ kind: 'count', value: 300 })
  })

  it('returns met for a district already at or above the Distinguished minimum (no canonical field)', () => {
    // currentTier Select ⇒ the minimum is cleared; nextTierGap points at a
    // higher tier and must NOT be used to derive a "remaining" count.
    const awards = mkAwards(
      ddStatus({
        currentTier: 'Select',
        nextTierGap: {
          tier: 'Presidents',
          netClubGrowthGap: 0,
          paymentGrowthGap: 2,
          distinguishedPercentGap: 5,
          clubGrowthGap: 2,
          paidClubBase: 148,
          paymentBase: 6738,
        },
      }),
      true,
      true
    )
    const c = getDistinguishedCountdown('61', awards)
    expect(c!.paidClubsRemaining).toEqual({ kind: 'met' })
    expect(c!.paymentsRemaining).toEqual({ kind: 'met' })
    expect(c!.distinguishedClubsRemaining).toEqual({ kind: 'met' })
  })

  it('returns met for the numeric metrics when nextTierGap is null (district at Smedley)', () => {
    const awards = mkAwards(
      ddStatus({ currentTier: 'Smedley', nextTierGap: null }),
      true,
      true
    )
    const c = getDistinguishedCountdown('61', awards)
    expect(c!.paidClubsRemaining).toEqual({ kind: 'met' })
    expect(c!.paymentsRemaining).toEqual({ kind: 'met' })
    expect(c!.distinguishedClubsRemaining).toEqual({ kind: 'met' })
  })

  it('returns null cells for the numeric metrics on a legacy snapshot lacking bases', () => {
    // NotDistinguished, no canonical fields, and the gap predates the
    // base propagation (#555) ⇒ cannot derive ⇒ em-dash (null cell).
    const awards = mkAwards(
      ddStatus({
        nextTierGap: {
          tier: 'Distinguished',
          netClubGrowthGap: 3,
          paymentGrowthGap: 4.1,
          distinguishedPercentGap: 8,
          clubGrowthGap: 2,
        },
      }),
      false,
      false
    )
    const c = getDistinguishedCountdown('61', awards)
    expect(c!.paidClubsRemaining).toBeNull()
    expect(c!.paymentsRemaining).toBeNull()
    expect(c!.distinguishedClubsRemaining).toBeNull()
  })

  it('returns null when the district has no Distinguished District status entry', () => {
    const awards = mkAwards(undefined, false, false)
    expect(getDistinguishedCountdown('61', awards)).toBeNull()
  })

  it('returns null when awards is null (legacy snapshot)', () => {
    const c: DistinguishedCountdown | null = getDistinguishedCountdown(
      '61',
      null
    )
    expect(c).toBeNull()
  })

  it('officer-award booleans default to {met: false} when the district is missing from the lists', () => {
    const awards: CompetitiveAwardStandings = {
      ...mkAwards(ddStatus(), false, false),
      officerAwards: { educationTraining: [], clubGrowth: [] },
    }
    const c = getDistinguishedCountdown('61', awards)
    expect(c!.educationTraining).toEqual({ kind: 'boolean', met: false })
    expect(c!.clubGrowth).toEqual({ kind: 'boolean', met: false })
  })
})
