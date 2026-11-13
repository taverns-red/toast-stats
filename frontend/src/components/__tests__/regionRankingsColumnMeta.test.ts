/**
 * Region district rankings column model (#2702, #2676 spec §4.1): every column
 * has a group, hint, size and default; District, Region rank and Score are
 * always shown; the default set at each width fits that width's budget (a pure
 * function check, not a layout guess); and the sets only grow with the width.
 */

import { describe, it, expect } from 'vitest'
import {
  ALWAYS_SHOWN_REGION_RANKINGS_IDS,
  BREAKPOINT_TIERS,
  REGION_DISTRICT_MIN_SIZE,
  REGION_RANKINGS_CHOOSER_GROUPS,
  REGION_RANKINGS_COLUMN_IDS,
  TIER_BUDGET_PX,
  regionRankingsColumnMeta,
  regionRankingsTierDefaults,
} from '../regionRankingsColumnMeta'
import {
  regionRankingsColumnForSortField,
  regionRankingsColumns,
  regionRankingsSortField,
} from '../regionRankingsColumns'

describe('regionRankingsColumnMeta', () => {
  it('describes exactly the columns the table defines, in order', () => {
    expect(regionRankingsColumns.map(c => c.id)).toEqual([
      ...REGION_RANKINGS_COLUMN_IDS,
    ])
    for (const column of regionRankingsColumns) {
      expect(column.header).toBe(
        regionRankingsColumnMeta[
          column.id as keyof typeof regionRankingsColumnMeta
        ].label
      )
    }
  })

  it('gives every column a known group, a hint and a size', () => {
    const groups = REGION_RANKINGS_CHOOSER_GROUPS.map(g => g.id)
    for (const id of REGION_RANKINGS_COLUMN_IDS) {
      const meta = regionRankingsColumnMeta[id]
      expect(groups, id).toContain(meta.group)
      expect(meta.hint.length, id).toBeGreaterThan(0)
      expect(meta.size, id).toBeGreaterThan(0)
    }
  })

  it('always shows District, Region rank and Score', () => {
    expect([...ALWAYS_SHOWN_REGION_RANKINGS_IDS].sort()).toEqual([
      'district',
      'rank',
      'score',
    ])
    for (const tier of BREAKPOINT_TIERS) {
      const defaults = regionRankingsTierDefaults(tier)
      for (const id of ALWAYS_SHOWN_REGION_RANKINGS_IDS) {
        expect(defaults[id], `${tier} ${id}`).toBe(true)
      }
    }
  })

  it('shows the three score metrics at the narrowest width', () => {
    const tablet = regionRankingsTierDefaults('tablet')
    for (const id of ['paidClubs', 'payments', 'distinguished']) {
      expect(tablet[id], id).toBe(true)
    }
    expect(tablet['tier']).toBe(false)
  })

  it('only adds columns as the width grows', () => {
    for (let i = 1; i < BREAKPOINT_TIERS.length; i++) {
      const narrower = regionRankingsTierDefaults(BREAKPOINT_TIERS[i - 1]!)
      const wider = regionRankingsTierDefaults(BREAKPOINT_TIERS[i]!)
      for (const id of REGION_RANKINGS_COLUMN_IDS) {
        if (narrower[id])
          expect(wider[id], `${BREAKPOINT_TIERS[i]} ${id}`).toBe(true)
      }
    }
  })

  it('fits the default set inside each width budget', () => {
    for (const tier of BREAKPOINT_TIERS) {
      const defaults = regionRankingsTierDefaults(tier)
      const fixed = REGION_RANKINGS_COLUMN_IDS.filter(
        id => id !== 'district' && defaults[id]
      ).reduce((sum, id) => sum + regionRankingsColumnMeta[id].size, 0)
      expect(
        fixed + REGION_DISTRICT_MIN_SIZE,
        `${tier}: ${fixed} + ${REGION_DISTRICT_MIN_SIZE}`
      ).toBeLessThanOrEqual(TIER_BUDGET_PX[tier])
    }
  })

  it('maps the five URL sort fields to columns and back', () => {
    for (const field of [
      'aggregate',
      'world-rank',
      'clubs',
      'payments',
      'distinguished',
    ]) {
      const column = regionRankingsColumnForSortField(field)!
      expect(REGION_RANKINGS_COLUMN_IDS).toContain(column)
      expect(regionRankingsSortField(column)).toBe(field)
    }
  })
})
