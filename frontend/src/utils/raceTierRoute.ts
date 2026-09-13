/**
 * `/clubs/race/:tier` routing (#1556).
 *
 * One REAL route per Distinguished tier (ADR-005 — never a client-side
 * tab). The slug set is closed and lower-case: an unknown slug resolves to
 * `null`, and the page throws the branded 404 rather than rendering an empty
 * race for a tier that does not exist.
 *
 * Titles use the real tier names plainly, including before April (ruling
 * R-B) — "Distinguished", not "met Distinguished requirements".
 */

import type { ClubRaceTier } from '@taverns-red/shared-contracts'

export interface RaceTierRoute {
  tier: ClubRaceTier
  slug: string
}

/** Lowest rung first — the order the race is read in. */
export const RACE_TIER_ROUTES: readonly RaceTierRoute[] = [
  { tier: 'Distinguished', slug: 'distinguished' },
  { tier: 'Select', slug: 'select' },
  { tier: 'President', slug: 'presidents' },
  { tier: 'Smedley', slug: 'smedley' },
]

const TIER_TITLES: Record<ClubRaceTier, string> = {
  Distinguished: 'Distinguished',
  Select: 'Select Distinguished',
  President: "President's Distinguished",
  Smedley: 'Smedley Distinguished',
}

export function raceTierFromSlug(
  slug: string | undefined
): ClubRaceTier | null {
  if (!slug) return null
  return RACE_TIER_ROUTES.find(route => route.slug === slug)?.tier ?? null
}

export function raceTierSlug(tier: ClubRaceTier): string {
  return RACE_TIER_ROUTES.find(route => route.tier === tier)!.slug
}

export function raceTierTitle(tier: ClubRaceTier): string {
  return TIER_TITLES[tier]
}

export function raceTierUrl(tier: ClubRaceTier): string {
  return `/clubs/race/${raceTierSlug(tier)}`
}
