import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CDN_HOST,
  DataRequestTracker,
  appDataHosts,
  isAppDataRequest,
} from '../pageReady'

// The shape Playwright's `Request` exposes and the tracker reads.
const req = (url: string, type = 'fetch') => ({
  url: () => url,
  resourceType: () => type,
})

const HOSTS = ['ts.taverns.red', CDN_HOST]

describe('isAppDataRequest (#2410)', () => {
  it('counts a CDN snapshot fetch', () => {
    expect(
      isAppDataRequest(
        'https://cdn.taverns.red/snapshots/2026-10-24/district_86.json',
        'fetch',
        HOSTS
      )
    ).toBe(true)
  })

  it('counts an xhr to the app origin', () => {
    expect(isAppDataRequest('https://ts.taverns.red/x', 'xhr', HOSTS)).toBe(
      true
    )
  })

  it('ignores Google Analytics, which kept networkidle from settling', () => {
    expect(
      isAppDataRequest(
        'https://www.google-analytics.com/g/collect?v=2',
        'fetch',
        HOSTS
      )
    ).toBe(false)
    expect(
      isAppDataRequest(
        'https://www.googletagmanager.com/gtag/js?id=G-X',
        'script',
        HOSTS
      )
    ).toBe(false)
  })

  it('ignores non-data resources on our own hosts (scripts, fonts, images)', () => {
    for (const type of ['script', 'font', 'image', 'stylesheet', 'document']) {
      expect(
        isAppDataRequest('https://ts.taverns.red/assets/a.js', type, HOSTS)
      ).toBe(false)
    }
  })

  it('does not match a look-alike host by suffix', () => {
    expect(
      isAppDataRequest('https://cdn.taverns.red.evil.example/x', 'fetch', HOSTS)
    ).toBe(false)
  })

  it('treats an unparseable URL as not ours', () => {
    expect(isAppDataRequest('not a url', 'fetch', HOSTS)).toBe(false)
  })
})

describe('appDataHosts', () => {
  it('is the scenario host plus the data CDN', () => {
    expect(
      appDataHosts('https://ts.taverns.red/district/86/action-list?date=x')
    ).toEqual(['ts.taverns.red', 'cdn.taverns.red'])
  })
})

describe('DataRequestTracker (#2410)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is idle at once when nothing of ours is in flight', async () => {
    const t = new DataRequestTracker(HOSTS)
    t.onStart(req('https://www.google-analytics.com/g/collect'))
    await expect(t.whenIdle(1000)).resolves.toEqual({
      idle: true,
      pending: [],
    })
  })

  it('waits for every in-flight data request to end', async () => {
    const t = new DataRequestTracker(HOSTS)
    const a = req('https://cdn.taverns.red/a.json')
    const b = req('https://cdn.taverns.red/b.json')
    t.onStart(a)
    t.onStart(b)
    let result: unknown
    void t.whenIdle(5000).then(r => (result = r))
    t.onEnd(a)
    await vi.advanceTimersByTimeAsync(0)
    expect(result).toBeUndefined()
    t.onEnd(b)
    await vi.advanceTimersByTimeAsync(0)
    expect(result).toEqual({ idle: true, pending: [] })
  })

  it('reports what is still pending when the wait runs out', async () => {
    const t = new DataRequestTracker(HOSTS)
    t.onStart(req('https://cdn.taverns.red/slow.json'))
    const wait = t.whenIdle(5000)
    await vi.advanceTimersByTimeAsync(5000)
    await expect(wait).resolves.toEqual({
      idle: false,
      pending: ['https://cdn.taverns.red/slow.json'],
    })
  })

  it('ignores an end for a request it never counted', async () => {
    const t = new DataRequestTracker(HOSTS)
    const a = req('https://cdn.taverns.red/a.json')
    t.onStart(a)
    t.onEnd(req('https://cdn.taverns.red/other.json'))
    expect(t.pending()).toEqual(['https://cdn.taverns.red/a.json'])
  })
})
