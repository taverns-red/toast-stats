import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCdnGlobalTotals } from '../cdn'
import { snap } from '../../test-utils/snapshotDate'

/**
 * `snapshots/{date}/global-totals.json`: a 404 means the rollup is not
 * published for that date and is `null`. Any other failure is a failed load
 * and must reach the page as an error, not as "not available".
 */

const status = (code: number): Response =>
  ({ ok: false, status: code, headers: new Headers() }) as unknown as Response

afterEach(() => vi.restoreAllMocks())

describe('fetchCdnGlobalTotals failure handling', () => {
  it('returns null for a 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(status(404))
    expect(await fetchCdnGlobalTotals(snap('2026-06-30'))).toBeNull()
  })

  it('throws on a 503', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(status(503))
    await expect(fetchCdnGlobalTotals(snap('2026-09-11'))).rejects.toThrow()
  })

  it('throws when the network fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'))
    await expect(fetchCdnGlobalTotals(snap('2026-09-11'))).rejects.toThrow(
      'offline'
    )
  })
})
