import type { HistoricalRankPoint } from '../types/districts'

export type RankCategory = 'overall' | 'clubs' | 'payments' | 'distinguished'

type TieFlags = Pick<
  HistoricalRankPoint,
  'clubsTied' | 'paymentsTied' | 'distinguishedTied'
>

/**
 * Whether every district had the same value in a category on this date, so
 * each one is rank 1 and the rank says nothing. Files without the flags read
 * as not tied (globalRankingsUtils.tiedYears.test.ts).
 *
 * The overall score is the sum of Borda points from the three category
 * ranks, so a tie in all three gives every district the same score.
 */
export function isRankTied(point: TieFlags, category: RankCategory): boolean {
  switch (category) {
    case 'clubs':
      return point.clubsTied === true
    case 'payments':
      return point.paymentsTied === true
    case 'distinguished':
      return point.distinguishedTied === true
    case 'overall':
      return (
        point.clubsTied === true &&
        point.paymentsTied === true &&
        point.distinguishedTied === true
      )
  }
}
