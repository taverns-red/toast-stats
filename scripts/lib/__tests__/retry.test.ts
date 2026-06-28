/**
 * retryAsync — unit tests (#1267, epic #1266)
 *
 * The closing-date registry freshness check reads raw-csv metadata from GCS;
 * a transient Workload-Identity/STS token-exchange failure
 * (`sts.googleapis.com/v1/token: Premature close`, observed 2026-06-26/27)
 * threw on the first GCS call and was laundered into an empty-feed STALE
 * alert (#1245). retryAsync absorbs that transient class with bounded
 * backoff so a single flaky token fetch no longer cries wolf, while a
 * genuinely-broken read still surfaces after the attempts are spent
 * (fail-closed preserved — L107).
 */

import { describe, it, expect, vi } from 'vitest'
import { retryAsync } from '../retry.js'

/** A sleep stub that records each requested delay and resolves immediately. */
function recordingSleep(): {
  fn: (ms: number) => Promise<void>
  delays: number[]
} {
  const delays: number[] = []
  return {
    delays,
    fn: (ms: number) => {
      delays.push(ms)
      return Promise.resolve()
    },
  }
}

describe('retryAsync', () => {
  it('returns the value and never sleeps when fn succeeds first try', async () => {
    const sleep = recordingSleep()
    const fn = vi.fn().mockResolvedValue('ok')

    await expect(retryAsync(fn, { sleep: sleep.fn })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(sleep.delays).toEqual([])
  })

  it('retries after a transient failure and returns the eventual success', async () => {
    const sleep = recordingSleep()
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Premature close'))
      .mockResolvedValueOnce('recovered')

    await expect(
      retryAsync(fn, { attempts: 3, baseDelayMs: 100, sleep: sleep.fn })
    ).resolves.toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(2)
    expect(sleep.delays).toEqual([100]) // one wait between the two attempts
  })

  it('throws the last error after exhausting all attempts (fail-closed)', async () => {
    const sleep = recordingSleep()
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail-1'))
      .mockRejectedValueOnce(new Error('fail-2'))
      .mockRejectedValueOnce(new Error('fail-3'))

    await expect(
      retryAsync(fn, { attempts: 3, baseDelayMs: 100, sleep: sleep.fn })
    ).rejects.toThrow('fail-3')
    expect(fn).toHaveBeenCalledTimes(3)
    expect(sleep.delays).toHaveLength(2) // waits only BETWEEN attempts
  })

  it('backs off exponentially from baseDelayMs', async () => {
    const sleep = recordingSleep()
    const fn = vi.fn().mockRejectedValue(new Error('always'))

    await expect(
      retryAsync(fn, { attempts: 4, baseDelayMs: 250, sleep: sleep.fn })
    ).rejects.toThrow('always')
    expect(sleep.delays).toEqual([250, 500, 1000])
  })

  it('reports each retry to onRetry with attempt index and delay', async () => {
    const sleep = recordingSleep()
    const onRetry = vi.fn()
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('ok')

    await retryAsync(fn, {
      attempts: 3,
      baseDelayMs: 100,
      sleep: sleep.fn,
      onRetry,
    })
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 100)
  })

  it('does not retry past a single attempt when attempts=1', async () => {
    const sleep = recordingSleep()
    const fn = vi.fn().mockRejectedValue(new Error('once'))

    await expect(
      retryAsync(fn, { attempts: 1, sleep: sleep.fn })
    ).rejects.toThrow('once')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(sleep.delays).toEqual([])
  })
})
