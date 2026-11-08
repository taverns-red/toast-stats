/* Run-scoped CDN fixtures for the PR Preview shards (#2545).
 *
 * The preview build reads https://cdn-staging.taverns.red. Left alone, every
 * shard page load hits that CDN, and staging was 73% of the project's CDN
 * cache lookups. A `fixtures` job in pr-preview.yml fetches the objects the
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
import type { BrowserContext, Response, Route } from '@playwright/test'

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
      await route.fulfill({
        status: entry.status,
        body: readFileSync(file),
        headers: {
          ...CORS,
          'content-type': entry.contentType,
          'cache-control': 'no-store',
        },
      })
    }
  )

  if (!record) {
    // A fulfilled response has no server address; one that came off the
    // network does. The handler above never forwards, so this should stay
    // empty: it is the guard that proves it.
    context.on('response', async (res: Response) => {
      const path = fixturePath(res.url(), origin)
      if (path && (await res.serverAddr()) !== null) tally.leaks.push(path)
    })
  }
  return tally
}
