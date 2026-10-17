/**
 * fetchCdnRegionMembershipSeries (#2127) — the one file behind the /regions
 * sparklines. Fixture: the builder's output over the prod 2026-27 district
 * series (2026-10-16), whole.
 *
 * Until the file is on prod (and for a year with no series) it 404s; that
 * resolves `null` and the page draws no sparkline, never a flat line.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  cdnRegionMembershipSeriesUrl,
  fetchCdnRegionMembershipSeries,
} from '../cdn'
import recorded from '../../__tests__/fixtures/region-membership-series-2026-2027.recorded.json'

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

describe('cdnRegionMembershipSeriesUrl', () => {
  it('targets the program year’s file under time-series/regions/', () => {
    expect(cdnRegionMembershipSeriesUrl('2026-2027')).toMatch(
      /\/time-series\/regions\/2026-2027\.json$/
    )
  })
})

describe('fetchCdnRegionMembershipSeries', () => {
  it('returns the validated recorded file on a 200, in ONE request', async () => {
    const fetch = stubFetch({ ok: true, status: 200, body: recorded })
    const file = await fetchCdnRegionMembershipSeries('2026-2027')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(file?.programYear).toBe('2026-2027')
    expect(Object.keys(file?.regions ?? {})).toHaveLength(14)
  })

  it('resolves null when the year has no file (404 until it reaches prod)', async () => {
    stubFetch({ ok: false, status: 404 })
    await expect(fetchCdnRegionMembershipSeries('2026-2027')).resolves.toBe(
      null
    )
  })

  it('resolves null for a file that fails its contract', async () => {
    stubFetch({
      ok: true,
      status: 200,
      body: { ...recorded, dates: recorded.dates.slice(1) },
    })
    await expect(fetchCdnRegionMembershipSeries('2026-2027')).resolves.toBe(
      null
    )
  })

  it('resolves null on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(fetchCdnRegionMembershipSeries('2026-2027')).resolves.toBe(
      null
    )
  })

  it('never requests an unsafe program year', async () => {
    const fetch = stubFetch({ ok: true, status: 200, body: recorded })
    await expect(fetchCdnRegionMembershipSeries('../x')).resolves.toBe(null)
    expect(fetch).not.toHaveBeenCalled()
  })
})
