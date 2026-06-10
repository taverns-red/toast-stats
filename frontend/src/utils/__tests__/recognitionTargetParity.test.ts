import { describe, it, expect } from 'vitest'
import {
  calculateGrowthTargets,
  calculatePercentageTargets,
  DistinguishedDistrictCalculator,
} from '@toastmasters/analytics-core'
import type { DistrictRanking } from '@toastmasters/shared-contracts'
import {
  deriveRemainingToTier,
  type DistinguishedTier,
} from '../distinguishedCountdown'
import {
  calculateDivisionGapAnalysis,
  calculateDivisionDistinguishedRequirement,
} from '../divisionGapAnalysis'

/* Cross-implementation parity property (#1126, epic #1097).

   Four implementations compute recognition targets from a base count:
   - analytics-core TargetCalculator (district recognition targets → CDN)
   - analytics-core DistinguishedDistrictCalculator (countdown fields)
   - frontend distinguishedCountdown (pre-pipeline derived countdown)
   - frontend divisionGapAnalysis (division DDP gaps)

   The program rule is one rule (Item 1490): a target is "at least X% of
   base", i.e. ceil of an exact percentage. #798 showed the float form
   `ceil(base * 0.55)` overshoots (100 → 56); this property pins every
   implementation to the same integer-exact value so the drift class —
   one copy fixed, a sibling copy regressing — is dead, not just the
   instances named in the audit.

   Targets are extracted from the countdown implementations by feeding
   zero current counts: remaining = max(0, target − 0) = target. */

/** Bases known to overshoot under the float form (#798), plus a dense
 *  low sweep and a few large districts. 100/200 are the live D86/D94
 *  wrong numbers; 225 is the smallest 8%-growth overshoot. */
const SWEEP = [
  ...Array.from({ length: 601 }, (_, i) => i),
  825,
  850,
  1700,
  2125,
  4500,
  5000,
  9999,
  10000,
]

const zeroCurrentRanking = (base: number): DistrictRanking =>
  ({
    districtId: 'P1',
    districtName: 'Parity',
    region: '01',
    paidClubs: 0,
    paidClubBase: base,
    totalPayments: 0,
    paymentBase: base,
    distinguishedClubs: 0,
    clubGrowthPercent: 0,
    paymentGrowthPercent: 0,
    distinguishedPercent: 0,
    dspSubmitted: true,
    trainingMet: true,
    marketAnalysisSubmitted: true,
    communicationPlanSubmitted: true,
    regionAdvisorVisitMet: true,
  }) as DistrictRanking

/** TargetCalculator level ↔ countdown tier, same thresholds by rule. */
const TIER_FOR_LEVEL: Record<
  'distinguished' | 'select' | 'presidents' | 'smedley',
  DistinguishedTier
> = {
  distinguished: 'Distinguished',
  select: 'Select',
  presidents: 'Presidents',
  smedley: 'Smedley',
}

describe('recognition target parity across implementations (#1126)', () => {
  it('distinguished-clubs targets agree: TargetCalculator ↔ distinguishedCountdown (all tiers)', () => {
    for (const base of SWEEP) {
      const targets = calculatePercentageTargets(base)
      for (const level of Object.keys(TIER_FOR_LEVEL) as Array<
        keyof typeof TIER_FOR_LEVEL
      >) {
        const derived = deriveRemainingToTier(TIER_FOR_LEVEL[level], {
          paidClubBase: base,
          paymentBase: 0,
          paidClubs: 0,
          totalPayments: 0,
          distinguishedClubs: 0,
        })
        expect
          .soft(derived.distinguishedClubsRemaining, `base=${base} ${level}`)
          .toBe(targets[level])
      }
    }
  })

  it('growth targets agree: TargetCalculator ↔ distinguishedCountdown (all tiers)', () => {
    for (const base of SWEEP) {
      const targets = calculateGrowthTargets(base)
      for (const level of Object.keys(TIER_FOR_LEVEL) as Array<
        keyof typeof TIER_FOR_LEVEL
      >) {
        const derived = deriveRemainingToTier(TIER_FOR_LEVEL[level], {
          paidClubBase: base,
          paymentBase: base,
          paidClubs: 0,
          totalPayments: 0,
          distinguishedClubs: 0,
        })
        expect
          .soft(derived.paymentsRemaining, `base=${base} ${level} payments`)
          .toBe(targets[level])
        expect
          .soft(derived.paidClubsRemaining, `base=${base} ${level} paidClubs`)
          .toBe(targets[level])
      }
    }
  })

  it('minimum-tier targets agree: DistinguishedDistrictCalculator ↔ TargetCalculator', () => {
    const calculator = new DistinguishedDistrictCalculator()
    for (const base of SWEEP) {
      const status = calculator.calculate(zeroCurrentRanking(base))
      expect
        .soft(status.distinguishedClubsRemaining, `base=${base} distinguished`)
        .toBe(calculatePercentageTargets(base).distinguished)
      expect
        .soft(status.paymentsRemaining, `base=${base} payments`)
        .toBe(calculateGrowthTargets(base).distinguished)
      expect
        .soft(status.paidClubsRemaining, `base=${base} paidClubs`)
        .toBe(calculateGrowthTargets(base).distinguished)
    }
  })

  it('division DDP distinguished-clubs requirements agree with TargetCalculator (45/50/55)', () => {
    for (const base of SWEEP) {
      const targets = calculatePercentageTargets(base)
      const gaps = calculateDivisionGapAnalysis({
        clubBase: base,
        paidClubs: base, // no-net-loss met → gaps are pure requirements
        distinguishedClubs: 0,
      })
      expect
        .soft(gaps.distinguishedGap.distinguishedClubsNeeded, `base=${base} D`)
        .toBe(targets.distinguished)
      expect
        .soft(gaps.selectGap.distinguishedClubsNeeded, `base=${base} S`)
        .toBe(targets.select)
      expect
        .soft(gaps.presidentsGap.distinguishedClubsNeeded, `base=${base} P`)
        .toBe(targets.presidents)
      expect
        .soft(calculateDivisionDistinguishedRequirement(base), `base=${base}`)
        .toBe(targets.distinguished)
    }
  })
})
