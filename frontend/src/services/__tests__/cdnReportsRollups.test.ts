/**
 * fetchCdnReportsRollups (#1812, #1813; data from #2012 / PR #2117) — the
 * reports-derived region and world rollups behind `/region/:n/growth` and
 * `/regions/growth`. Fixture: the #2117 builder run over the recorded prod
 * 2026-10-15 sidecars of Regions 05 and 09 (12 districts; counts only).
 *
 * A missing file means "not available yet" (the artifact is not promoted
 * until #2117 lands), so it resolves `null` — never a block of zeros.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cdnReportsRollupsUrl, fetchCdnReportsRollups } from '../cdn'
import { snap } from '../../test-utils/snapshotDate'
import recorded from '../../__tests__/fixtures/reports-rollups-2026-10-15.recorded.json'

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

describe('cdnReportsRollupsUrl', () => {
  it('targets the dated snapshot sidecar', () => {
    expect(cdnReportsRollupsUrl(snap('2026-10-15'))).toMatch(
      /\/snapshots\/2026-10-15\/reports-rollups\.json$/
    )
  })
})

describe('fetchCdnReportsRollups', () => {
  it('returns the validated recorded file on a 200', async () => {
    const fetchFn = stubFetch({ ok: true, status: 200, body: recorded })
    const file = await fetchCdnReportsRollups(snap('2026-10-15'))
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringMatching(/2026-10-15\/reports-rollups\.json$/)
    )
    expect(file?.world.districts).toBe(12)
    expect(Object.keys(file?.regions ?? {}).sort()).toEqual(['05', '09'])
    expect(file?.districts['61']?.prospective?.clubs).toBe(6)
  })

  it('resolves null when the date has no file (404)', async () => {
    stubFetch({ ok: false, status: 404 })
    await expect(fetchCdnReportsRollups(snap('2026-10-14'))).resolves.toBe(null)
  })

  it('resolves null for a file that fails its contract', async () => {
    stubFetch({
      ok: true,
      status: 200,
      body: { ...recorded, world: { ...recorded.world, districts: -1 } },
    })
    await expect(fetchCdnReportsRollups(snap('2026-10-15'))).resolves.toBe(null)
  })

  it('resolves null on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(fetchCdnReportsRollups(snap('2026-10-15'))).resolves.toBe(null)
  })
})
