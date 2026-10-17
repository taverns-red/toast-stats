import { describe, it, expect, vi } from 'vitest'
import { clubDistrictHistoryShardQuery } from '../clubDistrictHistoryQuery'
import { clubDistrictHistoryShardQuery as entryShardQuery } from '../useClubDistrictHistoryEntry'
import { fetchClubDistrictHistoryShard } from '../../services/cdnClubDistrictHistory'

/* #2073 — one club-district history shard reader (#2059's) and one query
   definition, so the club page, the survival page, the Changes-feed
   transfers and the omni-search closed-club fallback share one cache entry
   per shard instead of fetching the same shard under two keys. */

vi.mock('../../services/cdnClubDistrictHistory', () => ({
  fetchClubDistrictHistoryShard: vi.fn().mockResolvedValue(null),
}))

describe('clubDistrictHistoryShardQuery (#2073)', () => {
  it('uses the shard key every history reader shares', () => {
    expect(clubDistrictHistoryShardQuery('77').queryKey).toEqual([
      'club-district-history',
      'shard',
      '77',
    ])
  })

  it('is the same definition the club page uses', () => {
    expect(entryShardQuery).toBe(clubDistrictHistoryShardQuery)
  })

  it('reads through the #2059 reader', async () => {
    await expect(
      clubDistrictHistoryShardQuery('77').queryFn()
    ).resolves.toBeNull()
    expect(fetchClubDistrictHistoryShard).toHaveBeenCalledWith('77')
  })
})
