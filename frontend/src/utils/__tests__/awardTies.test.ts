/* Top-3 award ties (#1610). TI names three winners per award but does not
   publish its tie-break; the calculator gives tied districts a shared rank,
   so a tie can produce more than three co-winners. These helpers identify
   them so the UI can label them honestly instead of inventing an order. */

import { describe, it, expect } from 'vitest'
import { tiedWinnerIds, TIE_BREAK_UNPUBLISHED } from '../awardTies'
import type { CompetitiveAwardRanking } from '../../services/cdn'

const entry = (
  districtId: string,
  rank: number,
  value: number,
  isWinner: boolean
): CompetitiveAwardRanking => ({
  districtId,
  districtName: `District ${districtId}`,
  region: '1',
  rank,
  value,
  isWinner,
})

describe('tiedWinnerIds (#1610)', () => {
  it('returns every winner that shares its rank with another district', () => {
    // 2025-26 Retention shape: five districts at 100% all share rank 1
    const entries = [
      entry('93', 1, 100, true),
      entry('49', 1, 100, true),
      entry('104', 1, 100, true),
      entry('17', 1, 100, true),
      entry('73', 1, 100, true),
      entry('110', 6, 98.6, false),
    ]
    expect([...tiedWinnerIds(entries)].sort()).toEqual(
      ['104', '17', '49', '73', '93'].sort()
    )
  })

  it('flags a tie straddling 3rd place but not the untied winners above it', () => {
    const entries = [
      entry('109', 1, 18, true),
      entry('94', 2, 17.5, true),
      entry('130', 3, 17, true),
      entry('89', 3, 17, true),
      entry('88', 5, 15, false),
    ]
    expect([...tiedWinnerIds(entries)].sort()).toEqual(['130', '89'])
  })

  it('returns nothing when winners have distinct ranks', () => {
    const entries = [
      entry('1', 1, 10, true),
      entry('2', 2, 9, true),
      entry('3', 3, 8, true),
      entry('4', 4, 7, false),
    ]
    expect(tiedWinnerIds(entries).size).toBe(0)
  })

  it('ignores ties among non-winners', () => {
    const entries = [
      entry('1', 1, 10, true),
      entry('2', 2, 5, false),
      entry('3', 2, 5, false),
    ]
    expect(tiedWinnerIds(entries).size).toBe(0)
  })

  it('names the unpublished tie-break without inventing one', () => {
    expect(TIE_BREAK_UNPUBLISHED).toBe("TI's tie-break isn't published")
  })
})
