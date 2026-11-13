import { test, expect, type Page } from './fixtures/test'
import { resolveBaseUrl } from './helpers/baseUrl'

/* Cookie and analytics consent (#2584).
 *
 * - Opt-in: with no choice, or Minimal or None, no request goes to
 *   googletagmanager.com. With All, the gtag library loads.
 * - The banner is a fixed overlay: it adds no layout shift and no page
 *   height, and at 375 it sits inside the viewport.
 * - "Privacy & cookies" reopens the choice.
 *
 * GA only runs on the production hostname, so pages are served AS
 * https://ts.taverns.red (every request to that origin is answered from
 * BASE_URL), as in ga-page-view.smoke.ts. Collect hits are stubbed by the
 * shared fixture. `consent: 'unset'` skips the fixture's seeded choice so
 * the banner shows.
 */

test.use({ consent: 'unset' })

const PROD_ORIGIN = 'https://ts.taverns.red'
const BASE = resolveBaseUrl(process.env).replace(/\/$/, '')
const GTM = /(^|\.)googletagmanager\.com$/

async function serveAsProd(page: Page): Promise<string[]> {
  const gtmRequests: string[] = []
  page.on('request', req => {
    if (GTM.test(new URL(req.url()).hostname)) gtmRequests.push(req.url())
  })
  if (BASE !== PROD_ORIGIN) {
    await page.route(
      url => url.origin === PROD_ORIGIN,
      async route => {
        const u = new URL(route.request().url())
        try {
          const response = await route.fetch({
            url: `${BASE}${u.pathname}${u.search}`,
          })
          await route.fulfill({ response })
        } catch {
          // The page or context closed or navigated while the response was
          // in flight ("Fetch response has been disposed"): nothing is left
          // to fulfil, so drop the request instead of failing the test.
          await route.abort().catch(() => {})
        }
      }
    )
  }
  return gtmRequests
}

const banner = (page: Page) =>
  page.getByRole('region', { name: 'Privacy and cookies' })

async function open(page: Page): Promise<void> {
  await page.goto(`${PROD_ORIGIN}/`, { waitUntil: 'load' })
  await expect(banner(page)).toBeVisible({ timeout: 20_000 })
}

test('no choice yet: banner shows three equal buttons and no GA request', async ({
  page,
}) => {
  const gtm = await serveAsProd(page)
  await open(page)
  await expect(
    banner(page).getByRole('button', { name: /^Keep (all|minimal|none)$/ })
  ).toHaveCount(3)
  await page.waitForTimeout(3_000)
  expect(gtm).toEqual([])
})

for (const [label, level] of [
  ['Keep minimal', 'minimal'],
  ['Keep none', 'none'],
] as const) {
  test(`${level}: no request to googletagmanager.com, even after input`, async ({
    page,
  }) => {
    test.setTimeout(60_000)
    const gtm = await serveAsProd(page)
    await open(page)
    await banner(page).getByRole('button', { name: label }).click()
    await expect(banner(page)).toBeHidden()
    await page.mouse.click(5, 300) // pointer input would trigger a GA load
    await page.waitForTimeout(12_000) // past the loader's 10 s cap
    expect(gtm).toEqual([])
    const cookies = await page.context().cookies()
    expect(cookies.filter(c => c.name.startsWith('_ga'))).toEqual([])
    expect(cookies.some(c => c.name === 'rt_consent')).toBe(true)
  })
}

test('all: the gtag library loads, once', async ({ page }) => {
  test.setTimeout(60_000)
  const gtm = await serveAsProd(page)
  await open(page)
  await banner(page).getByRole('button', { name: 'Keep all' }).click()
  await expect
    .poll(() => gtm.filter(u => u.includes('/gtag/js')).length, {
      timeout: 30_000,
    })
    .toBe(1)
})

test('lowering from all to minimal stops GA and clears _ga cookies', async ({
  page,
}) => {
  test.setTimeout(60_000)
  const gtm = await serveAsProd(page)
  await open(page)
  await banner(page).getByRole('button', { name: 'Keep all' }).click()
  await expect.poll(() => gtm.length, { timeout: 30_000 }).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Privacy & cookies' }).first().click()
  await banner(page).getByRole('button', { name: 'Keep minimal' }).click()
  await expect(banner(page)).toBeHidden()
  await expect
    .poll(
      async () =>
        (await page.context().cookies()).filter(c => c.name.startsWith('_ga'))
          .length
    )
    .toBe(0)
})

test('banner is a fixed overlay: no shift, no extra page height', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.addInitScript(() => {
    ;(window as unknown as { __cls: number }).__cls = 0
    new PerformanceObserver(list => {
      for (const e of list.getEntries() as unknown as Array<{
        value: number
        hadRecentInput: boolean
      }>) {
        if (!e.hadRecentInput) {
          ;(window as unknown as { __cls: number }).__cls += e.value
        }
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })
  await page.goto(`${BASE}/`, { waitUntil: 'load' })
  await expect(banner(page)).toBeVisible({ timeout: 20_000 })
  const box = (await banner(page).boundingBox())!
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(812)
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(375)
  const position = await banner(page).evaluate(
    el => getComputedStyle(el).position
  )
  expect(position).toBe('fixed')
  // One synchronous moment, so data still loading cannot grow the page
  // between the two reads: height with the banner, then with it hidden.
  const heights = await banner(page).evaluate(el => {
    const root = document.documentElement
    const withBanner = root.scrollHeight
    const prev = (el as HTMLElement).style.display
    ;(el as HTMLElement).style.display = 'none'
    const withoutBanner = root.scrollHeight
    ;(el as HTMLElement).style.display = prev
    return { withBanner, withoutBanner }
  })
  expect(heights.withBanner).toBe(heights.withoutBanner)
  await page.waitForTimeout(500)
  const shift = await page.evaluate(
    () => (window as unknown as { __cls: number }).__cls
  )
  expect(shift).toBeLessThan(0.1)
})

test('"Privacy & cookies" reopens the choice and keeps the current one', async ({
  page,
}) => {
  await page.goto(`${BASE}/`, { waitUntil: 'load' })
  await expect(banner(page)).toBeVisible({ timeout: 20_000 })
  await banner(page).getByRole('button', { name: 'Keep none' }).click()
  await expect(banner(page)).toBeHidden()
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(3_000)
  await expect(banner(page)).toBeHidden() // remembered
  const reopen = page.getByRole('button', { name: 'Privacy & cookies' })
  if (!(await reopen.first().isVisible())) {
    await page.getByRole('button', { name: /about/i }).first().click()
  }
  await reopen.first().click()
  await expect(banner(page)).toContainText('none')
  await banner(page).getByRole('button', { name: 'Close' }).click()
  await expect(banner(page)).toBeHidden()
})

test('choosing an option does not scroll the page (#2637)', async ({
  page,
}) => {
  await page.goto(`${BASE}/awards`, { waitUntil: 'load' })
  await expect(banner(page)).toBeVisible({ timeout: 20_000 })
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await banner(page).getByRole('button', { name: 'Keep none' }).click()
  await expect(banner(page)).toBeHidden()
  // Focus moves to <main>, the skip link's target, but the page stays put.
  await expect(page.locator('main#main-content')).toBeFocused()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
})

test('<main> is a programmatic focus target for the skip link (#2637)', async ({
  page,
}) => {
  await page.goto(`${BASE}/awards`, { waitUntil: 'load' })
  await expect(page.locator('main#main-content')).toHaveAttribute(
    'tabindex',
    '-1'
  )
})

/* D10 / #2674: on a phone the banner is one line plus Keep all, Keep none and
 * Details, and it never covers the bottom section bar. Boxes are measured, not
 * inferred from CSS. */
test.describe('phone, 375 wide (D10, #2674)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('the district banner sits above the section bar: boxes do not overlap', async ({
    page,
  }) => {
    await page.goto(`${BASE}/district/61`, { waitUntil: 'load' })
    await expect(banner(page)).toBeVisible({ timeout: 20_000 })
    const bar = page.getByTestId('district-section-bar')
    await expect(bar).toBeVisible()
    const b = (await banner(page).boundingBox())!
    const s = (await bar.boundingBox())!
    expect(b.y + b.height).toBeLessThanOrEqual(s.y + 0.5)
    expect(b.y).toBeGreaterThanOrEqual(0)
  })

  test('collapsed: one line of copy and three 44px controls, Details reveals the rest', async ({
    page,
  }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'load' })
    await expect(banner(page)).toBeVisible({ timeout: 20_000 })
    const controls = banner(page).getByRole('button')
    await expect(controls).toHaveText(['Keep none', 'Keep all', 'Details'])
    for (const btn of await controls.all()) {
      expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    }
    await expect(
      banner(page).getByRole('heading', { name: 'Privacy and cookies' })
    ).toBeHidden()
    const text = banner(page).locator('.consent-banner__text')
    const lineHeight = await text.evaluate(el =>
      parseFloat(getComputedStyle(el).lineHeight)
    )
    expect((await text.boundingBox())!.height).toBeLessThanOrEqual(
      lineHeight * 1.5
    )
    await banner(page).getByRole('button', { name: 'Details' }).click()
    await expect(
      banner(page).getByRole('button', { name: 'Keep minimal' })
    ).toBeVisible()
    await expect(
      banner(page).getByRole('link', { name: 'What each choice stores' })
    ).toBeVisible()
  })
})
