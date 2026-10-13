import { test as base, expect, type Request } from '@playwright/test'

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

const GA_HOST_RE = /(^|\.)(google-analytics\.com|analytics\.google\.com)$/
const GTM_HOST_RE = /(^|\.)googletagmanager\.com$/

/** Is this a GA/gtag hit endpoint (anything that records analytics)? */
export function isGaCollect(url: URL): boolean {
  if (GA_HOST_RE.test(url.hostname)) return true
  if (GTM_HOST_RE.test(url.hostname)) return /\/collect\b/.test(url.pathname)
  // GA4 hits on other hosts (e.g. stats.g.doubleclick.net, region proxies).
  return url.pathname.endsWith('/g/collect')
}

interface GaFixtures {
  /** GA collect requests the stub answered, in arrival order. */
  gaCollect: Request[]
}

export const test = base.extend<GaFixtures>({
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
