import { test, expect, type Page } from './fixtures/test'
import region09 from '../src/__tests__/fixtures/charter-cohort-survival-region-09.json' with { type: 'json' }
import world from '../src/__tests__/fixtures/charter-cohort-survival-world.json' with { type: 'json' }

/* Region and world charter cohort survival (#1818) — measured on the
 * deployed preview (BASE_URL) at 375, 768 and 1280, light and dark.
 *
 * The CDN has no region or world file until a pipeline run writes them, so
 * every test serves the recorded files (the pipeline fold over the
 * recorded prod histories) by route interception, or a 404 to hold the
 * "not available yet" state. */

const REGION = '/region/09/growth/survival'
const WORLD = '/regions/growth/survival'

async function serve(
  page: Page,
  files: Record<string, unknown | null>
): Promise<void> {
  for (const [name, body] of Object.entries(files)) {
    await page.route(`**/config/charter-cohort-survival/${name}`, r =>
      body === null
        ? r.fulfill({
            status: 404,
            headers: { 'access-control-allow-origin': '*' },
            body: '',
          })
        : r.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify(body),
          })
    )
  }
}

async function load(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90_000 })
  await page.locator('.survival-kpis').waitFor({ timeout: 30_000 })
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

for (const [label, url, file] of [
  ['region', REGION, { 'region_09.json': region09 }],
  ['world', WORLD, { 'world.json': world }],
] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [375, 768, 1280] as const) {
      test(`${label} survival at ${width} (${theme}): headline, chart, table, no overflow`, async ({
        page,
      }) => {
        test.setTimeout(120_000)
        await serve(page, file)
        await page.emulateMedia({ colorScheme: theme })
        await page.setViewportSize({ width, height: 900 })
        await load(page, url)
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
        await expect(
          page.getByRole('img', {
            name: /club survival by years since charter/i,
          })
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
}

test('an unpadded region id lands on the padded survival URL (#2130)', async ({
  page,
}) => {
  await serve(page, { 'region_09.json': region09 })
  await page.goto('/region/9/growth/survival?py=2026', {
    waitUntil: 'networkidle',
    timeout: 90_000,
  })
  await expect(page).toHaveURL(/\/region\/09\/growth\/survival\?py=2026$/)
})

test('says region survival is not available yet on a 404, with no curve', async ({
  page,
}) => {
  await serve(page, { 'region_09.json': null })
  await page.goto(REGION, { waitUntil: 'networkidle', timeout: 90_000 })
  await expect(page.getByTestId('survival-not-available')).toContainText(
    /not available yet/i
  )
  await expect(page.locator('.survival-kpis')).toHaveCount(0)
})
