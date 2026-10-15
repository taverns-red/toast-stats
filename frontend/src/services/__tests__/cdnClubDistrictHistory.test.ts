/**
 * Club-district history readers (#1817, artifact from #1782). Fixture: the
 * recorded prod index and shards (2026-10-15), trimmed to D61/D01 clubs.
 *
 * A missing or invalid object resolves `null` — "not available" — so a
 * caller can refuse to count from a partial history instead of showing an
 * undercount as if it were measured.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  cdnClubDistrictHistoryIndexUrl,
  cdnClubDistrictHistoryShardUrl,
  fetchClubDistrictHistoryIndex,
  fetchClubDistrictHistoryShard,
} from '../cdnClubDistrictHistory'
import recorded from '../../__tests__/fixtures/club-district-history-d61-d01.recorded.json'

function stubFetch(res: { ok: boolean; status: number; body?: unknown }) {
  const fn = vi.fn().mockResolvedValue({
    ok: res.ok,
    status: res.status,
    headers: new Headers(),
    json: async () => res.body,
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('club-district history URLs', () => {
  it('targets config/club-district-history/{index,NN}.json', () => {
    expect(cdnClubDistrictHistoryIndexUrl()).toMatch(
      /\/config\/club-district-history\/index\.json$/
    )
    expect(cdnClubDistrictHistoryShardUrl('77')).toMatch(
      /\/config\/club-district-history\/77\.json$/
    )
  })
})

describe('fetchClubDistrictHistoryIndex', () => {
  it('returns the validated recorded index', async () => {
    stubFetch({ ok: true, status: 200, body: recorded.index })
    const index = await fetchClubDistrictHistoryIndex()
    expect(index?.shards).toHaveLength(100)
    expect(index?.programYears[0]).toBe('2016-2017')
  })

  it('resolves null on a 404 or a contract failure', async () => {
    stubFetch({ ok: false, status: 404 })
    await expect(fetchClubDistrictHistoryIndex()).resolves.toBeNull()
    stubFetch({ ok: true, status: 200, body: { shards: 'nope' } })
    await expect(fetchClubDistrictHistoryIndex()).resolves.toBeNull()
  })
})

describe('fetchClubDistrictHistoryShard', () => {
  it('returns the validated recorded shard (club 977 moved D01 → D201)', async () => {
    const fetchFn = stubFetch({
      ok: true,
      status: 200,
      body: recorded.shards['77'],
    })
    const shard = await fetchClubDistrictHistoryShard('77')
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringMatching(/club-district-history\/77\.json$/)
    )
    expect(shard?.clubs['977']?.spans.map(s => s.districtId)).toEqual([
      '01',
      '201',
    ])
  })

  it('resolves null for a shard served under the wrong key', async () => {
    stubFetch({ ok: true, status: 200, body: recorded.shards['77'] })
    await expect(fetchClubDistrictHistoryShard('78')).resolves.toBeNull()
  })

  it('resolves null on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(fetchClubDistrictHistoryShard('77')).resolves.toBeNull()
  })
})
