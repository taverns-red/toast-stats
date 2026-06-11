/**
 * DistinguishedDistrictCalculator (#332)
 *
 * Computes the four Distinguished District tiers from the Distinguished
 * District Program (Item 1490, Rev. 04/2025), with prerequisite gating
 * and gap analysis to the next tier.
 *
 * Tier thresholds:
 * - Distinguished:     ≥1% growth, 45% Distinguished, no net club loss
 * - Select:            ≥3% growth, 50% Distinguished, +1 net club minimum
 * - President's:       ≥5% growth, 55% Distinguished
 * - Smedley:           ≥8% growth, 60% Distinguished (new for 2025-2026)
 *
 * Prerequisites (all 5 must be Y for any tier):
 * - DSP submitted
 * - 85% Director training complete
 * - Market Analysis Plan submitted
 * - Communication Plan submitted
 * - 2+ Region Advisor meetings
 */

import type { DistrictRanking } from '@toastmasters/shared-contracts'
import {
  growthTarget,
  percentageTarget,
} from '../analytics/TargetCalculator.js'

/**
 * Distinguished District tier names.
 * Listed from lowest to highest. NotDistinguished means no tier earned.
 * Unknown (#1116 item 5, rules-reference §12.5) means the metrics earn a
 * tier but a prerequisite REQUIRED by that program year's rules is
 * unknowable from the data (column absent) — distinct from an explicit No.
 */
export type DistinguishedDistrictTier =
  | 'Unknown'
  | 'NotDistinguished'
  | 'Distinguished'
  | 'Select'
  | 'Presidents'
  | 'Smedley'

/**
 * The 5 prerequisites required for any Distinguished District tier.
 */
export interface DistinguishedDistrictPrerequisites {
  dspSubmitted: boolean
  trainingMet: boolean
  marketAnalysisSubmitted: boolean
  communicationPlanSubmitted: boolean
  regionAdvisorVisitMet: boolean
}

/**
 * Gap analysis showing the distance from current state to a target tier.
 * Positive gap = how much improvement needed.
 */
export interface DistinguishedDistrictGap {
  tier: DistinguishedDistrictTier
  /** Additional payment growth % needed (0 if already met) */
  paymentGrowthGap: number
  /** Additional club growth % needed (0 if already met) */
  clubGrowthGap: number
  /** Additional Distinguished % needed (0 if already met) */
  distinguishedPercentGap: number
  /** Additional net club growth needed (0 if already met) */
  netClubGrowthGap: number
  /**
   * Program-year baseline values, propagated from the source ranking so
   * downstream UIs can derive concrete-unit gaps from the percentages
   * (#555). The TI DDP rule (Item 1490) measures growth as
   * `(current - base) / base × 100`, so the base is the multiplier the
   * UI needs to translate "+1.9%" into "+108 payments". Optional during
   * rollout — older snapshots may omit these and consumers gracefully
   * degrade to displaying only the percentage.
   */
  paidClubBase?: number
  paymentBase?: number
}

/**
 * Per-district Distinguished District status.
 */
export interface DistinguishedDistrictStatus {
  districtId: string
  /** The highest tier currently earned */
  currentTier: DistinguishedDistrictTier
  /** Whether all 5 prerequisites are met */
  allPrerequisitesMet: boolean
  /** Per-prerequisite breakdown for the checklist UI */
  prerequisites: DistinguishedDistrictPrerequisites
  /** Gap to the next higher tier (null if at Smedley) */
  nextTierGap: DistinguishedDistrictGap | null
  /**
   * Signed actual net change in paid clubs this program year
   * (`paidClubs − paidClubBase`). Distinct from `nextTierGap`'s
   * `netClubGrowthGap`, which is the clamped distance to the next tier's
   * net-growth rule (`max(0, required − netChange)`) and can never be
   * negative. A shrinking district has a negative `netClubGrowth` but a
   * positive `netClubGrowthGap` — conflating the two made D48 (79 → 71)
   * render as +8 "growth" (#684).
   */
  netClubGrowth: number
  /**
   * Absolute counts remaining to reach the *minimum* (Distinguished)
   * tier, for the three headline metrics Amy tracks (#686, epic #683 F4).
   * Each is `max(0, target − current)` where the target is derived from
   * the Distinguished `TIER_THRESHOLDS` entry — the same thresholds
   * `meetsThreshold` uses — so a count of 0 means that metric's minimum
   * is met (it does NOT, on its own, mean the tier is earned: the other
   * metrics and the 5 prerequisites still gate). Always relative to the
   * minimum tier, not `nextTierGap` (which tracks the *next* tier above
   * the current one). The percentage-point gaps live on `nextTierGap`;
   * these are the concrete counts (#684 distinguished % uses paidClubBase
   * as the denominator, not activeClubs — lesson 60).
   */
  paymentsRemaining: number
  paidClubsRemaining: number
  distinguishedClubsRemaining: number
}

// ========== Tier Thresholds ==========

interface TierThreshold {
  tier: Exclude<DistinguishedDistrictTier, 'NotDistinguished'>
  paymentGrowthMin: number
  clubGrowthMin: number
  distinguishedPercentMin: number
  /**
   * Net club growth requirement:
   *  - 'no-loss' = paidClubs >= paidClubBase
   *  - 'plus-one' = paidClubs >= paidClubBase + 1
   *  - 'none' = no net growth requirement
   */
  netGrowthRule: 'no-loss' | 'plus-one' | 'none'
}

/**
 * Tier thresholds in ascending order. Order matters for tier matching:
 * we check from highest to lowest and award the first one that qualifies.
 */
/**
 * Per-program-year ruleset (#1116 item 5).
 *
 * Empirical basis: TI's all-districts CSV exports carried ONLY the `DSP`
 * and `Training` prerequisite columns from 2017 through 2024-25; the
 * Market Analysis / Communication Plan / Region Advisor Visit columns
 * (and the Smedley tier) first appear in the 2025-26 program year. A
 * year's tier can only be gated on prerequisites that existed that year.
 *
 * Historical tier thresholds: pending confirmation from the DRP rules
 * research (item 1490 revisions); until a sourced per-era table lands,
 * pre-2025-26 years use the same 1/3/5% + 45/50/55% model minus Smedley.
 */
interface YearRuleset {
  requiredPrerequisites: ReadonlyArray<keyof DistinguishedDistrictPrerequisites>
  tiers: ReadonlyArray<TierThreshold>
}

const TIER_THRESHOLDS: TierThreshold[] = [
  {
    tier: 'Smedley',
    paymentGrowthMin: 8,
    clubGrowthMin: 8,
    distinguishedPercentMin: 60,
    netGrowthRule: 'none',
  },
  {
    tier: 'Presidents',
    paymentGrowthMin: 5,
    clubGrowthMin: 5,
    distinguishedPercentMin: 55,
    netGrowthRule: 'none',
  },
  {
    tier: 'Select',
    paymentGrowthMin: 3,
    clubGrowthMin: 3,
    distinguishedPercentMin: 50,
    netGrowthRule: 'plus-one',
  },
  {
    tier: 'Distinguished',
    paymentGrowthMin: 1,
    clubGrowthMin: 1,
    distinguishedPercentMin: 45,
    netGrowthRule: 'no-loss',
  },
]

const CURRENT_RULESET: YearRuleset = {
  requiredPrerequisites: [
    'dspSubmitted',
    'trainingMet',
    'marketAnalysisSubmitted',
    'communicationPlanSubmitted',
    'regionAdvisorVisitMet',
  ],
  tiers: TIER_THRESHOLDS,
}

const PRE_2025_RULESET: YearRuleset = {
  requiredPrerequisites: ['dspSubmitted', 'trainingMet'],
  tiers: TIER_THRESHOLDS.filter(t => t.tier !== 'Smedley'),
}

/**
 * Resolve the ruleset for a program year ("YYYY-YYYY"). Unknown or
 * missing input falls back to the current rules (the daily pipeline's
 * behavior before #1116).
 */
function rulesetForProgramYear(programYear?: string): YearRuleset {
  if (!programYear) return CURRENT_RULESET
  const startYear = Number.parseInt(programYear.slice(0, 4), 10)
  if (Number.isNaN(startYear)) return CURRENT_RULESET
  return startYear >= 2025 ? CURRENT_RULESET : PRE_2025_RULESET
}

export class DistinguishedDistrictCalculator {
  /**
   * Calculate Distinguished District status for a single district.
   *
   * @param ranking - the district's metrics for the snapshot date
   * @param _programYear - the program year the snapshot belongs to
   *   ("YYYY-YYYY"). Determines which year's ruleset applies (#1116
   *   item 5). Omitted → current (2025-26) rules.
   */
  calculate(
    ranking: DistrictRanking,
    programYear?: string
  ): DistinguishedDistrictStatus {
    const ruleset = rulesetForProgramYear(programYear)

    // Tri-state per prerequisite: true / false / undefined (column absent
    // from that year's export — unknowable, NOT the same as an explicit N).
    const raw: Record<
      keyof DistinguishedDistrictPrerequisites,
      boolean | undefined
    > = {
      dspSubmitted: ranking.dspSubmitted,
      trainingMet: ranking.trainingMet,
      marketAnalysisSubmitted: ranking.marketAnalysisSubmitted,
      communicationPlanSubmitted: ranking.communicationPlanSubmitted,
      regionAdvisorVisitMet: ranking.regionAdvisorVisitMet,
    }
    // Display breakdown keeps the legacy 5-boolean shape (checklist UI);
    // gating below uses the tri-state + the year's required set only.
    const prerequisites: DistinguishedDistrictPrerequisites = {
      dspSubmitted: raw.dspSubmitted ?? false,
      trainingMet: raw.trainingMet ?? false,
      marketAnalysisSubmitted: raw.marketAnalysisSubmitted ?? false,
      communicationPlanSubmitted: raw.communicationPlanSubmitted ?? false,
      regionAdvisorVisitMet: raw.regionAdvisorVisitMet ?? false,
    }

    const required = ruleset.requiredPrerequisites
    const allPrerequisitesMet = required.every(k => raw[k] === true)
    const anyRequiredNo = required.some(k => raw[k] === false)

    const earnedTier = this.determineTier(ranking, ruleset.tiers)
    let currentTier: DistinguishedDistrictTier
    if (earnedTier === 'NotDistinguished') {
      // Metrics earn nothing — prerequisites are moot (§12.5 Unknown is
      // only for "tier otherwise earned but eligibility undeterminable").
      currentTier = 'NotDistinguished'
    } else if (allPrerequisitesMet) {
      currentTier = earnedTier
    } else if (anyRequiredNo) {
      currentTier = 'NotDistinguished'
    } else {
      currentTier = 'Unknown'
    }

    // Gap analysis is metric-based: for Unknown, measure from the tier the
    // metrics earned so the UI still shows a meaningful next-tier distance.
    const gapBasis = currentTier === 'Unknown' ? earnedTier : currentTier
    const nextTierGap = this.computeNextTierGap(
      gapBasis,
      ranking,
      ruleset.tiers
    )
    const remaining = this.computeRemainingToMinimum(ranking)

    return {
      districtId: ranking.districtId,
      currentTier,
      allPrerequisitesMet,
      prerequisites,
      nextTierGap,
      netClubGrowth: ranking.paidClubs - ranking.paidClubBase,
      ...remaining,
    }
  }

  /**
   * Calculate Distinguished District status for all districts, keyed by ID.
   */
  calculateAll(
    rankings: DistrictRanking[],
    programYear?: string
  ): Record<string, DistinguishedDistrictStatus> {
    const result: Record<string, DistinguishedDistrictStatus> = {}
    for (const ranking of rankings) {
      result[ranking.districtId] = this.calculate(ranking, programYear)
    }
    return result
  }

  // ========== Private helpers ==========

  /**
   * Determine the highest tier earned on metrics alone (prerequisites are
   * gated by the caller), within the given year's tier set.
   */
  private determineTier(
    ranking: DistrictRanking,
    tiers: ReadonlyArray<TierThreshold> = TIER_THRESHOLDS
  ): DistinguishedDistrictTier {
    for (const threshold of tiers) {
      if (this.meetsThreshold(ranking, threshold)) {
        return threshold.tier
      }
    }
    return 'NotDistinguished'
  }

  /**
   * Check if a district meets a specific tier's thresholds.
   */
  private meetsThreshold(
    ranking: DistrictRanking,
    threshold: TierThreshold
  ): boolean {
    if (ranking.paymentGrowthPercent < threshold.paymentGrowthMin) return false
    if (ranking.clubGrowthPercent < threshold.clubGrowthMin) return false
    if (ranking.distinguishedPercent < threshold.distinguishedPercentMin)
      return false
    return this.meetsNetGrowthRule(ranking, threshold.netGrowthRule)
  }

  private meetsNetGrowthRule(
    ranking: DistrictRanking,
    rule: 'no-loss' | 'plus-one' | 'none'
  ): boolean {
    const netChange = ranking.paidClubs - ranking.paidClubBase
    switch (rule) {
      case 'no-loss':
        return netChange >= 0
      case 'plus-one':
        return netChange >= 1
      case 'none':
        return true
    }
  }

  /**
   * Compute gap analysis to the next higher tier.
   * Returns null if at Smedley (highest tier).
   */
  private computeNextTierGap(
    currentTier: DistinguishedDistrictTier,
    ranking: DistrictRanking,
    tiers: ReadonlyArray<TierThreshold> = TIER_THRESHOLDS
  ): DistinguishedDistrictGap | null {
    const nextTier = this.getNextTier(currentTier)
    if (nextTier === null) return null

    // The next tier must exist in this year's tier set — pre-2025-26 the
    // tier above Presidents is nothing, not Smedley.
    const threshold = tiers.find(t => t.tier === nextTier)
    if (!threshold) return null

    const netChange = ranking.paidClubs - ranking.paidClubBase
    const requiredNetChange = this.requiredNetGrowth(threshold.netGrowthRule)

    return {
      tier: nextTier,
      paymentGrowthGap: Math.max(
        0,
        threshold.paymentGrowthMin - ranking.paymentGrowthPercent
      ),
      clubGrowthGap: Math.max(
        0,
        threshold.clubGrowthMin - ranking.clubGrowthPercent
      ),
      distinguishedPercentGap: Math.max(
        0,
        threshold.distinguishedPercentMin - ranking.distinguishedPercent
      ),
      netClubGrowthGap: Math.max(0, requiredNetChange - netChange),
      paidClubBase: ranking.paidClubBase,
      paymentBase: ranking.paymentBase,
    }
  }

  /**
   * Returns the next tier above the given one, or null if at Smedley.
   */
  private getNextTier(
    tier: DistinguishedDistrictTier
  ):
    | Exclude<DistinguishedDistrictTier, 'NotDistinguished' | 'Smedley'>
    | 'Smedley'
    | null {
    switch (tier) {
      case 'Unknown':
      case 'NotDistinguished':
        return 'Distinguished'
      case 'Distinguished':
        return 'Select'
      case 'Select':
        return 'Presidents'
      case 'Presidents':
        return 'Smedley'
      case 'Smedley':
        return null
    }
  }

  private requiredNetGrowth(rule: 'no-loss' | 'plus-one' | 'none'): number {
    switch (rule) {
      case 'no-loss':
        return 0
      case 'plus-one':
        return 1
      case 'none':
        return 0
    }
  }

  /**
   * Absolute counts remaining to the *minimum* (Distinguished) tier (#686).
   * Targets are derived from the Distinguished `TIER_THRESHOLDS` entry so
   * they track the same rule `meetsThreshold` enforces — a count of 0 means
   * that metric's Distinguished minimum is satisfied.
   *
   *   payments   target = ceil(paymentBase × (100 + paymentGrowthMin) / 100)
   *   paidClubs  target = ceil(paidClubBase × (100 + clubGrowthMin) / 100)
   *   distinguished target = ceil(paidClubBase × distinguishedPercentMin / 100)
   *
   * Integer-safe form via the shared TargetCalculator helpers (#798, #1126).
   *
   * Distinguished % uses `paidClubBase` as the denominator, not
   * `activeClubs` (TI DDP Item 1490; lesson 60). `Math.ceil` because the
   * thresholds are minimums — you must reach the next whole unit.
   */
  private computeRemainingToMinimum(ranking: DistrictRanking): {
    paymentsRemaining: number
    paidClubsRemaining: number
    distinguishedClubsRemaining: number
  } {
    const min = TIER_THRESHOLDS.find(t => t.tier === 'Distinguished')
    // TIER_THRESHOLDS always contains Distinguished; guard keeps TS happy.
    if (!min) {
      return {
        paymentsRemaining: 0,
        paidClubsRemaining: 0,
        distinguishedClubsRemaining: 0,
      }
    }

    const paymentTarget = growthTarget(
      ranking.paymentBase,
      min.paymentGrowthMin
    )
    const paidClubTarget = growthTarget(ranking.paidClubBase, min.clubGrowthMin)
    const distinguishedTarget = percentageTarget(
      ranking.paidClubBase,
      min.distinguishedPercentMin
    )

    return {
      paymentsRemaining: Math.max(0, paymentTarget - ranking.totalPayments),
      paidClubsRemaining: Math.max(0, paidClubTarget - ranking.paidClubs),
      distinguishedClubsRemaining: Math.max(
        0,
        distinguishedTarget - ranking.distinguishedClubs
      ),
    }
  }
}
