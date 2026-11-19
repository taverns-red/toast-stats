/**
 * fetchCdnReinstatableClubs (#3007, phase 3) — the per-club list behind the
 * Club Growth page's "Can reinstate" section. Fixture: the staging
 * `snapshots/2026-11-18/reinstatable-clubs.json`, trimmed to three districts.
 *
 * Prod gains the file with the first daily after 2.94.0, so a missing file is
 * normal for older dates: it resolves `null` (not measured), never `[]`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cdnReinstatableClubsUrl, fetchCdnReinstatableClubs } from '../cdn'
import { snap } from '../../test-utils/snapshotDate'
import recorded from '../../__tests__/fixtures/reinstatable-clubs-2026-11-18.recorded.json'

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

describe('cdnReinstatableClubsUrl', () => {
  it('targets the dated snapshot sidecar', () => {
    expect(cdnReinstatableClubsUrl(snap('2026-11-18'))).toMatch(
      /\/snapshots\/2026-11-18\/reinstatable-clubs\.json$/
    )
  })
})

describe('fetchCdnReinstatableClubs', () => {
  it('returns the validated recorded file on a 200', async () => {
    const fetchFn = stubFetch({ ok: true, status: 200, body: recorded })
    const file = await fetchCdnReinstatableClubs(snap('2026-11-18'))
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringMatching(/snapshots\/2026-11-18\/reinstatable-clubs\.json$/)
    )
    expect(file?.snapshotDate).toBe('2026-11-18')
    expect(file?.baseProgramYear).toBe('2026-2027')
    expect(file?.districts['61']).toHaveLength(22)
    expect(file?.districts['93']).toEqual([])
  })

  it('resolves null — not measured — when the date has no file', async () => {
    stubFetch({ ok: false, status: 404 })
    await expect(
      fetchCdnReinstatableClubs(snap('2026-11-17'))
    ).resolves.toBeNull()
  })

  it('resolves null for a file that fails its contract', async () => {
    stubFetch({
      ok: true,
      status: 200,
      body: { ...recorded, districts: { '61': [{ clubNumber: '' }] } },
    })
    await expect(
      fetchCdnReinstatableClubs(snap('2026-11-18'))
    ).resolves.toBeNull()
  })

  it('resolves null on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(
      fetchCdnReinstatableClubs(snap('2026-11-18'))
    ).resolves.toBeNull()
  })
})
