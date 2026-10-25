/**
 * fetchCdnRegionRollups (#1815, data from #1799 / PR #2013) — the region and
 * world rollups behind `/regions/health` and `/region/:n/health`. Fixture:
 * the recorded prod `snapshots/2026-10-15/region-rollups.json`, whole.
 *
 * A missing file means "not published for this date", so it resolves
 * `null` — the pages say so instead of rendering zeros.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cdnRegionRollupsUrl, fetchCdnRegionRollups } from '../cdn'
import { snap } from '../../test-utils/snapshotDate'
import recorded from '../../__tests__/fixtures/region-rollups-2026-10-15.recorded.json'

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

describe('cdnRegionRollupsUrl', () => {
  it('targets the dated snapshot sidecar', () => {
    expect(cdnRegionRollupsUrl(snap('2026-10-15'))).toMatch(
      /\/snapshots\/2026-10-15\/region-rollups\.json$/
    )
  })
})

describe('fetchCdnRegionRollups', () => {
  it('returns the validated recorded file on a 200', async () => {
    stubFetch({ ok: true, status: 200, body: recorded })
    const file = await fetchCdnRegionRollups(snap('2026-10-15'))
    expect(file?.snapshotDate).toBe('2026-10-15')
    expect(file?.world.districts).toBe(94)
    expect(Object.keys(file?.regions ?? {})).toHaveLength(14)
  })

  it('accepts the recorded file once the pipeline adds officerTraining to every block (#2296)', async () => {
    // The schema is strict: until this reader is DEPLOYED, a file carrying
    // the new key reads as "not published" on every region page. This is
    // the forward-compatibility the writer (the pipeline PR) waits for.
    const distribution = {
      round1: [19, 5, 3, 14, 43, 25, 27, 25],
      round2: [161, 0, 0, 0, 0, 0, 0, 0],
    }
    const withKey = structuredClone(recorded) as unknown as {
      world: Record<string, unknown>
      regions: Record<string, Record<string, unknown>>
      districts: Record<string, Record<string, unknown>>
    }
    withKey.world['officerTraining'] = distribution
    for (const r of Object.values(withKey.regions)) r['officerTraining'] = null
    for (const d of Object.values(withKey.districts))
      d['officerTraining'] = distribution
    stubFetch({ ok: true, status: 200, body: withKey })
    const file = await fetchCdnRegionRollups(snap('2026-10-15'))
    expect(file).not.toBeNull()
    expect(
      (file?.world as Record<string, unknown> | undefined)?.['officerTraining']
    ).toEqual(distribution)
  })

  it('resolves null when the date has no file', async () => {
    stubFetch({ ok: false, status: 404 })
    await expect(fetchCdnRegionRollups(snap('2026-10-14'))).resolves.toBe(null)
  })

  it('resolves null for a file that fails its contract', async () => {
    stubFetch({
      ok: true,
      status: 200,
      body: { ...recorded, world: { ...recorded.world, clubs: -1 } },
    })
    await expect(fetchCdnRegionRollups(snap('2026-10-15'))).resolves.toBe(null)
  })

  it('resolves null on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(fetchCdnRegionRollups(snap('2026-10-15'))).resolves.toBe(null)
  })
})
