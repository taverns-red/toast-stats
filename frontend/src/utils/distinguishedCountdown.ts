import type {
  CompetitiveAwardStandings,
  DistinguishedDistrictStatus,
} from '../services/cdn'

/* Per-district countdown to the *minimum* Distinguished District tier.
   Folds three absolute "remaining" counts (paid clubs, payments,
   distinguished clubs) + two officer-award booleans from the
   competitive-awards JSON into a uniform shape the table cell renderer
   can consume (#688, epic #683 F4).

   The three numeric metrics used to render the percentage-point gap to
   the next tier; Amy wants the absolute count remaining to the minimum
   (e.g. "277 payments to go"), so they now carry a `count`.

   Data source (lesson 103 — derive the countdown from the same gate it
   counts down to):
   - prefer the canonical `*Remaining` fields (#686, post-pipeline);
   - else derive from the gate's own clamped gap %: ceil(gap/100 × base).
     This is mathematically identical to the canonical field because the
     current counts are integers — ceil(base×(1+min/100) − current) =
     ceil(base×(1+min/100)) − current — so the column renders correctly
     on a pre-pipeline snapshot with zero drift from the analytics value. */

export type CountdownCell =
  | { kind: 'count'; value: number }
  | { kind: 'met' }
  | { kind: 'boolean'; met: boolean }

export interface DistinguishedCountdown {
  paidClubsRemaining: CountdownCell | null
  paymentsRemaining: CountdownCell | null
  distinguishedClubsRemaining: CountdownCell | null
  educationTraining: CountdownCell
  clubGrowth: CountdownCell
}

const countCell = (value: number): CountdownCell =>
  value <= 0 ? { kind: 'met' } : { kind: 'count', value }

/* Resolve one numeric "remaining to minimum Distinguished" cell.
   `canonical` is the #686 field (authoritative when present); `gap` and
   `base` are the gate's own clamped gap % and program-year base used to
   derive the same count on a pre-pipeline snapshot. Returns null (→ em-dash)
   only when the count truly can't be determined. */
const remainingCell = (
  canonical: number | undefined,
  currentTier: DistinguishedDistrictStatus['currentTier'],
  gap: number | undefined,
  base: number | undefined
): CountdownCell | null => {
  if (canonical !== undefined) return countCell(canonical)
  // Already at or above the Distinguished minimum: the metric is met.
  // nextTierGap here points at a HIGHER tier, so it must not be used to
  // derive a remaining-to-minimum count (lesson 103).
  if (currentTier !== 'NotDistinguished') return { kind: 'met' }
  if (gap !== undefined && base !== undefined) {
    return countCell(Math.ceil((gap / 100) * base))
  }
  return null
}

export function getDistinguishedCountdown(
  districtId: string,
  awards: CompetitiveAwardStandings | null
): DistinguishedCountdown | null {
  if (!awards) return null
  const status = awards.distinguishedDistrict?.[districtId]
  if (!status) return null

  const gap = status.nextTierGap
  const tier = status.currentTier

  const paidClubsRemaining = remainingCell(
    status.paidClubsRemaining,
    tier,
    gap?.clubGrowthGap,
    gap?.paidClubBase
  )
  const paymentsRemaining = remainingCell(
    status.paymentsRemaining,
    tier,
    gap?.paymentGrowthGap,
    gap?.paymentBase
  )
  const distinguishedClubsRemaining = remainingCell(
    status.distinguishedClubsRemaining,
    tier,
    gap?.distinguishedPercentGap,
    gap?.paidClubBase
  )

  const educationTraining: CountdownCell = {
    kind: 'boolean',
    met:
      awards.officerAwards?.educationTraining.find(
        e => e.districtId === districtId
      )?.qualifies ?? false,
  }
  const clubGrowth: CountdownCell = {
    kind: 'boolean',
    met:
      awards.officerAwards?.clubGrowth.find(c => c.districtId === districtId)
        ?.qualifies ?? false,
  }

  return {
    paidClubsRemaining,
    paymentsRemaining,
    distinguishedClubsRemaining,
    educationTraining,
    clubGrowth,
  }
}
