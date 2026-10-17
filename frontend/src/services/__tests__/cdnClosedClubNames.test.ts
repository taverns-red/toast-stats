/**
 * Closed-club name index reader (#2062). Fixture: the index built by the
 * pipeline's own builder (scripts/lib/closedClubNames.ts) from the recorded
 * prod club-district history (asOf 2026-10-15), trimmed to D39/D61 and
 * PYs 2023-24 to 2025-26.
 *
 * The index reaches prod only with the next pipeline run, so a 404 (and any
 * other failure) resolves `null`: search goes on without closed names.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  cdnClosedClubNamesUrl,
  fetchClosedClubNames,
} from '../cdnClosedClubNames'
import recorded from '../../__tests__/fixtures/closed-club-names.recorded.json'

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

describe('fetchClosedClubNames', () => {
  it('targets config/closed-club-names.json', () => {
    expect(cdnClosedClubNamesUrl()).toMatch(
      /\/config\/closed-club-names\.json$/
    )
  })

  it('returns the validated recorded index', async () => {
    stubFetch({ ok: true, status: 200, body: recorded })
    const index = await fetchClosedClubNames()
    expect(index?.asOf).toBe('2026-10-15')
    expect(index?.programYears['2023-2024']?.['39']).toContainEqual([
      '377',
      'Traveling Toastmasters Club',
      '2024-03-31',
    ])
  })

  it('resolves null on a 404 (not on prod yet), a contract failure or a network error', async () => {
    stubFetch({ ok: false, status: 404 })
    await expect(fetchClosedClubNames()).resolves.toBeNull()
    stubFetch({ ok: true, status: 200, body: { programYears: 'nope' } })
    await expect(fetchClosedClubNames()).resolves.toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(fetchClosedClubNames()).resolves.toBeNull()
  })
})
