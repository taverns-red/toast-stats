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
  fixturePath,
  installCdnFixtures,
  type CdnFixtureTally,
} from '../../../e2e/helpers/cdnFixtures'

/**
 * Contract: the PR Preview shards read recorded CDN fixtures, not live
 * cdn-staging (#2545). The fixture answers every cdn-staging request from a
 * run-scoped directory, never forwards one, and fails the test on a miss.
 */

type Handler = (route: FakeRoute) => Promise<void>

interface FakeRoute {
  request: () => { url: () => string; method: () => string }
  fulfill: ReturnType<typeof vi.fn>
  abort: ReturnType<typeof vi.fn>
  continue: ReturnType<typeof vi.fn>
  fetch: ReturnType<typeof vi.fn>
  fallback: ReturnType<typeof vi.fn>
}

const route = (url: string, method = 'GET'): FakeRoute => ({
  request: () => ({ url: () => url, method: () => method }),
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
  method = 'GET'
): Promise<FakeRoute> {
  const r = route(url, method)
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
      await cb(live)
      await cb(stubbed)
    }
    expect(tally.leaks).toEqual(['v1/dates.json'])
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
