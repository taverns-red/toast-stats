/* The phone hub's rank line (#2613): a fully tied category must not read
   "#1 of N". */

import { describe, it, expect } from 'vitest'
import { worldRankText } from '../districtHub'
import type { MetricRankings } from '../../types/districts'

const rankings: MetricRankings = {
  worldRank: 1,
  worldPercentile: 98.9,
  regionRank: 1,
  totalDistricts: 94,
  totalInRegion: 8,
  region: '05',
}

describe('worldRankText (#2613)', () => {
  it('reads #rank of total for an ordinary rank', () => {
    expect(worldRankText(rankings)).toBe('#1 of 94')
  })

  it('reads Tied when every district has the same value', () => {
    expect(worldRankText({ ...rankings, worldTied: true })).toBe('Tied')
  })

  it('is null when there is no rank', () => {
    expect(worldRankText({ ...rankings, worldRank: null })).toBeNull()
  })
})
