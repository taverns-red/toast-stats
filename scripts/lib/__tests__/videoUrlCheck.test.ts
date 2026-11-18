/**
 * check-video-urls failure report (#2899): a failure must name the video,
 * the cut and the URL, so whoever reads the run log knows which file to
 * restore without opening the JSON.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  describeFailures,
  probeUrl,
  type VideoUrlResult,
} from '../videoUrlCheck'

const ok = (id: string): VideoUrlResult => ({
  id,
  cut: 'desktop',
  url: `https://cdn.taverns.red/videos/${id}/desktop.mp4`,
  status: 206,
  ok: true,
})

describe('describeFailures (#2899)', () => {
  it('is empty when every URL is live', () => {
    expect(describeFailures([ok('v1'), ok('v2')])).toEqual([])
  })

  it('names the video, the cut, the URL and the status of each failure', () => {
    const lines = describeFailures([
      ok('v1'),
      {
        id: 'v2',
        cut: 'mobile',
        url: 'https://cdn.taverns.red/videos/v2/mobile.mp4',
        status: 404,
        ok: false,
      },
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('v2')
    expect(lines[0]).toContain('mobile')
    expect(lines[0]).toContain('https://cdn.taverns.red/videos/v2/mobile.mp4')
    expect(lines[0]).toContain('404')
  })

  it('says "no response" when the request itself failed', () => {
    const lines = describeFailures([
      {
        id: 'v3',
        cut: 'desktop',
        url: 'https://x/y.mp4',
        status: null,
        ok: false,
      },
    ])
    expect(lines[0]).toContain('no response')
  })
})

describe('probeUrl (#2899)', () => {
  const noSleep = async () => {}
  const reply = (status: number) => ({
    status,
    body: { cancel: async () => {} },
  })

  it('returns the status of a live URL after one request', async () => {
    const fetchFn = vi.fn(async () => reply(206))
    const status = await probeUrl('https://x/y.mp4', {
      fetchFn,
      sleep: noSleep,
    })
    expect(status).toBe(206)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('gives each request a 15 second abort signal', async () => {
    const fetchFn = vi.fn(async (_url: string, _init: RequestInit) =>
      reply(200)
    )
    await probeUrl('https://x/y.mp4', { fetchFn, sleep: noSleep })
    const init = fetchFn.mock.calls[0]?.[1]
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(init?.headers).toEqual({ Range: 'bytes=0-0' })
  })

  it('retries once after a network error', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('reset'))
      .mockResolvedValueOnce(reply(206))
    const sleep = vi.fn(async () => {})
    const status = await probeUrl('https://x/y.mp4', { fetchFn, sleep })
    expect(status).toBe(206)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('retries once after a 5xx', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(reply(503))
      .mockResolvedValueOnce(reply(200))
    const status = await probeUrl('https://x/y.mp4', {
      fetchFn,
      sleep: noSleep,
    })
    expect(status).toBe(200)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('stops after one retry and reports the last result', async () => {
    const fetchFn = vi.fn(async () => reply(502))
    expect(await probeUrl('https://x/y.mp4', { fetchFn, sleep: noSleep })).toBe(
      502
    )
    expect(fetchFn).toHaveBeenCalledTimes(2)
    const failing = vi.fn().mockRejectedValue(new Error('down'))
    expect(
      await probeUrl('https://x/y.mp4', { fetchFn: failing, sleep: noSleep })
    ).toBeNull()
    expect(failing).toHaveBeenCalledTimes(2)
  })

  it.each([404, 403])('fails a %i at once, with no retry', async code => {
    const fetchFn = vi.fn(async () => reply(code))
    const status = await probeUrl('https://x/y.mp4', {
      fetchFn,
      sleep: noSleep,
    })
    expect(status).toBe(code)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})
