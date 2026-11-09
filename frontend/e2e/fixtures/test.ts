import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Request,
  type Response,
} from '@playwright/test'
import { describeErrorResponse } from '../helpers/errorResponses'
import {
  describeFixtureProblems,
  installCdnFixtures,
  settled,
  type CdnFixtureTally,
} from '../helpers/cdnFixtures'

/* Shared smoke fixture (#1979): no smoke may send a real GA hit.
 *
 * The GA snippet only runs on the production hostname, so any smoke run with
 * BASE_URL=https://ts.taverns.red (every prod verification sweep) loaded the
 * real gtag.js and sent real page_view/collect hits — about 117 in one sweep,
 * inflating the property's analytics.
 *
 * Every smoke imports `test` from here, never from '@playwright/test'
 * (enforced by src/__tests__/lint/smokes-use-ga-stub.test.ts). The auto
 * fixture below:
 *  - answers every GA collect endpoint locally with a 204, at the browser
 *    context level, so it covers every page and popup the test opens;
 *  - hands the stubbed requests to any test that asks for `gaCollect`
 *    (ga-page-view.smoke.ts counts page_views through it);
 *  - fails the test if any GA collect request got a response that did not
 *    come from the stub — i.e. it reached Google.
 *
 * The gtag.js LIBRARY (www.googletagmanager.com/gtag/js) still loads: it
 * sends no hit by itself, and the GA smoke needs the real library to prove
 * the page_view count.
 */

/* Seeded cookie consent (#2584). A fresh browser has no `rt_consent` cookie,
 * so every page would open with the consent banner (a fixed overlay at the
 * bottom) and no analytics. Smokes measure page height and first-screen
 * content, so by default this fixture seeds the visitor's choice as
 * 'minimal': the banner stays closed, saved preferences work as before, and
 * GA does not load. A smoke that needs something else states it:
 *   test.use({ consent: 'all' })    GA loads (ga-page-view.smoke.ts)
 *   test.use({ consent: 'none' })   preferences are session-only
 *   test.use({ consent: 'unset' })  nothing seeded; the banner shows
 *                                   (consent-banner.smoke.ts)
 * The cookie value mirrors utils/consent.ts: `v<CONSENT_VERSION>.<level>`;
 * it is only written when no consent cookie exists yet, so a smoke that
 * changes the choice keeps it across navigations. */
export type SeededConsent = 'all' | 'minimal' | 'none' | 'unset'

/** Seed the consent cookie on every page of `context` (before any script). */
async function seedConsent(
  context: BrowserContext,
  consent: SeededConsent
): Promise<void> {
  if (consent === 'unset') return
  await context.addInitScript(level => {
    if (!document.cookie.includes('rt_consent=')) {
      document.cookie = `rt_consent=v1.${level}; Path=/; Max-Age=31536000; SameSite=Lax`
    }
  }, consent)
}

const GA_HOST_RE = /(^|\.)(google-analytics\.com|analytics\.google\.com)$/
const GTM_HOST_RE = /(^|\.)googletagmanager\.com$/

/** Is this a GA/gtag hit endpoint (anything that records analytics)? */
export function isGaCollect(url: URL): boolean {
  if (GA_HOST_RE.test(url.hostname)) return true
  if (GTM_HOST_RE.test(url.hostname)) return /\/collect\b/.test(url.pathname)
  // GA4 hits on other hosts (e.g. stats.g.doubleclick.net, region proxies).
  return url.pathname.endsWith('/g/collect')
}

/** `browser.newContext()` with the CDN fixture on the new context. */
export type NewFixtureContext = (
  options?: Parameters<Browser['newContext']>[0]
) => Promise<BrowserContext>

interface GaFixtures {
  /** The consent choice seeded into every context (#2584); default minimal. */
  consent: SeededConsent
  /** GA collect requests the stub answered, in arrival order. */
  gaCollect: Request[]
  /** Responses with status >= 400, as `status host/path` (#2248). */
  errorResponses: string[]
  /** The CDN fixture's tally, or null when it is off (#2545). */
  cdnFixtures: CdnFixtureTally | null
  /** `browser.newContext()` with the CDN fixture on it (#2545). */
  newFixtureContext: NewFixtureContext
  /** Internal: seeds the consent cookie (#2584). */
  consentSeed: undefined
}

/** The fixture's env: a directory to read, or a file to record into. */
function fixtureEnv() {
  const dir = process.env['SMOKE_FIXTURES_DIR']
  const recordFile = process.env['SMOKE_FIXTURES_RECORD_FILE']
  return { dir, recordFile, on: Boolean(dir || recordFile) }
}

export const test = base.extend<GaFixtures>({
  consent: ['minimal', { option: true }],
  /* Seeds the consent cookie on the default context (#2584, see above). */
  consentSeed: [
    async ({ context, consent }, use) => {
      await seedConsent(context, consent)
      await use(undefined)
    },
    { auto: true },
  ],
  /* PR Preview shards read recorded CDN fixtures, not live cdn-staging
   * (#2545). Off unless SMOKE_FIXTURES_DIR is set (only the shard step sets
   * it), so staging.smoke on the real channel, the wire-cost test and prod
   * sweeps stay live. SMOKE_FIXTURES_RECORD_FILE instead records every CDN
   * path a run requests (scripts/smoke-fixtures-uncovered.ts reads it).
   * A path with no fixture, or any response that came off the network, fails
   * the test at teardown. */
  cdnFixtures: [
    async ({ context }, use, testInfo) => {
      const { dir, recordFile, on } = fixtureEnv()
      if (!on) {
        await use(null)
        return
      }
      const tally = await installCdnFixtures(context, { dir, recordFile })
      await use(tally)
      await settled(tally)
      const problems = describeFixtureProblems(tally)
      if (problems) {
        await testInfo.attach('cdn-fixture-problems', {
          body: problems,
          contentType: 'text/plain',
        })
      }
      expect(problems, 'CDN fixtures (#2545)').toBeNull()
    },
    { auto: true },
  ],
  /* A spec that needs a context of its own (a colour scheme, a device, safe
   * area insets) calls this, not `browser.newContext()`: a context made by
   * hand never meets the auto fixture above, so its CDN reads would go live
   * and unchecked (#2545). Same install and same teardown check; with the
   * fixture off it is `browser.newContext()`. The lint test
   * smokes-do-not-bypass-cdn-fixtures.test.ts fails a bare newContext. */
  newFixtureContext: async ({ browser, consent }, use, testInfo) => {
    const { dir, recordFile, on } = fixtureEnv()
    const made: CdnFixtureTally[] = []
    await use(async options => {
      const ctx = await browser.newContext(options)
      await seedConsent(ctx, consent)
      if (on) made.push(await installCdnFixtures(ctx, { dir, recordFile }))
      return ctx
    })
    for (const tally of made) {
      await settled(tally)
      const problems = describeFixtureProblems(tally)
      if (problems) {
        await testInfo.attach('cdn-fixture-problems', {
          body: problems,
          contentType: 'text/plain',
        })
      }
      expect(problems, 'CDN fixtures (#2545)').toBeNull()
    }
  },
  /* Diagnostics only (#2248): record every response with status >= 400 and
   * attach the list to the test result, so a failure names the URL that
   * failed (the reporter prints a text attachment under the failing test).
   * Query strings and hashes are dropped (describeErrorResponse). This
   * never fails a test. */
  errorResponses: [
    async ({ context }, use, testInfo) => {
      const lines: string[] = []
      const onResponse = (res: Response) => {
        const line = describeErrorResponse(res.url(), res.status())
        if (line) lines.push(line)
      }
      context.on('response', onResponse)
      await use(lines)
      context.off('response', onResponse)
      if (lines.length > 0) {
        await testInfo.attach('error-responses', {
          body: lines.join('\n'),
          contentType: 'text/plain',
        })
      }
    },
    { auto: true },
  ],
  gaCollect: [
    async ({ context }, use) => {
      const stubbed: Request[] = []
      const leaked: string[] = []
      // A real collect hit gets a response from Google and then usually
      // reports `requestfailed` (beacon / no-cors), never `requestfinished`,
      // so the guard keys on `response`: any GA response that did not come
      // from the stub came from Google.
      context.on('response', res => {
        const req = res.request()
        if (isGaCollect(new URL(req.url())) && !stubbed.includes(req)) {
          leaked.push(req.url())
        }
      })
      await context.route(
        url => isGaCollect(url),
        async route => {
          stubbed.push(route.request())
          await route.fulfill({ status: 204, body: '' })
        }
      )
      await use(stubbed)
      expect(
        leaked,
        'GA collect requests reached Google — every smoke must stub GA (#1979)'
      ).toEqual([])
    },
    { auto: true },
  ],
})

export * from '@playwright/test'
