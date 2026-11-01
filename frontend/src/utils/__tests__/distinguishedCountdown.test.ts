import { describe, it, expect } from 'vitest'
import {
  getDistinguishedCountdown,
  deriveRemainingToMinimum,
  deriveRemainingToTier,
  deriveRemainingByTier,
  type DistinguishedCountdown,
  type RemainingInputs,
} from '../distinguishedCountdown'
import type {
  CompetitiveAwardStandings,
  DistinguishedDistrictStatus,
} from '../../services/cdn'

/* Unit tests for the per-district countdown helper used by the Region
   page. As of #688 (epic #683 F4) the three numeric metrics render the
   ABSOLUTE count remaining to the *minimum* Distinguished tier — paid
   clubs / payments / distinguished clubs — not the percentage-point gap
   they used to show. Two officer-award booleans are unchanged.

   Data source (lesson 103 — derive the countdown from the same gate):
   - prefer the canonical `*Remaining` fields (#686, post-pipeline);
   - else derive from the rankings row's base + current counts with the
     SAME formula the analytics calculator uses. Deriving from the raw
     integer counts (not TI's pre-rounded growth %) makes the derived
     value match the canonical analytics field EXACTLY — verified below
     against real prod districts where a %-based derivation drifts ±1. */

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
  nextTierGap: null,
  ...overrides,
})

// Real prod (2026-05-23) rankings rows. The canonical analytics
// `*Remaining` values are clubs/payments/dist = (12,277,14) for D47 etc.
const D47: RemainingInputs = {
  paidClubBase: 148,
  paidClubs: 138,
  paymentBase: 6738,
  totalPayments: 6529,
  distinguishedClubs: 53,
}

describe('deriveRemainingToMinimum — matches the canonical analytics field (#688 #686)', () => {
  it('reproduces the canonical counts exactly for real prod districts where %-based derivation drifts', () => {
    // D47, D21, D33, D64: canonical payments = 277 / 1032 / 516 / 264.
    // A gap-%-based derivation gives 277 / 1031 / 515 / 265 (±1). The
    // count-based derivation below matches the canonical field exactly.
    expect(deriveRemainingToMinimum(D47)).toEqual({
      paidClubsRemaining: 12,
      paymentsRemaining: 277,
      distinguishedClubsRemaining: 14,
    })
    expect(
      deriveRemainingToMinimum({
        paidClubBase: 191,
        paidClubs: 163,
        paymentBase: 7125,
        totalPayments: 6165,
        distinguishedClubs: 52,
      }).paymentsRemaining
    ).toBe(1032)
    expect(
      deriveRemainingToMinimum({
        paidClubBase: 126,
        paidClubs: 99,
        paymentBase: 3705,
        totalPayments: 3227,
        distinguishedClubs: 16,
      }).paymentsRemaining
    ).toBe(516)
  })

  it('clamps to 0 when a metric minimum is already met or exceeded', () => {
    expect(
      deriveRemainingToMinimum({
        paidClubBase: 100,
        paidClubs: 120,
        paymentBase: 5000,
        totalPayments: 6000,
        distinguishedClubs: 60,
      })
    ).toEqual({
      paidClubsRemaining: 0,
      paymentsRemaining: 0,
      distinguishedClubsRemaining: 0,
    })
  })
})

describe('deriveRemainingToTier — same gate, any tier (#840)', () => {
  /* Generalises deriveRemainingToMinimum to all four tiers above
     NotDistinguished. Targets/denominators must match the analytics-core
     TIER_THRESHOLDS row exactly — same gate the tier badge counts down
     to. Lesson 103. */

  // paidClubBase 161, paidClubs 152, paymentBase 5605, totalPayments 5493,
  // distinguishedClubs 53 — D61-ish synthetic where the bug renders 19 and
  // the canonical computation renders 20 distinguished clubs to go.
  const D61: RemainingInputs = {
    paidClubBase: 161,
    paidClubs: 152,
    paymentBase: 5605,
    totalPayments: 5493,
    distinguishedClubs: 53,
  }

  it('matches deriveRemainingToMinimum when tier is Distinguished', () => {
    expect(deriveRemainingToTier('Distinguished', D61)).toEqual(
      deriveRemainingToMinimum(D61)
    )
  })

  it('counts down to the Distinguished gate (+1% growth, 45% distinguished)', () => {
    // paid:    ceil(161 × 1.01) − 152 = 163 − 152 = 11
    // payments: ceil(5605 × 1.01) − 5493 = 5662 − 5493 = 169
    // dist:    ceil(161 × 0.45) − 53 = 73 − 53 = 20  ← the canonical 20, not the rounded-% 19.
    expect(deriveRemainingToTier('Distinguished', D61)).toEqual({
      paidClubsRemaining: 11,
      paymentsRemaining: 169,
      distinguishedClubsRemaining: 20,
    })
  })

  it('counts down to the Select gate (+3% growth, 50% distinguished, plus-one)', () => {
    // paid:    ceil(161 × 1.03) − 152 = 166 − 152 = 14
    // payments: ceil(5605 × 1.03) − 5493 = 5774 − 5493 = 281
    // dist:    ceil(161 × 0.50) − 53 = 81 − 53 = 28
    expect(deriveRemainingToTier('Select', D61)).toEqual({
      paidClubsRemaining: 14,
      paymentsRemaining: 281,
      distinguishedClubsRemaining: 28,
    })
  })

  it('counts down to the Presidents gate (+5% growth, 55% distinguished)', () => {
    // paid:    ceil(161 × 1.05) − 152 = 170 − 152 = 18
    // payments: ceil(5605 × 1.05) − 5493 = 5886 − 5493 = 393
    // dist:    ceil(161 × 0.55) − 53 = 89 − 53 = 36
    expect(deriveRemainingToTier('Presidents', D61)).toEqual({
      paidClubsRemaining: 18,
      paymentsRemaining: 393,
      distinguishedClubsRemaining: 36,
    })
  })

  it('counts down to the Smedley gate (+8% growth, 60% distinguished)', () => {
    // paid:    ceil(161 × 1.08) − 152 = 174 − 152 = 22
    // payments: ceil(5605 × 1.08) − 5493 = 6054 − 5493 = 561
    // dist:    ceil(161 × 0.60) − 53 = 97 − 53 = 44
    expect(deriveRemainingToTier('Smedley', D61)).toEqual({
      paidClubsRemaining: 22,
      paymentsRemaining: 561,
      distinguishedClubsRemaining: 44,
    })
  })

  it('clamps to 0 once the tier-specific minimum is met', () => {
    expect(
      deriveRemainingToTier('Distinguished', {
        paidClubBase: 100,
        paidClubs: 120,
        paymentBase: 5000,
        totalPayments: 6000,
        distinguishedClubs: 60,
      })
    ).toEqual({
      paidClubsRemaining: 0,
      paymentsRemaining: 0,
      distinguishedClubsRemaining: 0,
    })
  })
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

  it('derives counts from the rankings row when canonical fields are absent (pre-pipeline) — D47 payments = 277', () => {
    const awards = mkAwards(ddStatus({ districtId: '47' }), false, false)
    const c = getDistinguishedCountdown('47', awards, D47)
    expect(c!.paymentsRemaining).toEqual({ kind: 'count', value: 277 })
    expect(c!.paidClubsRemaining).toEqual({ kind: 'count', value: 12 })
    expect(c!.distinguishedClubsRemaining).toEqual({ kind: 'count', value: 14 })
  })

  it('canonical field wins over the rankings-derived fallback when both are present', () => {
    const awards = mkAwards(
      ddStatus({ districtId: '47', paymentsRemaining: 300 }),
      false,
      false
    )
    const c = getDistinguishedCountdown('47', awards, D47)
    // 300 (canonical) not 277 (derived).
    expect(c!.paymentsRemaining).toEqual({ kind: 'count', value: 300 })
  })

  it('derives met for a district already at or above the minimum (no canonical field)', () => {
    const awards = mkAwards(ddStatus({ currentTier: 'Select' }), true, true)
    const c = getDistinguishedCountdown('61', awards, {
      paidClubBase: 100,
      paidClubs: 130,
      paymentBase: 5000,
      totalPayments: 6500,
      distinguishedClubs: 70,
    })
    expect(c!.paidClubsRemaining).toEqual({ kind: 'met' })
    expect(c!.paymentsRemaining).toEqual({ kind: 'met' })
    expect(c!.distinguishedClubsRemaining).toEqual({ kind: 'met' })
  })

  it('returns null cells when there is neither a canonical field nor a rankings row', () => {
    const awards = mkAwards(ddStatus(), false, false)
    const c = getDistinguishedCountdown('61', awards)
    expect(c!.paidClubsRemaining).toBeNull()
    expect(c!.paymentsRemaining).toBeNull()
    expect(c!.distinguishedClubsRemaining).toBeNull()
  })

  it('returns null when the district has no Distinguished District status entry', () => {
    const awards = mkAwards(undefined, false, false)
    expect(getDistinguishedCountdown('61', awards, D47)).toBeNull()
  })

  it('returns null when awards is null (legacy snapshot)', () => {
    const c: DistinguishedCountdown | null = getDistinguishedCountdown(
      '61',
      null,
      D47
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

/* #798 float-overshoot survivors (#1126 C5): the tier targets must use
   integer-percent arithmetic. `ceil(100 * (55/100))` = 56 under floats;
   55% of 100 is exactly 55. Must agree with the canonical
   analytics-core calculators (see recognitionTargetParity.test.ts). */
describe('integer-safe tier targets (#1126, #798)', () => {
  const zeroed = (
    overrides: Partial<RemainingInputs> = {}
  ): RemainingInputs => ({
    paidClubBase: 0,
    paymentBase: 0,
    paidClubs: 0,
    totalPayments: 0,
    distinguishedClubs: 0,
    ...overrides,
  })

  it('Presidents distinguished-clubs target at base 100 is exactly 55', () => {
    const r = deriveRemainingToTier('Presidents', zeroed({ paidClubBase: 100 }))
    expect(r.distinguishedClubsRemaining).toBe(55)
  })

  it('Presidents distinguished-clubs target at base 200 is exactly 110', () => {
    const r = deriveRemainingToTier('Presidents', zeroed({ paidClubBase: 200 }))
    expect(r.distinguishedClubsRemaining).toBe(110)
  })

  it('Smedley payment target at base 225 is exactly 243 (8% growth)', () => {
    const r = deriveRemainingToTier('Smedley', zeroed({ paymentBase: 225 }))
    expect(r.paymentsRemaining).toBe(243)
  })
})

/* Gap at every tier (#2426): the trophy case lists Distinguished → Smedley,
   each with what it still needs, under the program year's own Item 1490
   ladder (analytics-core `remainingToDistrictTier`, #2307). */
describe('deriveRemainingByTier — every tier, not just the next (#2426)', () => {
  // Real prod rankings row, D61 on 2026-10-31 (all-districts-rankings.json).
  // competitive-awards.json for the same date carries the canonical
  // Distinguished counts 21 / 2390 / 69.
  const D61_2026_10_31: RemainingInputs = {
    paidClubBase: 158,
    paymentBase: 5886,
    paidClubs: 139,
    totalPayments: 3555,
    distinguishedClubs: 3,
  }

  it('lists every 2026-27 tier, lowest first, with each metric still needed (real D61)', () => {
    // Item 1490 (2025-26+): clubs and payments +1/+3/+5/+8% over base,
    // Distinguished clubs 45/50/55/60% of the club base, targets rounded up.
    // Clubs 160/163/166/171, payments 5945/6063/6181/6357,
    // Distinguished clubs 72/79/87/95.
    expect(deriveRemainingByTier('2026-2027', D61_2026_10_31)).toEqual([
      {
        tier: 'Distinguished',
        paidClubsRemaining: 21,
        paymentsRemaining: 2390,
        distinguishedClubsRemaining: 69,
        met: false,
      },
      {
        tier: 'Select',
        paidClubsRemaining: 24,
        paymentsRemaining: 2508,
        distinguishedClubsRemaining: 76,
        met: false,
      },
      {
        tier: 'Presidents',
        paidClubsRemaining: 27,
        paymentsRemaining: 2626,
        distinguishedClubsRemaining: 84,
        met: false,
      },
      {
        tier: 'Smedley',
        paidClubsRemaining: 32,
        paymentsRemaining: 2802,
        distinguishedClubsRemaining: 92,
        met: false,
      },
    ])
  })

  it('marks a tier met only when all three metrics are at zero', () => {
    const rows = deriveRemainingByTier('2026-2027', {
      ...D61_2026_10_31,
      paidClubs: 170,
      totalPayments: 6400,
      distinguishedClubs: 90,
    })!
    expect(rows.map(r => [r.tier, r.met])).toEqual([
      ['Distinguished', true],
      ['Select', true],
      ['Presidents', true],
      ['Smedley', false],
    ])
    const smedley = rows[3]!
    expect(smedley.paidClubsRemaining).toBe(1)
    expect(smedley.paymentsRemaining).toBe(0)
    expect(smedley.distinguishedClubsRemaining).toBe(5)
  })

  it('prefers the canonical Distinguished counts for the Distinguished row only (lesson 103)', () => {
    const rows = deriveRemainingByTier('2026-2027', D61_2026_10_31, {
      paidClubsRemaining: 20,
      paymentsRemaining: 2389,
      distinguishedClubsRemaining: 68,
    })!
    expect(rows[0]).toMatchObject({
      paidClubsRemaining: 20,
      paymentsRemaining: 2389,
      distinguishedClubsRemaining: 68,
    })
    expect(rows[1]).toMatchObject({ paidClubsRemaining: 24 })
  })

  it("uses the year's own ladder: 2024-25 Select is net +1 club and 45%", () => {
    // Rev. 12/2022: Select = +3% payments, +1 net club, 45% Distinguished.
    const rows = deriveRemainingByTier('2024-2025', D61_2026_10_31)!
    const select = rows.find(r => r.tier === 'Select')!
    expect(select.paidClubsRemaining).toBe(159 - 139)
    expect(select.distinguishedClubsRemaining).toBe(72 - 3)
  })

  it('has no Smedley row before 2018-19', () => {
    const rows = deriveRemainingByTier('2017-2018', D61_2026_10_31)!
    expect(rows.map(r => r.tier)).toEqual([
      'Distinguished',
      'Select',
      'Presidents',
    ])
  })

  it('returns null for a district with no rankings data', () => {
    expect(deriveRemainingByTier('2026-2027', null)).toBeNull()
    expect(deriveRemainingByTier('2026-2027', undefined)).toBeNull()
  })
})
