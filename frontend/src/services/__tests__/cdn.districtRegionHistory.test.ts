/**
 * #1821 — `config/district-region-history.json` (#1820) is the one source
 * of each program year's region membership. Absent or off-contract resolves
 * `null` (callers fall back to the rankings row's region), never throws.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCdnDistrictRegionHistory } from '../cdn'
import recorded from '../../__tests__/fixtures/district-region-history.recorded.json'

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
})

describe('fetchCdnDistrictRegionHistory', () => {
  it('reads config/district-region-history.json and validates it', async () => {
    const fn = stubFetch({ ok: true, status: 200, body: recorded })
    const history = await fetchCdnDistrictRegionHistory()
    expect(fn.mock.calls[0]![0]).toMatch(
      /\/config\/district-region-history\.json$/
    )
    expect(history?.districts['61']?.byProgramYear['2019-2020']).toBe('09')
  })

  it('resolves null on a 404, a network error or a contract failure', async () => {
    stubFetch({ ok: false, status: 404 })
    await expect(fetchCdnDistrictRegionHistory()).resolves.toBeNull()
    stubFetch({ ok: true, status: 200, body: { districts: 'nope' } })
    await expect(fetchCdnDistrictRegionHistory()).resolves.toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(fetchCdnDistrictRegionHistory()).resolves.toBeNull()
  })
})
