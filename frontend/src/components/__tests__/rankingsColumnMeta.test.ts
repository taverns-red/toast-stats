/**
 * Landing rankings column model (#2689, #2676 spec §4.1 test 3): every column
 * has a group, size and default; District, Rank and Score are always shown;
 * and the default set at each width fits that width's budget, so "defaults
 * fit" is a pure-function check rather than a layout guess.
 */

import { describe, it, expect } from 'vitest'
import {
  ALWAYS_SHOWN_RANKINGS_IDS,
  BREAKPOINT_TIERS,
  DISTRICT_MIN_SIZE,
  RANKINGS_COLUMN_IDS,
  TIER_BUDGET_PX,
  rankingsColumnMeta,
  rankingsTierDefaults,
} from '../rankingsColumnMeta'
import { rankingsColumns } from '../rankingsColumns'

describe('rankingsColumnMeta', () => {
  it('describes exactly the columns the table defines, in order', () => {
    expect(rankingsColumns.map(c => c.id)).toEqual([...RANKINGS_COLUMN_IDS])
    for (const column of rankingsColumns) {
      expect(column.header).toBe(
        rankingsColumnMeta[column.id as keyof typeof rankingsColumnMeta].label
      )
    }
  })

  it('gives every column a group, hint and size', () => {
    for (const id of RANKINGS_COLUMN_IDS) {
      const meta = rankingsColumnMeta[id]
      expect(meta.group, id).toMatch(/^(ranking|metrics)$/)
      expect(meta.hint.length, id).toBeGreaterThan(0)
      expect(meta.size, id).toBeGreaterThan(0)
    }
  })

  it('always shows District, Rank and Score', () => {
    expect([...ALWAYS_SHOWN_RANKINGS_IDS].sort()).toEqual([
      'district',
      'rank',
      'score',
    ])
    for (const tier of BREAKPOINT_TIERS) {
      const defaults = rankingsTierDefaults(tier)
      for (const id of ALWAYS_SHOWN_RANKINGS_IDS) {
        expect(defaults[id], `${tier} ${id}`).toBe(true)
      }
    }
  })

  it('picks the two score-driving metrics first at the narrowest width', () => {
    const tablet = rankingsTierDefaults('tablet')
    expect(tablet['clubs']).toBe(true)
    expect(tablet['payments']).toBe(true)
    expect(tablet['distinguished']).toBe(false)
    for (const tier of ['laptop', 'desktop', 'wide'] as const) {
      expect(rankingsTierDefaults(tier)['distinguished'], tier).toBe(true)
    }
  })

  it('fits the default set inside each width budget', () => {
    for (const tier of BREAKPOINT_TIERS) {
      const defaults = rankingsTierDefaults(tier)
      const fixed = RANKINGS_COLUMN_IDS.filter(
        id => id !== 'district' && defaults[id]
      ).reduce((sum, id) => sum + rankingsColumnMeta[id].size, 0)
      expect(
        fixed + DISTRICT_MIN_SIZE,
        `${tier}: ${fixed} + ${DISTRICT_MIN_SIZE}`
      ).toBeLessThanOrEqual(TIER_BUDGET_PX[tier])
    }
  })
})
