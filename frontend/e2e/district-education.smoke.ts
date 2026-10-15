import { test, expect, type Page } from './fixtures/test'

/* District Education page (#1793, epic #1781) — measured on the deployed
 * preview (BASE_URL) at 375 and 768 (light + dark) and 1280:
 *
 *  - KPI strip prints five values as text (a number or "Not measured");
 *  - level rows by default, path rows at ?by=path — same route, URL state;
 *  - the Pathways-only matrix is inline at ≥768 and in a full-screen sheet
 *    region behind "Open matrix" below, cells ≥32px with ≥14px text;
 *  - the division/area rollup and the leaderboards render;
 *  - ≥44px targets on the page body and zero document overflow at 375. */

const EDUCATION = '/district/61/education'
const KPI = '.education-kpi'

async function load(page: Page, url = EDUCATION): Promise<void> {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.locator(KPI).first().waitFor({ timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready)
}

async function assertKpis(page: Page): Promise<void> {
  const items = page
    .getByRole('list', { name: 'Education at a glance' })
    .getByRole('listitem')
  await expect(items).toHaveCount(5)
  for (const t of await items.allTextContents()) {
    expect(t).toMatch(/\d|Not measured/)
  }
}

const metrics = (page: Page) =>
  page.evaluate(() => {
    const body = document.querySelector('.education-page')!
    const targets = Array.from(
      body.querySelectorAll(
        '.education-switch__link, .education-row__button:not(:disabled), .education-open-matrix'
      )
    ).map(e => e.getBoundingClientRect())
    const kpi = document.querySelector('.education-kpi')
    return {
      small: targets.filter(r => r.height < 44).length,
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
  test.describe(`education at 375 (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize({ width: 375, height: 812 })
    })

    test('KPIs, level rows, sheet matrix, no overflow, 44px targets', async ({
      page,
    }) => {
      await load(page)
      await page.addStyleTag({
        content: 'html,body{overflow-x:visible !important}',
      })
      await assertKpis(page)
      await expect(
        page.getByRole('list', { name: 'Awards by level' }).getByRole('button')
      ).toHaveCount(6)
      // Matrix is not inline on a phone.
      await expect(
        page.locator('.education-page table.education-matrix')
      ).toHaveCount(0)
      const m = await metrics(page)
      expect(m.small).toBe(0)
      expect(m.overflow).toBeLessThanOrEqual(0)
      expect(lum(m.kpiBg) < 128).toBe(theme === 'dark')

      await page.getByRole('button', { name: 'Open matrix' }).click()
      const region = page
        .getByRole('dialog')
        .getByRole('region', { name: /Level × path/ })
      await expect(region).toBeVisible()
      const cell = await region
        .locator('.education-matrix__cell')
        .first()
        .evaluate(e => {
          const r = e.getBoundingClientRect()
          return {
            h: r.height,
            w: r.width,
            font: parseFloat(getComputedStyle(e).fontSize),
          }
        })
      expect(cell.h).toBeGreaterThanOrEqual(32)
      expect(cell.w).toBeGreaterThanOrEqual(32)
      expect(cell.font).toBeGreaterThanOrEqual(14)
    })

    test('?by=path shows one row per path on the same route', async ({
      page,
    }) => {
      await load(page, `${EDUCATION}?by=path`)
      const rows = page
        .getByRole('list', { name: 'Awards by path' })
        .getByRole('listitem')
      expect(await rows.count()).toBeGreaterThanOrEqual(11)
      await expect(page).toHaveURL(/\/district\/61\/education\?by=path/)
    })
  })

  test(`education at 768 (${theme}): matrix inline, no overflow`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme })
    await page.setViewportSize({ width: 768, height: 1024 })
    await load(page)
    await assertKpis(page)
    await expect(
      page.getByRole('table', { name: /Level × path/ })
    ).toBeVisible()
    const m = await metrics(page)
    expect(m.overflow).toBeLessThanOrEqual(0)
  })
}

test('education at 1280: KPIs in one row, matrix, rollup and leaderboards', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await load(page)
  await assertKpis(page)
  const tops = await page
    .locator(KPI)
    .evaluateAll(es => es.map(e => Math.round(e.getBoundingClientRect().top)))
  expect(new Set(tops).size).toBe(1)
  await expect(page.getByRole('table', { name: /Level × path/ })).toBeVisible()
  await expect(
    page.getByRole('table', { name: 'Education by division' })
  ).toBeVisible()
  await expect(
    page.locator('#leaderboards [data-testid="education-awards-leaderboard"]')
  ).toHaveCount(2)
})

test('the old Analytics anchor lands on the Education leaderboards', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/district/61/analytics#education-awards', {
    waitUntil: 'networkidle',
    timeout: 60_000,
  })
  await expect(page).toHaveURL(/\/district\/61\/education.*#leaderboards$/)
  await expect(page.locator('#leaderboards')).toBeVisible()
})
