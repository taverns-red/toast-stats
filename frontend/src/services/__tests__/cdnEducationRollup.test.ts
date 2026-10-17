/**
 * Education rollup readers (#1810, data from #1801) — the per-PY object and
 * the index behind `/region/:n/education`. Fixtures: the staging
 * `derived/education-rollup/` objects recorded 2026-10-17 (asOf 2026-10-16),
 * trimmed to Regions 01 and 03 and their districts (the shape is untouched).
 *
 * A missing object is "not available yet" (the rollup has not reached this
 * bucket, or the PY was omitted), so it resolves `null`, never zeros.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  cdnEducationRollupIndexUrl,
  cdnEducationRollupUrl,
  fetchCdnEducationRollup,
  fetchCdnEducationRollupIndex,
} from '../cdn'
import recorded from '../../__tests__/fixtures/education-rollup-2026-2027.recorded.json'
import recordedIndex from '../../__tests__/fixtures/education-rollup-index.recorded.json'

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

describe('education rollup URLs', () => {
  it('target derived/education-rollup/, the same path in both buckets', () => {
    expect(cdnEducationRollupUrl('2026-2027')).toMatch(
      /\/derived\/education-rollup\/2026-2027\.json$/
    )
    expect(cdnEducationRollupIndexUrl()).toMatch(
      /\/derived\/education-rollup\/index\.json$/
    )
  })

  it('refuse a program year that is not one', () => {
    expect(() => cdnEducationRollupUrl('../v1/dates')).toThrow()
  })
})

describe('fetchCdnEducationRollup', () => {
  it('returns the validated recorded object on a 200', async () => {
    const fetchFn = stubFetch({ ok: true, status: 200, body: recorded })
    const file = await fetchCdnEducationRollup('2026-2027')
    expect(fetchFn).toHaveBeenCalledWith(cdnEducationRollupUrl('2026-2027'))
    expect(file?.programYear).toBe('2026-2027')
    expect(file?.regions?.['01']?.totals.awards).toBe(1562)
  })

  it('resolves null on a 404 (not available yet)', async () => {
    stubFetch({ ok: false, status: 404 })
    await expect(fetchCdnEducationRollup('2026-2027')).resolves.toBe(null)
  })

  it('resolves null for an object that fails its contract', async () => {
    stubFetch({
      ok: true,
      status: 200,
      body: { ...recorded, world: { ...recorded.world, clubsWithAward: -1 } },
    })
    await expect(fetchCdnEducationRollup('2026-2027')).resolves.toBe(null)
  })

  it('resolves null on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(fetchCdnEducationRollup('2026-2027')).resolves.toBe(null)
  })
})

describe('fetchCdnEducationRollupIndex', () => {
  it('returns the validated recorded index on a 200', async () => {
    stubFetch({ ok: true, status: 200, body: recordedIndex })
    const index = await fetchCdnEducationRollupIndex()
    expect(index?.asOf).toBe('2026-10-16')
    expect(index?.trend.regions['01']?.['2018-2019']?.awards).toBe(8718)
  })

  it('resolves null on a 404', async () => {
    stubFetch({ ok: false, status: 404 })
    await expect(fetchCdnEducationRollupIndex()).resolves.toBe(null)
  })
})
