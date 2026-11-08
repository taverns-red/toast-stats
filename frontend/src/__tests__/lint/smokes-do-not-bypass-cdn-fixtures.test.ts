import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/* #2545: the PR Preview shards answer cdn-staging from recorded fixtures
 * (e2e/helpers/cdnFixtures.ts) and fail on any request that reaches the
 * network. A spec's own `page.route` can quietly defeat that:
 *   - `route.continue()` sends the request to the network, skipping the
 *     fixture route; `route.fallback()` hands it to the next route, which is
 *     the fixture;
 *   - `route.fetch()` reads the network too; `fixtureFetch(route)` reads the
 *     fixture when one is on, and the network when it is not.
 * So a smoke may not call either directly, except the few below that never
 * touch cdn-staging, named with the reason. */

const E2E_DIR = resolve(__dirname, '../../../e2e')
const smokes = readdirSync(E2E_DIR).filter(f => f.endsWith('.smoke.ts'))
const source = (f: string) => readFileSync(resolve(E2E_DIR, f), 'utf8')

/** file -> why its direct network call never reaches cdn-staging. */
const MAY_CONTINUE: Record<string, string> = {
  'district-map-preview.smoke.ts': 'the maplibre chunk, served by the build',
}
const MAY_FETCH: Record<string, string> = {
  'ga-page-view.smoke.ts': 'rewrites the prod origin onto BASE_URL',
  'priority-columns.smoke.ts':
    'relays cdn.taverns.red (prod) when run on a local build',
}

describe('smokes keep the CDN fixture in the path (#2545)', () => {
  it('finds the smoke files', () => {
    expect(smokes.length).toBeGreaterThan(10)
  })

  it('no smoke calls route.continue() except where it is excused', () => {
    const offenders = smokes.filter(
      f => /\broute\.continue\(/.test(source(f)) && !(f in MAY_CONTINUE)
    )
    expect(offenders).toEqual([])
  })

  it('no smoke calls route.fetch() except where it is excused', () => {
    const offenders = smokes.filter(
      f => /\broute\.fetch\(/.test(source(f)) && !(f in MAY_FETCH)
    )
    expect(offenders).toEqual([])
  })

  it('every excuse still names a smoke that makes the call', () => {
    for (const f of Object.keys(MAY_CONTINUE)) {
      expect(source(f)).toMatch(/\broute\.continue\(/)
    }
    for (const f of Object.keys(MAY_FETCH)) {
      expect(source(f)).toMatch(/\broute\.fetch\(/)
    }
  })
})
