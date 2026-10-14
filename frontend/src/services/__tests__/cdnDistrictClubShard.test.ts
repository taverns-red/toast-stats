/**
 * District club shard reader (#1901). Tolerant: any miss returns null so the
 * club page falls back to the district analytics file, never to "not found".
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import recorded from '../../../../packages/shared-contracts/src/__tests__/__fixtures__/recorded-district-club-shard.json'
import { cdnDistrictClubShardUrl, fetchCdnDistrictClubShard } from '../cdn'
import { snap } from '../../test-utils/snapshotDate'

const respond = (body: unknown, status = 200) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(),
      json: async () => body,
    })
  )

afterEach(() => vi.unstubAllGlobals())

describe('cdnDistrictClubShardUrl', () => {
  it('targets the flat per-digit file in analytics/', () => {
    expect(cdnDistrictClubShardUrl(snap('2026-10-12'), '61', '4')).toMatch(
      /\/snapshots\/2026-10-12\/analytics\/district_61_clubs_4\.json$/
    )
  })
})

describe('fetchCdnDistrictClubShard', () => {
  it('returns the recorded shard on a 200', async () => {
    respond(recorded)
    const s = await fetchCdnDistrictClubShard(snap('2026-10-12'), '61', '4')
    expect(s?.clubs.map(c => c.clubId)).toContain('7670344')
  })

  it('returns null on a 404 (a date with no shards yet)', async () => {
    respond({}, 404)
    expect(
      await fetchCdnDistrictClubShard(snap('2026-10-12'), '61', '4')
    ).toBeNull()
  })

  it('returns null for a malformed body', async () => {
    respond({ clubs: 'nope' })
    expect(
      await fetchCdnDistrictClubShard(snap('2026-10-12'), '61', '4')
    ).toBeNull()
  })

  it('returns null for a shard of another district, date or digit', async () => {
    respond(recorded)
    expect(
      await fetchCdnDistrictClubShard(snap('2026-10-12'), '62', '4')
    ).toBeNull()
    expect(
      await fetchCdnDistrictClubShard(snap('2026-10-11'), '61', '4')
    ).toBeNull()
    expect(
      await fetchCdnDistrictClubShard(snap('2026-10-12'), '61', '5')
    ).toBeNull()
  })

  it('returns null on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    expect(
      await fetchCdnDistrictClubShard(snap('2026-10-12'), '61', '4')
    ).toBeNull()
  })
})
