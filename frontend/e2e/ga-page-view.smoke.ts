import { test, expect, type Page, type Request } from './fixtures/test'

/* One GA page_view per page load and per SPA navigation (#1946).
 *
 * Prod sent 4 page_views per load of `/`, 3 on /district/61, 2 on a club
 * page and 2 per SPA navigation: gtag config's default page_view, a manual
 * page_view from the app for every pathname+search change (queued behind the
 * deferred loader, #1906), and the property's Enhanced Measurement history
 * page_view all stacked. gtag now owns page_view; the app sends none.
 *
 * The GA snippet only runs on the production hostname, so the page is served
 * AS https://ts.taverns.red: every request to that origin is answered from
 * BASE_URL (the PR preview, or prod itself). The real gtag.js loads with the
 * real property's settings — but every collect request is fulfilled locally
 * with a 204 by the shared fixture (e2e/fixtures/test.ts, #1979), which also
 * fails the test if any hit reaches Google Analytics. Hits are counted from
 * the requests that fixture stubbed.
 */

const PROD_ORIGIN = 'https://ts.taverns.red'
const BASE = (process.env['BASE_URL'] || PROD_ORIGIN).replace(/\/$/, '')
// GA4 sends the first hit at once and batches later events (~5 s): wait past
// a batch window before asserting "exactly", so a late duplicate is caught.
const SETTLE_MS = 8_000

interface Hit {
  dl: string
}

/** Parse every page_view in a collect request (query + batched body lines). */
function pageViews(req: Request): Hit[] {
  const url = new URL(req.url())
  const lines = (req.postData() ?? '').split('\n')
  return lines
    .map(line => new URLSearchParams(`${url.search.slice(1)}&${line}`))
    .filter(p => p.get('en') === 'page_view')
    .map(p => ({ dl: p.get('dl') ?? '' }))
}

/** The page_views in the stubbed collect requests, read live. */
function hitsOf(gaCollect: Request[]): () => Hit[] {
  return () => gaCollect.flatMap(pageViews)
}

async function setup(page: Page): Promise<void> {
  if (BASE !== PROD_ORIGIN) {
    await page.route(
      url => url.origin === PROD_ORIGIN,
      async route => {
        const u = new URL(route.request().url())
        const response = await route.fetch({
          url: `${BASE}${u.pathname}${u.search}`,
        })
        await route.fulfill({ response })
      }
    )
  }
}

async function expectSettledCount(hits: () => Hit[], n: number): Promise<void> {
  // gtag is deferred until the first screen settles (#1906, ≤ 10 s after
  // load), so wait for the hit itself — the readiness signal — then settle.
  await expect
    .poll(() => hits().length, { timeout: 30_000 })
    .toBeGreaterThan(n - 1)
  await new Promise(r => setTimeout(r, SETTLE_MS))
  expect(hits().map(h => h.dl)).toHaveLength(n)
}

const ROUTES = ['/', '/district/61', '/district/61/club/7238597']

for (const path of ROUTES) {
  test(`exactly one GA page_view per load of ${path}`, async ({
    page,
    gaCollect,
  }) => {
    test.setTimeout(90_000)
    await setup(page)
    const hits = hitsOf(gaCollect)
    await page.goto(`${PROD_ORIGIN}${path}`, { waitUntil: 'load' })
    await expectSettledCount(hits, 1)
    expect(new URL(hits()[0]!.dl).pathname).toBe(path)
  })
}

test('exactly one GA page_view per SPA navigation', async ({
  page,
  gaCollect,
}) => {
  test.setTimeout(90_000)
  await setup(page)
  const hits = hitsOf(gaCollect)
  await page.goto(`${PROD_ORIGIN}/district/61`, { waitUntil: 'load' })
  await expectSettledCount(hits, 1)
  await page.locator('a[href="/district/61/clubs"]').first().click()
  await expect(page).toHaveURL(/\/district\/61\/clubs/)
  await expectSettledCount(hits, 2)
  expect(new URL(hits()[1]!.dl).pathname).toBe('/district/61/clubs')
})
