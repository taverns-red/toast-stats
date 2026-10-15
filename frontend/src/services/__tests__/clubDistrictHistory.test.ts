import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchClubDistrictHistoryShard } from '../clubDistrictHistory'
import shardFixture from '../../__tests__/fixtures/club-district-history-shard-77.recorded.json'

/* #1806 — the reader fetches ONE shard of config/club-district-history/
   (#1782), never the whole ~0.9 MB-gz history. */

afterEach(() => vi.unstubAllGlobals())

describe('fetchClubDistrictHistoryShard (#1806)', () => {
  it('fetches config/club-district-history/{NN}.json from the CDN', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(shardFixture), { status: 200 })
      )
    vi.stubGlobal('fetch', fetchMock)

    const shard = await fetchClubDistrictHistoryShard('77')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(
      /\/config\/club-district-history\/77\.json$/
    )
    expect(shard.clubs['977']?.byProgramYear['2026-2027']).toBe('201')
  })

  it('rejects a malformed shard key without fetching (no path injection)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchClubDistrictHistoryShard('../x')).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a response that is not a history shard', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ hello: 1 }), { status: 200 })
        )
    )
    await expect(fetchClubDistrictHistoryShard('77')).rejects.toThrow()
  })

  it('rejects a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 404 }))
    )
    await expect(fetchClubDistrictHistoryShard('77')).rejects.toThrow()
  })
})
