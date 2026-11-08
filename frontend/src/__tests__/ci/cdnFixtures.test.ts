import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BrowserContext } from '@playwright/test'
import {
  CDN_STAGING_ORIGIN,
  describeFixtureProblems,
  fixtureFetch,
  fixtureGet,
  fixturePath,
  installCdnFixtures,
  settled,
  type CdnFixtureTally,
} from '../../../e2e/helpers/cdnFixtures'

/**
 * Contract: the PR Preview shards read recorded CDN fixtures, not live
 * cdn-staging (#2545). The fixture answers every cdn-staging request from a
 * run-scoped directory, never forwards one, and fails the test on a miss.
 */

type Handler = (route: FakeRoute) => Promise<void>

interface FakeRoute {
  request: () => {
    url: () => string
    method: () => string
    headers: () => Record<string, string>
  }
  fulfill: ReturnType<typeof vi.fn>
  abort: ReturnType<typeof vi.fn>
  continue: ReturnType<typeof vi.fn>
  fetch: ReturnType<typeof vi.fn>
  fallback: ReturnType<typeof vi.fn>
}

const route = (
  url: string,
  method = 'GET',
  headers: Record<string, string> = {}
): FakeRoute => ({
  request: () => ({
    url: () => url,
    method: () => method,
    headers: () => headers,
  }),
  fulfill: vi.fn().mockResolvedValue(undefined),
  abort: vi.fn().mockResolvedValue(undefined),
  continue: vi.fn().mockResolvedValue(undefined),
  fetch: vi.fn(),
  fallback: vi.fn(),
})

interface FakeContext {
  matchers: Array<(url: URL) => boolean>
  handlers: Handler[]
  listeners: Record<string, Array<(arg: unknown) => unknown>>
}

function fakeContext(): { ctx: BrowserContext; state: FakeContext } {
  const state: FakeContext = { matchers: [], handlers: [], listeners: {} }
  const ctx = {
    route: vi.fn(async (matcher: (url: URL) => boolean, handler: Handler) => {
      state.matchers.push(matcher)
      state.handlers.push(handler)
    }),
    on: vi.fn((event: string, cb: (arg: unknown) => unknown) => {
      ;(state.listeners[event] ??= []).push(cb)
    }),
  } as unknown as BrowserContext
  return { ctx, state }
}

/** What the browser does: match the URL, then run the handler. */
async function request(
  state: FakeContext,
  url: string,
  method = 'GET',
  headers: Record<string, string> = {}
): Promise<FakeRoute> {
  const r = route(url, method, headers)
  const i = state.matchers.findIndex(m => m(new URL(url)))
  if (i >= 0) await state.handlers[i]?.(r)
  return r
}

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), '2545-fixtures-'))
  mkdirSync(join(dir, 'v1'), { recursive: true })
  writeFileSync(join(dir, 'v1', 'latest.json'), '{"latestSnapshotDate":"d"}')
  writeFileSync(join(dir, 'v1', 'gone.json'), 'not found')
  writeFileSync(
    join(dir, '_index.json'),
    JSON.stringify({
      'v1/latest.json': { status: 200, contentType: 'application/json' },
      'v1/gone.json': { status: 404, contentType: 'text/plain' },
    })
  )
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('fixturePath', () => {
  it('is the pathname without its leading slash, query and hash dropped', () => {
    expect(fixturePath(`${CDN_STAGING_ORIGIN}/v1/latest.json?x=1#h`)).toBe(
      'v1/latest.json'
    )
  })

  it('is null for another origin', () => {
    expect(fixturePath('https://cdn.taverns.red/v1/latest.json')).toBeNull()
    expect(fixturePath('not a url')).toBeNull()
  })

  it('refuses a path that climbs out of the fixture directory', () => {
    expect(
      fixturePath(`${CDN_STAGING_ORIGIN}/a/..%2F..%2Fetc/passwd`)
    ).toBeNull()
    // The URL parser itself resolves a dot segment, escaped or not, so this
    // one never leaves the directory: it names b.json.
    expect(fixturePath(`${CDN_STAGING_ORIGIN}/a/%2e%2e/b.json`)).toBe('b.json')
  })
})

describe('installCdnFixtures: serving', () => {
  it('fulfils a recorded file with its status, type and a permissive CORS header', async () => {
    const { ctx, state } = fakeContext()
    const tally = await installCdnFixtures(ctx, { dir })
    const r = await request(state, `${CDN_STAGING_ORIGIN}/v1/latest.json`)
    expect(r.fulfill).toHaveBeenCalledTimes(1)
    const arg = r.fulfill.mock.calls[0]?.[0] as {
      status: number
      body: Buffer
      headers: Record<string, string>
    }
    expect(arg.status).toBe(200)
    expect(arg.body.toString()).toBe('{"latestSnapshotDate":"d"}')
    expect(arg.headers['content-type']).toBe('application/json')
    expect(arg.headers['access-control-allow-origin']).toBe('*')
    expect(tally.hits).toEqual(['v1/latest.json'])
  })

  it('never sends cache-control: no-store, which stops Chromium finishing the request', async () => {
    // Found running the shards on fixtures: a fulfilled 404 carrying no-store
    // never fired `requestfinished`, so a page that read one never reached
    // `networkidle` and the test timed out.
    const { ctx, state } = fakeContext()
    await installCdnFixtures(ctx, { dir })
    for (const p of ['v1/latest.json', 'v1/gone.json']) {
      const r = await request(state, `${CDN_STAGING_ORIGIN}/${p}`)
      const headers = (
        r.fulfill.mock.calls[0]?.[0] as { headers: Record<string, string> }
      ).headers
      expect(headers['cache-control']).toBeUndefined()
    }
  })

  it('replays a recorded 404 as a 404, not a miss', async () => {
    const { ctx, state } = fakeContext()
    const tally = await installCdnFixtures(ctx, { dir })
    const r = await request(state, `${CDN_STAGING_ORIGIN}/v1/gone.json`)
    expect((r.fulfill.mock.calls[0]?.[0] as { status: number }).status).toBe(
      404
    )
    expect(tally.misses).toEqual([])
  })

  it('answers a CORS preflight without a fixture', async () => {
    const { ctx, state } = fakeContext()
    await installCdnFixtures(ctx, { dir })
    const r = await request(
      state,
      `${CDN_STAGING_ORIGIN}/v1/anything.json`,
      'OPTIONS'
    )
    expect((r.fulfill.mock.calls[0]?.[0] as { status: number }).status).toBe(
      204
    )
  })

  it('ignores every other origin', async () => {
    const { ctx, state } = fakeContext()
    await installCdnFixtures(ctx, { dir })
    const r = await request(state, 'https://cdn.taverns.red/v1/latest.json')
    expect(r.fulfill).not.toHaveBeenCalled()
    expect(r.abort).not.toHaveBeenCalled()
  })
})

describe('installCdnFixtures: range requests', () => {
  // The basemap archive is read with Range requests (MapLibre + PMTiles).
  const fulfilled = (r: FakeRoute) =>
    r.fulfill.mock.calls[0]?.[0] as {
      status: number
      body: Buffer
      headers: Record<string, string>
    }

  it('answers a byte range with a 206 and a content-range', async () => {
    const { ctx, state } = fakeContext()
    await installCdnFixtures(ctx, { dir })
    const r = await request(
      state,
      `${CDN_STAGING_ORIGIN}/v1/latest.json`,
      'GET',
      { range: 'bytes=2-5' }
    )
    const arg = fulfilled(r)
    expect(arg.status).toBe(206)
    expect(arg.body.toString()).toBe('late')
    expect(arg.headers['content-range']).toBe('bytes 2-5/26')
    expect(arg.headers['accept-ranges']).toBe('bytes')
  })

  it('reads an open-ended range to the end and clamps one past it', async () => {
    const { ctx, state } = fakeContext()
    await installCdnFixtures(ctx, { dir })
    const open = fulfilled(
      await request(state, `${CDN_STAGING_ORIGIN}/v1/latest.json`, 'GET', {
        range: 'bytes=20-',
      })
    )
    expect(open.body.toString()).toBe('":"d"}')
    const past = fulfilled(
      await request(state, `${CDN_STAGING_ORIGIN}/v1/latest.json`, 'GET', {
        range: 'bytes=20-9999',
      })
    )
    expect(past.headers['content-range']).toBe('bytes 20-25/26')
  })

  it('answers 416 for a range that starts past the end', async () => {
    const { ctx, state } = fakeContext()
    await installCdnFixtures(ctx, { dir })
    const r = await request(
      state,
      `${CDN_STAGING_ORIGIN}/v1/latest.json`,
      'GET',
      { range: 'bytes=500-600' }
    )
    expect(fulfilled(r).status).toBe(416)
  })

  it('serves the whole body when the request has no range', async () => {
    const { ctx, state } = fakeContext()
    await installCdnFixtures(ctx, { dir })
    const r = await request(state, `${CDN_STAGING_ORIGIN}/v1/latest.json`)
    expect(fulfilled(r).status).toBe(200)
    expect(fulfilled(r).headers['accept-ranges']).toBe('bytes')
  })
})

describe('installCdnFixtures: misses and the zero-live guarantee', () => {
  it('aborts a path with no fixture and lists it as a miss', async () => {
    const { ctx, state } = fakeContext()
    const tally = await installCdnFixtures(ctx, { dir })
    const r = await request(state, `${CDN_STAGING_ORIGIN}/v1/unknown.json`)
    expect(r.abort).toHaveBeenCalledTimes(1)
    expect(r.fulfill).not.toHaveBeenCalled()
    expect(tally.misses).toEqual(['v1/unknown.json'])
  })

  it('never forwards a cdn-staging request: no continue, fetch or fallback', async () => {
    const { ctx, state } = fakeContext()
    await installCdnFixtures(ctx, { dir })
    for (const p of ['v1/latest.json', 'v1/gone.json', 'v1/unknown.json']) {
      const r = await request(state, `${CDN_STAGING_ORIGIN}/${p}`)
      expect(r.continue).not.toHaveBeenCalled()
      expect(r.fetch).not.toHaveBeenCalled()
      expect(r.fallback).not.toHaveBeenCalled()
    }
  })

  it('lists a response that came off the network as a leak', async () => {
    const { ctx, state } = fakeContext()
    const tally = await installCdnFixtures(ctx, { dir })
    const live = {
      url: () => `${CDN_STAGING_ORIGIN}/v1/dates.json`,
      serverAddr: async () => ({ ipAddress: '34.1.1.1', port: 443 }),
    }
    const stubbed = {
      url: () => `${CDN_STAGING_ORIGIN}/v1/latest.json`,
      serverAddr: async () => null,
    }
    for (const cb of state.listeners['response'] ?? []) {
      void cb(live)
      void cb(stubbed)
    }
    await settled(tally)
    expect(tally.leaks).toEqual(['v1/dates.json'])
  })

  it('records a leak whose server address is still pending when the test ends (settled)', async () => {
    const { ctx, state } = fakeContext()
    const tally = await installCdnFixtures(ctx, { dir })
    let answer: (v: { ipAddress: string; port: number }) => void = () => {}
    const slow = {
      url: () => `${CDN_STAGING_ORIGIN}/v1/dates.json`,
      serverAddr: () =>
        new Promise<{ ipAddress: string; port: number }>(r => (answer = r)),
    }
    // Playwright does not await an event handler: fire it and move on.
    for (const cb of state.listeners['response'] ?? []) void cb(slow)
    expect(tally.leaks).toEqual([])

    const done = settled(tally)
    setTimeout(() => answer({ ipAddress: '34.1.1.1', port: 443 }), 20)
    await done
    expect(tally.leaks).toEqual(['v1/dates.json'])
  })

  it('settles at once when nothing is pending', async () => {
    const { ctx } = fakeContext()
    const tally = await installCdnFixtures(ctx, { dir })
    await expect(settled(tally)).resolves.toBeUndefined()
  })
})

describe('describeFixtureProblems', () => {
  const tally = (over: Partial<CdnFixtureTally>): CdnFixtureTally => ({
    hits: [],
    misses: [],
    leaks: [],
    recorded: [],
    ...over,
  })

  it('is null for a clean run', () => {
    expect(describeFixtureProblems(tally({ hits: ['a'] }))).toBeNull()
  })

  it('names every miss and how to fix it', () => {
    const msg = describeFixtureProblems(tally({ misses: ['v1/x.json'] }))
    expect(msg).toContain('v1/x.json')
    expect(msg).toContain('scripts/smoke-fixtures.manifest.json')
  })

  it('names every request that reached cdn-staging', () => {
    const msg = describeFixtureProblems(tally({ leaks: ['v1/y.json'] }))
    expect(msg).toContain('v1/y.json')
    expect(msg).toMatch(/reached cdn-staging/)
  })
})

describe('installCdnFixtures: record mode', () => {
  it('passes requests through and writes each path once to the record file', async () => {
    const { ctx, state } = fakeContext()
    const file = join(dir, 'record.txt')
    const tally = await installCdnFixtures(ctx, { recordFile: file })
    const a = await request(state, `${CDN_STAGING_ORIGIN}/v1/latest.json?x=1`)
    await request(state, `${CDN_STAGING_ORIGIN}/v1/latest.json`)
    await request(state, `${CDN_STAGING_ORIGIN}/v1/dates.json`)
    expect(a.continue).toHaveBeenCalledTimes(1)
    expect(a.abort).not.toHaveBeenCalled()
    expect(tally.recorded).toEqual(['v1/latest.json', 'v1/dates.json'])
    expect(readFileSync(file, 'utf8').trim().split('\n')).toEqual([
      'v1/latest.json',
      'v1/dates.json',
    ])
    expect(describeFixtureProblems(tally)).toBeNull()
  })
})

describe('fixtureGet', () => {
  // A helper that reads a CDN file itself (page.request.get) must read the
  // fixture when one is on, like fixtureFetch does for a route.
  const live = () => ({
    status: () => 200,
    json: async () => ({ live: true }),
  })

  it('reads the fixture and never the network when a directory is on', async () => {
    const liveFn = vi.fn(async () => live())
    const res = await fixtureGet(
      `${CDN_STAGING_ORIGIN}/v1/latest.json?cb=1`,
      liveFn,
      { SMOKE_FIXTURES_DIR: dir }
    )
    expect(await res.json()).toEqual({ latestSnapshotDate: 'd' })
    expect(liveFn).not.toHaveBeenCalled()
  })

  it('throws for a path with no fixture, naming it', async () => {
    await expect(
      fixtureGet(`${CDN_STAGING_ORIGIN}/v1/unknown.json`, async () => live(), {
        SMOKE_FIXTURES_DIR: dir,
      })
    ).rejects.toThrow(/v1\/unknown\.json/)
  })

  it('reads the network when no directory is on', async () => {
    const liveFn = vi.fn(async () => live())
    const res = await fixtureGet(
      `${CDN_STAGING_ORIGIN}/v1/latest.json`,
      liveFn,
      {}
    )
    expect(liveFn).toHaveBeenCalledTimes(1)
    expect(await res.json()).toEqual({ live: true })
  })
})

describe('fixtureFetch', () => {
  // A spec that rewrites a CDN response (`page.route` + fetch + fulfill) must
  // read the fixture, not the network, when the fixture is on.
  const asRoute = (url: string, fetchFn = vi.fn()) =>
    ({
      request: () => ({ url: () => url }),
      fetch: fetchFn,
    }) as unknown as Parameters<typeof fixtureFetch>[0]

  it('reads the fixture, with its status, and never the network', async () => {
    const fetchFn = vi.fn()
    const res = await fixtureFetch(
      asRoute(`${CDN_STAGING_ORIGIN}/v1/latest.json`, fetchFn),
      { SMOKE_FIXTURES_DIR: dir }
    )
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ latestSnapshotDate: 'd' })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('replays a recorded 404 as a 404', async () => {
    const res = await fixtureFetch(
      asRoute(`${CDN_STAGING_ORIGIN}/v1/gone.json`),
      { SMOKE_FIXTURES_DIR: dir }
    )
    expect(res.status()).toBe(404)
  })

  it('throws for a path with no fixture, naming it', async () => {
    await expect(
      fixtureFetch(asRoute(`${CDN_STAGING_ORIGIN}/v1/unknown.json`), {
        SMOKE_FIXTURES_DIR: dir,
      })
    ).rejects.toThrow(/v1\/unknown\.json/)
  })

  it('reads the network when no fixture directory is on', async () => {
    const live = { status: () => 200, json: async () => ({ live: true }) }
    const fetchFn = vi.fn().mockResolvedValue(live)
    const res = await fixtureFetch(
      asRoute(`${CDN_STAGING_ORIGIN}/v1/latest.json`, fetchFn),
      {}
    )
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(await res.json()).toEqual({ live: true })
  })
})
