import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/* #2545: the PR Preview shards answer cdn-staging from recorded fixtures
 * (e2e/helpers/cdnFixtures.ts) and fail on any request that reaches the
 * network. A spec's own `page.route`, a helper, or a context a spec opens by
 * hand can quietly defeat that:
 *   - `route.continue()` sends the request to the network, skipping the
 *     fixture route; `route.fallback()` hands it to the next route, which is
 *     the fixture;
 *   - `route.fetch()` reads the network too; `fixtureFetch(route)` reads the
 *     fixture when one is on, and the network when it is not;
 *   - `page.request.get()` is the same network read without a route;
 *   - `browser.newContext()` is a context the auto fixture never saw, so it
 *     has no CDN route at all; `newFixtureContext` (fixtures/test.ts) installs
 *     the fixture on it and checks it at teardown.
 * So neither a smoke nor a helper may do any of those directly, except the
 * few below that never touch cdn-staging, named with the reason.
 *
 * Why a regex and not the AST: the receiver of `.continue()`/`.fetch()` is
 * whatever the handler named its parameter (`route`, `r`, `req`), and
 * TypeScript types are erased at the point a lint sees them. So the match is
 * any identifier calling it, which over-reports (a `.fetch(` on something
 * that is not a Route) rather than under-reports; an over-report is excused
 * below with its reason, an under-report is silent. */

const E2E_DIR = resolve(__dirname, '../../../e2e')
const HELPERS_DIR = resolve(E2E_DIR, 'helpers')

const smokes = readdirSync(E2E_DIR)
  .filter(f => f.endsWith('.smoke.ts'))
  .map(f => ({ name: f, path: resolve(E2E_DIR, f) }))
// cdnFixtures.ts is the fixture itself: it owns the one allowed continue.
const helpers = readdirSync(HELPERS_DIR)
  .filter(f => f.endsWith('.ts') && f !== 'cdnFixtures.ts')
  .map(f => ({ name: `helpers/${f}`, path: resolve(HELPERS_DIR, f) }))
const scanned = [...smokes, ...helpers]
const source = (f: string) =>
  readFileSync(scanned.find(s => s.name === f)?.path ?? f, 'utf8')

// Any identifier. `window`/`globalThis`/`self` are the page's own fetch.
const CONTINUE = /\b\w+\.continue\(/
const FETCH = /\b(?!window\b|globalThis\b|self\b)\w+\.fetch\(/
const REQUEST = /\b(?:page|context)\.request\./
const NEW_CONTEXT = /\.newContext\(|\bbrowser\.newPage\(/

/** file -> why its direct network call never reaches cdn-staging. */
const MAY_CONTINUE: Record<string, string> = {
  'district-map-preview.smoke.ts': 'the maplibre chunk, served by the build',
}
const MAY_FETCH: Record<string, string> = {
  'ga-page-view.smoke.ts': 'rewrites the prod origin onto BASE_URL',
  'priority-columns.smoke.ts':
    'relays cdn.taverns.red (prod) when run on a local build',
}
const MAY_REQUEST: Record<string, string> = {}
const MAY_NEW_CONTEXT: Record<string, string> = {
  'cdn-fixtures.smoke.ts': 'installs the fixture on its own contexts',
}

const offenders = (re: RegExp, excused: Record<string, string>): string[] =>
  scanned
    .filter(s => re.test(source(s.name)) && !(s.name in excused))
    .map(s => s.name)

describe('smokes keep the CDN fixture in the path (#2545)', () => {
  it('finds the smoke files and the helpers', () => {
    expect(smokes.length).toBeGreaterThan(10)
    expect(helpers.map(h => h.name)).toContain('helpers/forceReconciliation.ts')
    expect(helpers.map(h => h.name)).not.toContain('helpers/cdnFixtures.ts')
  })

  it('the patterns see a call on any identifier, not only `route`', () => {
    expect(CONTINUE.test('await r.continue()')).toBe(true)
    expect(CONTINUE.test('await request.continue({})')).toBe(true)
    expect(FETCH.test('const res = await r.fetch()')).toBe(true)
    expect(FETCH.test('const res = await route.fetch({ url })')).toBe(true)
    expect(FETCH.test('await window.fetch(u)')).toBe(false)
    expect(FETCH.test('await fixtureFetch(route)')).toBe(false)
    expect(REQUEST.test('await page.request.get(u)')).toBe(true)
    expect(NEW_CONTEXT.test('await browser.newContext({})')).toBe(true)
    expect(NEW_CONTEXT.test('await browser.newPage()')).toBe(true)
    expect(NEW_CONTEXT.test('await ctx.newPage()')).toBe(false)
  })

  it('nothing calls .continue() except where it is excused', () => {
    expect(offenders(CONTINUE, MAY_CONTINUE)).toEqual([])
  })

  it('nothing calls .fetch() except where it is excused', () => {
    expect(offenders(FETCH, MAY_FETCH)).toEqual([])
  })

  it('nothing reads page.request / context.request except where excused', () => {
    expect(offenders(REQUEST, MAY_REQUEST)).toEqual([])
  })

  it('nothing opens a context or page by hand except where excused', () => {
    expect(offenders(NEW_CONTEXT, MAY_NEW_CONTEXT)).toEqual([])
  })

  it('every excuse still names a file that makes the call', () => {
    for (const f of Object.keys(MAY_CONTINUE)) {
      expect(source(f)).toMatch(CONTINUE)
    }
    for (const f of Object.keys(MAY_FETCH)) {
      expect(source(f)).toMatch(FETCH)
    }
    for (const f of Object.keys(MAY_REQUEST)) {
      expect(source(f)).toMatch(REQUEST)
    }
    for (const f of Object.keys(MAY_NEW_CONTEXT)) {
      expect(source(f)).toMatch(NEW_CONTEXT)
    }
  })
})
