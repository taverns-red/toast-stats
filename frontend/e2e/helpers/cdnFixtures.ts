/* Run-scoped CDN fixtures for the PR Preview shards (#2545).
 *
 * The preview build reads https://cdn-staging.taverns.red. Left alone, every
 * shard page load hits that CDN, and staging was 73% of the project's CDN
 * cache lookups. The preview job in pr-preview.yml fetches the objects the
 * shards need ONCE per run (scripts/refresh-smoke-fixtures.ts) and the shards
 * answer from that directory instead.
 *
 * This is a CONTEXT route, so a spec's own `page.route` still wins, and it
 * covers popups and both engines. It never forwards a cdn-staging request: a
 * path with no fixture is aborted and listed, and the test fails at teardown
 * (describeFixtureProblems), so a gap cannot quietly keep the cost.
 *
 * Record mode (`recordFile`) is the one exception, used to seed the manifest:
 * it passes requests through and logs each path.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import type {
  BrowserContext,
  Page,
  Request,
  Response,
  Route,
} from '@playwright/test'

export const CDN_STAGING_ORIGIN = 'https://cdn-staging.taverns.red'

/** One recorded object: what the CDN answered. */
export interface FixtureIndexEntry {
  status: number
  contentType: string
}
export type FixtureIndex = Record<string, FixtureIndexEntry>

/** What the fixture saw in one context. */
export interface CdnFixtureTally {
  /** Paths answered from a fixture. */
  hits: string[]
  /** Paths with no fixture: aborted. */
  misses: string[]
  /** Paths whose response came off the network (it must stay empty). */
  leaks: string[]
  /** Record mode: every path passed through. */
  recorded: string[]
}

export interface InstallOptions {
  /** The fixture directory (an `_index.json` plus the files it names). */
  dir?: string
  origin?: string
  /** Record mode: pass through and append each path to this file. */
  recordFile?: string
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
}

/**
 * The object path a CDN URL names: the pathname without its leading slash,
 * query and hash dropped. Null for another origin, an unparseable URL, or a
 * path that climbs out of the fixture directory (a path comes from a URL, so
 * it is untrusted).
 */
export function fixturePath(
  url: string,
  origin: string = CDN_STAGING_ORIGIN
): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.origin !== origin) return null
  let path: string
  try {
    path = decodeURIComponent(u.pathname).replace(/^\/+/, '')
  } catch {
    return null
  }
  if (path === '' || path.split('/').some(part => part === '..')) return null
  return path
}

function readIndex(dir: string): FixtureIndex {
  const file = join(dir, '_index.json')
  if (!existsSync(file)) {
    throw new Error(
      `SMOKE_FIXTURES_DIR=${dir} has no _index.json: run scripts/refresh-smoke-fixtures.ts --out ${dir}`
    )
  }
  return JSON.parse(readFileSync(file, 'utf8')) as FixtureIndex
}

/**
 * The single byte range a request asks for (`bytes=a-b`, `bytes=a-`,
 * `bytes=-n`), clamped to the body; 'unsatisfiable' when it starts past the
 * end; null when there is no Range header. The basemap archive is read this
 * way (MapLibre + PMTiles).
 */
function byteRange(
  request: Request,
  size: number
): { start: number; end: number } | 'unsatisfiable' | null {
  const header = request.headers()['range']
  const m = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null
  if (!m || (m[1] === '' && m[2] === '')) return null
  let start: number
  let end: number
  if (m[1] === '') {
    start = Math.max(size - Number(m[2]), 0)
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  }
  return start >= size || start > end ? 'unsatisfiable' : { start, end }
}

/** A failure message for a run that missed a fixture or reached the CDN. */
export function describeFixtureProblems(tally: CdnFixtureTally): string | null {
  const lines: string[] = []
  if (tally.misses.length > 0) {
    lines.push(
      `No CDN fixture for ${tally.misses.length} path(s): ${tally.misses.join(', ')}.`,
      'Add each to scripts/smoke-fixtures.manifest.json (see frontend/e2e/fixtures/README.md).'
    )
  }
  if (tally.leaks.length > 0) {
    lines.push(
      `${tally.leaks.length} request(s) reached cdn-staging despite the fixture: ${tally.leaks.join(', ')}.`
    )
  }
  return lines.length > 0 ? lines.join('\n') : null
}

/**
 * Answer every request to the CDN origin from `options.dir`, on `context`.
 * Returns the tally the fixture keeps up to date as requests arrive.
 */
export async function installCdnFixtures(
  context: BrowserContext,
  options: InstallOptions
): Promise<CdnFixtureTally> {
  const origin = options.origin ?? CDN_STAGING_ORIGIN
  const tally: CdnFixtureTally = {
    hits: [],
    misses: [],
    leaks: [],
    recorded: [],
  }
  const record = options.recordFile
  const dir = options.dir ? resolve(options.dir) : undefined
  const index = !record && dir ? readIndex(dir) : {}
  if (!record && !dir) {
    throw new Error('installCdnFixtures needs a dir, or a recordFile')
  }

  await context.route(
    url => url.origin === origin,
    async (route: Route) => {
      const request = route.request()
      const path = fixturePath(request.url(), origin)

      if (record) {
        if (path && !tally.recorded.includes(path)) {
          tally.recorded.push(path)
          appendFileSync(record, `${path}\n`)
        }
        await route.continue()
        return
      }

      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: CORS })
        return
      }
      const entry = path ? index[path] : undefined
      const file = path && dir ? resolve(dir, path) : ''
      if (!path || !entry || !dir || !file.startsWith(dir + sep)) {
        if (path && !tally.misses.includes(path)) tally.misses.push(path)
        await route.abort()
        return
      }
      if (!tally.hits.includes(path)) tally.hits.push(path)
      const body = readFileSync(file)
      const headers = {
        ...CORS,
        'content-type': entry.contentType,
        // No cache-control: a fulfilled response with no-store never fires
        // `requestfinished` in Chromium, so networkidle never settles.
        'accept-ranges': 'bytes',
        'access-control-expose-headers':
          'Content-Range, Accept-Ranges, Content-Length',
      }
      const range =
        entry.status === 200 ? byteRange(request, body.length) : null
      if (range === 'unsatisfiable') {
        await route.fulfill({
          status: 416,
          headers: { ...headers, 'content-range': `bytes */${body.length}` },
        })
      } else if (range) {
        await route.fulfill({
          status: 206,
          body: body.subarray(range.start, range.end + 1),
          headers: {
            ...headers,
            'content-range': `bytes ${range.start}-${range.end}/${body.length}`,
          },
        })
      } else {
        await route.fulfill({ status: entry.status, body, headers })
      }
    }
  )

  if (!record) {
    // A fulfilled response has no server address; one that came off the
    // network does. The handler above never forwards, so this should stay
    // empty: it is the guard that proves it.
    // Playwright does not await an event handler, so the checks in flight
    // are kept here for `settled` to await before the tally is read.
    const inFlight: Promise<void>[] = []
    pending.set(tally, inFlight)
    context.on('response', (res: Response) => {
      const path = fixturePath(res.url(), origin)
      if (!path) return
      inFlight.push(
        res.serverAddr().then(
          addr => {
            if (addr !== null) tally.leaks.push(path)
          },
          // The page closed before the address came back: nothing to read.
          () => undefined
        )
      )
    })
  }
  return tally
}

/** Response checks in flight, per tally. */
const pending = new WeakMap<CdnFixtureTally, Promise<void>[]>()

/**
 * Resolves once every response check the fixture has started has finished.
 * Await it before reading `leaks`, or a leak can land after the verdict.
 */
export async function settled(tally: CdnFixtureTally): Promise<void> {
  await Promise.all(pending.get(tally) ?? [])
}

/** The part of a response a spec rewrites: its status and JSON body. */
export interface FixtureResponse {
  status(): number
  json(): Promise<unknown>
}

/**
 * Read one CDN file for a helper: the fixture when SMOKE_FIXTURES_DIR is set
 * (it throws for a path with none, which fails the test), `live()` when it is
 * not. For a read made without a route, such as `page.request.get()`, which
 * goes to the network past the fixture.
 */
export async function fixtureGet(
  url: string,
  live: () => Promise<FixtureResponse>,
  env: Record<string, string | undefined> = process.env
): Promise<FixtureResponse> {
  const dir = env['SMOKE_FIXTURES_DIR']
  if (!dir) return live()
  const root = resolve(dir)
  const path = fixturePath(url)
  const entry = path ? readIndex(root)[path] : undefined
  const file = path ? resolve(root, path) : ''
  if (!path || !entry || !file.startsWith(root + sep)) {
    throw new Error(`No CDN fixture for ${path ?? url}`)
  }
  const body = readFileSync(file)
  return {
    status: () => entry.status,
    json: async () => JSON.parse(body.toString('utf8')),
  }
}

/** `page.request.get(url)` for a helper, answered from the fixture when on. */
export async function fixtureRequestGet(
  page: Page,
  url: string,
  env: Record<string, string | undefined> = process.env
): Promise<FixtureResponse> {
  return fixtureGet(url, () => page.request.get(url), env)
}

/**
 * `route.fetch()` for a spec that rewrites a CDN response. `route.fetch()`
 * reads the network, past the fixture; with SMOKE_FIXTURES_DIR set this reads
 * the fixture instead (and throws for a path with none, which fails the
 * test), and with it unset it is `route.fetch()`.
 */
export async function fixtureFetch(
  route: Route,
  env: Record<string, string | undefined> = process.env
): Promise<FixtureResponse> {
  return fixtureGet(route.request().url(), () => route.fetch(), env)
}
