/**
 * Zod contract for `distinguishedCounts` (#2553, epic #2555): the one
 * confirmed / provisional Distinguished-club count every level carries
 * (world, region, district, division, area).
 *
 * Rules the shape encodes (Ron, 2026-11-08):
 * - **Confirmed is the headline.** For a district it equals the rankings'
 *   `distinguishedClubs`: TI's per-club 'Club Distinguished Status' once TI
 *   recognises clubs, and before that the clubs whose April renewals alone
 *   meet a rung (`countConfirmedDistinguishedClubs`).
 * - **Provisional is shown beside it, never added in.** It counts clubs that
 *   qualify on current membership but whose April renewals do not yet
 *   confirm that level, AND that are not confirmed at any level. The two
 *   sets are disjoint, so a club is never in both.
 * - **Tiers partition the totals.** `confirmed` = Σ `byTier[*].confirmed`
 *   and `provisional` = Σ `byTier[*].provisional`. A club sits in the tier of
 *   the level it is counted at (its confirmed level, or for a provisional
 *   club its provisional level).
 * - **Club base: every club on TI's club-performance report**, paid or not,
 *   the same base TI's own district count and the rankings use.
 *
 * Counts only: no club names, ids or person data.
 *
 * @module distinguished-counts.schema
 */

import { z } from 'zod'

const Count = z.number().int().nonnegative()

export const DistinguishedTierCountSchema = z
  .object({
    confirmed: Count,
    provisional: Count,
  })
  .strict()

export const DistinguishedCountsSchema = z
  .object({
    confirmed: Count,
    provisional: Count,
    byTier: z
      .object({
        distinguished: DistinguishedTierCountSchema,
        select: DistinguishedTierCountSchema,
        presidents: DistinguishedTierCountSchema,
        smedley: DistinguishedTierCountSchema,
      })
      .strict(),
  })
  .strict()
  .refine(
    c => {
      const tiers = Object.values(c.byTier)
      return (
        c.confirmed === tiers.reduce((n, t) => n + t.confirmed, 0) &&
        c.provisional === tiers.reduce((n, t) => n + t.provisional, 0)
      )
    },
    { message: 'confirmed and provisional must equal the sum of their tiers' }
  )

export type DistinguishedTierCount = z.infer<
  typeof DistinguishedTierCountSchema
>
export type DistinguishedCounts = z.infer<typeof DistinguishedCountsSchema>
