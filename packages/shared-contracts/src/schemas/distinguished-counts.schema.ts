/**
 * Zod contract for `distinguishedCounts` (#2553, epic #2555).
 *
 * Red stub: the shape is declared, the schema accepts nothing yet.
 *
 * @module distinguished-counts.schema
 */

import { z } from 'zod'

export interface DistinguishedTierCount {
  confirmed: number
  provisional: number
}

export interface DistinguishedCounts {
  confirmed: number
  provisional: number
  byTier: {
    distinguished: DistinguishedTierCount
    select: DistinguishedTierCount
    presidents: DistinguishedTierCount
    smedley: DistinguishedTierCount
  }
}

export const DistinguishedCountsSchema = z.custom<DistinguishedCounts>(
  () => false
)
