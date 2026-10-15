/**
 * fetchCdnSuspendedClubs (#1794, data from #1953) — the per-club list behind
 * the Club Growth funnel's Suspended stage. Fixture: the recorded
 * `snapshots/2026-10-13/suspended-clubs.json`, trimmed to two districts.
 *
 * Presence carries meaning: a missing file means "not measured for this
 * date" (older dates until they are re-derived), so it resolves `null` —
 * never an empty list, which would read as a measured zero.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cdnSuspendedClubsUrl, fetchCdnSuspendedClubs } from '../cdn'
import { snap } from '../../test-utils/snapshotDate'
import recorded from '../../__tests__/fixtures/suspended-clubs-2026-10-13.recorded.json'

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

describe('cdnSuspendedClubsUrl', () => {
  it('targets the dated snapshot sidecar', () => {
    expect(cdnSuspendedClubsUrl(snap('2026-10-13'))).toMatch(
      /\/snapshots\/2026-10-13\/suspended-clubs\.json$/
    )
  })
})

describe('fetchCdnSuspendedClubs', () => {
  it('returns the validated recorded file on a 200', async () => {
    const fetchFn = stubFetch({ ok: true, status: 200, body: recorded })
    const file = await fetchCdnSuspendedClubs(snap('2026-10-13'))
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringMatching(/snapshots\/2026-10-13\/suspended-clubs\.json$/)
    )
    expect(file?.snapshotDate).toBe('2026-10-13')
    expect(file?.districts['83']).toHaveLength(3)
    expect(file?.districts['61']).toEqual([])
  })

  it('resolves null — not measured — when the date has no file', async () => {
    stubFetch({ ok: false, status: 404 })
    await expect(fetchCdnSuspendedClubs(snap('2026-10-12'))).resolves.toBe(null)
  })

  it('resolves null for a file that fails its contract', async () => {
    stubFetch({
      ok: true,
      status: 200,
      body: { ...recorded, districts: { '83': [{ clubNumber: '' }] } },
    })
    await expect(fetchCdnSuspendedClubs(snap('2026-10-13'))).resolves.toBe(null)
  })

  it('resolves null on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(fetchCdnSuspendedClubs(snap('2026-10-13'))).resolves.toBe(null)
  })
})
