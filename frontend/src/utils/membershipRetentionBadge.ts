import type { CompetitiveAwardStandings } from '../services/cdn'

/** One district's place in the membership retention estimate (#1614). */
export interface MembershipRetentionBadge {
  rank: number
  /** Districts ranked */
  of: number
  value: number
  isWinner: boolean
  /** True on the June 30 close; false while standings are so far. */
  final: boolean
  /** Shares a winning rank with another district (#1610). */
  tied: boolean
}

export function membershipRetentionBadgeFor(
  _standings: CompetitiveAwardStandings | null | undefined,
  _districtId: string | undefined
): MembershipRetentionBadge | null {
  return null
}
