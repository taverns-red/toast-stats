/**
 * fetchCdnClubsByRegionShard (#1808, data from #1800 / PR #2124) — one
 * region's clubs for `/region/:n/map`. Fixture: the recorded staging shard
 * `snapshots/2026-10-16/clubs-by-region/05.json`.
 *
 * A missing shard means "not available for this date yet" (the artifact
 * predates the date, or is not promoted), so it resolves `null`. A network
 * or server failure is an error the page can retry, never "not available".
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  cdnClubsByRegionShardUrl,
  cdnClubsByRegionWorldUrl,
  fetchCdnClubsByRegionShard,
  fetchCdnClubsByRegionWorld,
} from '../cdn'
import { snap } from '../../test-utils/snapshotDate'
import recorded from '../../../../packages/shared-contracts/src/__tests__/__fixtures__/recorded-clubs-by-region.json'

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

describe('cdnClubsByRegionShardUrl', () => {
  it('targets the dated region shard', () => {
    expect(cdnClubsByRegionShardUrl(snap('2026-10-16'), '05')).toMatch(
      /\/snapshots\/2026-10-16\/clubs-by-region\/05\.json$/
    )
  })

  it('encodes the region id', () => {
    expect(cdnClubsByRegionShardUrl(snap('2026-10-16'), '../x')).toMatch(
      /\/clubs-by-region\/\.\.%2Fx\.json$/
    )
  })
})

describe('fetchCdnClubsByRegionShard', () => {
  it('returns the validated recorded shard on a 200', async () => {
    const fn = stubFetch({ ok: true, status: 200, body: recorded.shards['05'] })
    const shard = await fetchCdnClubsByRegionShard(snap('2026-10-16'), '05')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(shard?.region).toBe('05')
    expect(shard?.clubs).toHaveLength(161)
    expect(shard?.counts).toEqual({ clubs: 161, mapped: 159, unmapped: 2 })
  })

  it('resolves null when the date has no shard (404)', async () => {
    stubFetch({ ok: false, status: 404 })
    await expect(
      fetchCdnClubsByRegionShard(snap('2026-10-15'), '05')
    ).resolves.toBe(null)
  })

  it('resolves null for a shard that fails its contract', async () => {
    stubFetch({
      ok: true,
      status: 200,
      body: { ...recorded.shards['05'], clubs: [{ id: '1' }] },
    })
    await expect(
      fetchCdnClubsByRegionShard(snap('2026-10-16'), '05')
    ).resolves.toBe(null)
  })

  it('rejects on a server error, so the page can retry', async () => {
    stubFetch({ ok: false, status: 503 })
    await expect(
      fetchCdnClubsByRegionShard(snap('2026-10-16'), '05')
    ).rejects.toThrow(/503/)
  })
})

/* #1809 — the world explorer's first file: world.json (totals, per-region
   counts and the top-50 seed rows, ~8 KB gz), fetched before any shard. */
describe('fetchCdnClubsByRegionWorld', () => {
  it('targets the dated world file', () => {
    expect(cdnClubsByRegionWorldUrl(snap('2026-10-16'))).toMatch(
      /\/snapshots\/2026-10-16\/clubs-by-region\/world\.json$/
    )
  })

  it('returns the validated recorded world file on a 200', async () => {
    stubFetch({ ok: true, status: 200, body: recorded.world })
    const world = await fetchCdnClubsByRegionWorld(snap('2026-10-16'))
    expect(world?.totals.clubs).toBe(318)
    expect(world?.top.membership).toHaveLength(50)
  })

  it('resolves null when the date has no world file (404)', async () => {
    stubFetch({ ok: false, status: 404 })
    await expect(fetchCdnClubsByRegionWorld(snap('2026-10-16'))).resolves.toBe(
      null
    )
  })

  it('rejects on a server error, so the page can retry', async () => {
    stubFetch({ ok: false, status: 503 })
    await expect(
      fetchCdnClubsByRegionWorld(snap('2026-10-16'))
    ).rejects.toThrow(/503/)
  })
})
