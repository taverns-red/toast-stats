import { gzipSync } from 'node:zlib'
import { test, expect, type Page } from './fixtures/test'
import survivalD61 from '../src/__tests__/fixtures/charter-cohort-survival-d61.json' with { type: 'json' }

/* District charter cohort survival (#1817, epic #1781) — measured on the
 * deployed preview (BASE_URL) at 375, 768 and 1280, light and dark:
 *
 *  - three headline tiles print a value as text (a % or "—" + Not reached);
 *  - the chart, its legend and the data table render;
 *  - a cohort link highlights that cohort in the URL (`?cohort=`), same
 *    route, and the legend names it;
 *  - ≥44px cohort links and zero document overflow — the table scrolls in
 *    its own region (its `.sr-only` cells once scrolled the page to 936px
 *    at 375).
 *
 * Until the per-district survival file (#2061) is on the CDN the page reads,
 * it folds the 100 history shards (the tests above run whichever path the
 * CDN serves). The last test serves the recorded D61 file and holds the
 * route to the file path's wire budget. */

const SURVIVAL = '/district/61/growth/survival'

async function load(page: Page, url = SURVIVAL): Promise<void> {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
  // 100 history shards: allow for a slow runner.
  await page.locator('.survival-kpis').waitFor({ timeout: 90_000 })
  await page.evaluate(() => document.fonts.ready)
}

const metrics = (page: Page) =>
  page.evaluate(() => {
    const links = Array.from(
      document.querySelectorAll('.survival-switch__link')
    ).map(e => e.getBoundingClientRect())
    const kpi = document.querySelector('.survival-kpi')
    return {
      small: links.filter(r => r.height < 44).length,
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      kpiBg: kpi ? getComputedStyle(kpi).backgroundColor : '',
    }
  })

const lum = (rgb: string) => {
  const [r, g, b] = (rgb.match(/\d+/g) ?? ['0', '0', '0']).map(Number)
  return (r! + g! + b!) / 3
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [375, 768, 1280] as const) {
    test(`survival at ${width} (${theme}): headline, chart, table, no overflow`, async ({
      page,
    }) => {
      test.setTimeout(180_000)
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize({ width, height: 900 })
      await load(page)
      await page.addStyleTag({
        content: 'html,body{overflow-x:visible !important}',
      })

      const tiles = page
        .getByRole('list', { name: /survival after/i })
        .getByRole('listitem')
      await expect(tiles).toHaveCount(3)
      for (const t of await tiles.allTextContents()) {
        expect(t).toMatch(/\d+%|Not reached/)
      }
      await expect(page.getByTestId('survival-legend')).toBeVisible()
      await expect(
        page.getByRole('img', { name: /club survival by years since charter/i })
      ).toBeVisible()
      await expect(
        page.getByRole('table', { name: /survival by charter year/i })
      ).toBeVisible()

      const m = await metrics(page)
      expect(m.small).toBe(0)
      expect(m.overflow).toBeLessThanOrEqual(0)
      expect(lum(m.kpiBg) < 128).toBe(theme === 'dark')
    })
  }
}

test('a cohort link highlights that cohort through the URL', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await load(page)
  const nav = page.getByRole('navigation', { name: /highlight a cohort/i })
  const link = nav.getByRole('link').nth(1)
  const label = (await link.textContent())!.trim()
  await link.click()
  await expect(page).toHaveURL(/[?&]cohort=\d{4}-\d{4}/)
  await expect(nav.locator('[aria-current="true"]')).toHaveText(label)
  await expect(page.getByTestId('survival-legend')).toContainText(label)
})

test('reads the district survival file: no history shard, fixed wire cost ≤ 500 KB (#2061)', async ({
  page,
}) => {
  test.setTimeout(120_000)
  // The staging CDN has no file until a pipeline run writes it: serve the
  // recorded D61 file (the pipeline fold over the recorded prod history).
  const body = JSON.stringify(survivalD61)
  await page.route('**/config/charter-cohort-survival/district_61.json', r =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body,
    })
  )
  const shards: string[] = []
  const sizes: Promise<number>[] = []
  page.on('request', req => {
    if (req.url().includes('/config/club-district-history/')) {
      shards.push(req.url())
    }
  })
  page.on('requestfinished', req => {
    if (req.url().includes('/config/charter-cohort-survival/')) return
    sizes.push(
      req
        .sizes()
        .then(s => s.responseBodySize + s.responseHeadersSize)
        .catch(() => 0)
    )
  })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(SURVIVAL, { waitUntil: 'networkidle', timeout: 90_000 })
  await page.locator('.survival-kpis').waitFor({ timeout: 30_000 })
  await expect(
    page.getByRole('table', { name: /survival by charter year/i })
  ).toBeVisible()

  expect(shards).toEqual([])
  const total = (await Promise.all(sizes)).reduce((a, b) => a + b, 0)
  // The served file is edge-compressed; count it gzipped, as it travels.
  const bytes = total + gzipSync(body).length
  test.info().annotations.push({ type: 'wire-bytes', description: `${bytes}` })
  expect(bytes).toBeLessThanOrEqual(500 * 1024)
})
