/**
 * The district trophy case's badge for the President's Membership Retention
 * Award, our estimate (#1614).
 *
 * competitive-awards.json is read without schema validation, so the award is
 * treated as untrusted, the same way MembershipRetentionCard treats it: only
 * in-progress and final statuses produce a badge, and a row whose value,
 * retained, base or rank isn't a finite number is dropped (and left out of
 * the "of N" count). Older files without the key produce no badge.
 */
import type {
  CompetitiveAwardStandings,
  MembershipRetentionStanding,
} from '../services/cdn'
import { tiedWinnerIds } from './awardTies'

/** One district's place in the membership retention estimate (#1614). */
export interface MembershipRetentionBadge {
  rank: number
  /** Districts ranked; null when the file's rank is past that count. */
  of: number | null
  value: number
  isWinner: boolean
  /** True on the June 30 close; false while standings are so far. */
  final: boolean
  /** Shares a winning rank with another district (#1610). */
  tied: boolean
}

const isFiniteNumber = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n)

/** A standings row we can render: its numbers are real, finite numbers. */
export const isRenderableStanding = (
  row: unknown
): row is MembershipRetentionStanding => {
  if (typeof row !== 'object' || row === null) return false
  const r = row as Partial<MembershipRetentionStanding>
  return (
    isFiniteNumber(r.value) &&
    isFiniteNumber(r.retained) &&
    isFiniteNumber(r.base)
  )
}

export function membershipRetentionBadgeFor(
  standings: CompetitiveAwardStandings | null | undefined,
  districtId: string | undefined
): MembershipRetentionBadge | null {
  const award = standings?.membershipRetentionAward
  if (!award || !districtId) return null
  if (award.status !== 'in-progress' && award.status !== 'final') return null
  if (!Array.isArray(award.standings)) return null

  const rows = award.standings.filter(isRenderableStanding)
  const own = rows.find(r => r.districtId === districtId)
  if (!own || !isFiniteNumber(own.rank) || own.rank < 1) return null

  return {
    rank: own.rank,
    // "#7 of 5" would be wrong, so a rank past the rows we can render
    // drops the count.
    of: own.rank <= rows.length ? rows.length : null,
    value: own.value,
    isWinner: own.isWinner === true,
    final: award.status === 'final',
    tied: tiedWinnerIds(rows).has(districtId),
  }
}
