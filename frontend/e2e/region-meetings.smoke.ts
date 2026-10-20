import { test, expect, type Page } from './fixtures/test'
import recorded from '../src/__tests__/fixtures/meeting-times-2026-10-19.recorded.json' with { type: 'json' }

/* Region and world meeting-time heatmaps (#1814) — measured on the deployed
 * preview (BASE_URL) at 375, 768 and 1280, light and dark.
 *
 * `meeting-times.json` is not on any CDN until the pipeline PR lands and a
 * run writes it, so every test serves the recorded file (the pipeline
 * builder over recorded prod 2026-10-19 district files: Region 05's seven
 * districts plus 17, 49 and U) by route interception, or a 404 to hold the
 * "not available yet" state. */

const REGION = '/region/05/meetings'
const WORLD = '/regions/meetings'

async function serve(page: Page, body: unknown | null): Promise<void> {
  await page.route('**/snapshots/*/meeting-times.json', r =>
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

async function load(page: Page, url: string, ready: string): Promise<void> {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90_000 })
  await page.locator(ready).first().waitFor({ timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready)
}

const metrics = (page: Page) =>
  page.evaluate(() => {
    const cells = Array.from(
      document.querySelectorAll('a.meeting-cell, .meetings-switch__link')
    ).map(e => e.getBoundingClientRect())
    const filled = document.querySelector('.meeting-cell--l4')
    return {
      // Below 1024 every cell is a ≥44px tap target (days are columns).
      small: cells.filter(r => r.height < 44 || r.width < 44).length,
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      filledBg: filled ? getComputedStyle(filled).backgroundColor : '',
    }
  })

const lum = (rgb: string) => {
  const [r, g, b] = (rgb.match(/\d+/g) ?? ['0', '0', '0']).map(Number)
  return (r! + g! + b!) / 3
}

for (const [label, url, child] of [
  ['region', REGION, 'District 61'],
  ['world', WORLD, 'Region 05'],
] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [375, 768, 1280] as const) {
      test(`${label} meetings at ${width} (${theme}): grid, drill-down, no overflow`, async ({
        page,
      }) => {
        test.setTimeout(120_000)
        await serve(page, recorded)
        await page.emulateMedia({ colorScheme: theme })
        await page.setViewportSize({ width, height: 900 })
        await load(page, url, '.meeting-cell')
        await page.addStyleTag({
          content: 'html,body{overflow-x:visible !important}',
        })

        await expect(
          page.getByRole('list', { name: /meetings at a glance/i })
        ).toContainText(/\d+ of \d+/)
        await expect(page.getByTestId('meetings-time-basis')).toContainText(
          /local time/i
        )

        // A cell lists the level below, linking down with the same cell.
        await page
          .getByRole('link', { name: /^Tuesday 19:00–19:59: \d+ clubs$/ })
          .click()
        const panel = page.getByRole('region', { name: /Tuesday 19:00/ })
        await expect(
          panel.getByRole('link', { name: new RegExp(child) })
        ).toHaveAttribute('href', /\/meetings\?.*slot=tue-19/)

        const m = await metrics(page)
        if (width < 1024) expect(m.small).toBe(0)
        expect(m.overflow).toBeLessThanOrEqual(0)
        expect(lum(m.bodyBg) < 128).toBe(theme === 'dark')
      })
    }
  }
}

test('region meetings without meeting-times.json say not available yet, never 0', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await serve(page, null)
  await page.setViewportSize({ width: 1280, height: 900 })
  await load(page, REGION, '[data-testid="meetings-unavailable"]')
  await expect(page.getByTestId('meetings-unavailable')).toContainText(
    /not available yet/i
  )
  await expect(page.locator('.meeting-cell')).toHaveCount(0)
})

test('an unpadded region id redirects to the canonical meetings URL (#2130)', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await serve(page, recorded)
  await load(page, '/region/5/meetings', '.meeting-cell')
  await expect(page).toHaveURL(/\/region\/05\/meetings$/)
})
