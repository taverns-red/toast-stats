import { describe, it, expect } from 'vitest'
import type { ClubDistrictHistoryShard } from '@taverns-red/shared-contracts'
import shardFixture from '../../__tests__/fixtures/club-district-history-shard-77.recorded.json'
import {
  findClubInShard,
  transferCounterpartDistrict,
  closedClubSummary,
} from '../clubDistrictHistory'

/* #1806 — the pure joins over the club-district history (#1782). The fixture
   is a trimmed copy of the live prod shard `config/club-district-history/77.json`
   (asOf 2026-10-13): club 977 moved D01 → D201 at the 2026 reformation, club 77
   moved D36 → D220, and club 377 closed in District 39 on 2024-03-31. */

const shard = shardFixture as ClubDistrictHistoryShard
const PYS = { fromProgramYear: '2025-2026', toProgramYear: '2026-2027' }

describe('findClubInShard (#1806)', () => {
  it('finds a club by its canonical id, whatever padding the caller has', () => {
    expect(findClubInShard(shard, '977')?.name).toBe(
      'Professional Women Toastmasters'
    )
    expect(findClubInShard(shard, '00000977')?.name).toBe(
      'Professional Women Toastmasters'
    )
  })

  it('returns undefined for a club the shard does not hold', () => {
    expect(findClubInShard(shard, '1077')).toBeUndefined()
  })
})

describe('transferCounterpartDistrict (#1806)', () => {
  const club977 = findClubInShard(shard, '977')!

  it('names the district a club transferred OUT to (its district in the to-PY)', () => {
    expect(transferCounterpartDistrict(club977, 'out', PYS, '01')).toBe('201')
  })

  it('names the district a club transferred IN from (its district in the from-PY)', () => {
    expect(transferCounterpartDistrict(club977, 'in', PYS, '201')).toBe('01')
  })

  it('returns null when the history has no district for that program year', () => {
    expect(
      transferCounterpartDistrict(
        club977,
        'out',
        { fromProgramYear: '2026-2027', toProgramYear: '2027-2028' },
        '201'
      )
    ).toBeNull()
  })

  it('returns null when the history says the club never left this district', () => {
    // Never claim "transferred to District 01" on District 01's own page.
    expect(transferCounterpartDistrict(club977, 'in', PYS, '01')).toBeNull()
  })
})

describe('closedClubSummary (#1806)', () => {
  it('summarises a closed club: year it was last seen and its last district', () => {
    expect(closedClubSummary(findClubInShard(shard, '377')!)).toEqual({
      lastDistrictId: '39',
      lastSeen: '2024-03-31',
      closedYear: 2024,
    })
  })

  it('returns null for a club still open on the history’s asOf date', () => {
    expect(closedClubSummary(findClubInShard(shard, '977')!)).toBeNull()
  })
})
