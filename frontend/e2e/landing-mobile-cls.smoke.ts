import { test, expect, type Page } from '@playwright/test'

/* Mobile loading/error→loaded CLS guard for the landing page (#922).
 *
 * The landing `renderShell` (#826/#488/#861) pins the header chrome + KPI
 * strip across the loading / error / loaded states — but the loaded state
 * stacks a header-actions toolbar (freshness pill · PY chip · date chip ·
 * Export · Share) between the intro and the KPI strip on mobile, which the
 * shell historically did NOT reserve. At 390px that inserted ~148px above
 * the KPI strip on loading→loaded — a deterministic CLS source the desktop
 * Lighthouse gate is blind to (desktop lays the toolbar inline; no vertical
 * shift). #922 reserves the slot with a structural skeleton; this guard
 * proves the geometry live, in both engines.
 *
 * Method (Lesson 134): bounding-box equality of `.districts-kpi-strip`
 * across states — `toBeVisible`-style assertions can't see a shift. The
 * rankings payload is gated/aborted via routing so each state is provably
 * the one measured. Both `v1/rankings.json` and the date-keyed
 * `snapshots/<date>/all-districts-rankings.json` feed the same query (the
 * date-keyed one wins once the cached-dates query resolves), so the glob
 * must cover BOTH or the page quietly loads anyway. Measure after
 * `document.fonts.ready` — the web-font swap transiently reflows widths
 * (Lesson 134). */

const VIEWPORT = { width: 390, height: 844 }

// Loading/error and loaded shells must agree to sub-pixel; 1px absorbs
// engine rounding without admitting any real shift (a single reflowed
// toolbar row is ≥44px).
const TOLERANCE_PX = 1

const RANKINGS_GLOB = '**/*rankings.json'

async function kpiStripY(page: Page): Promise<number> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await page.evaluate(() => window.scrollTo(0, 0))
  const box = await page.locator('.districts-kpi-strip').boundingBox()
  if (!box) throw new Error('.districts-kpi-strip has no bounding box')
  return box.y
}

test.beforeEach(async ({ page }) => {
  // Route-gated navigations + React Query retry backoff overrun the 30s
  // config default on a cold preview channel (cf. touch-targets.smoke.ts).
  test.setTimeout(90_000)
  await page.setViewportSize(VIEWPORT)
})

test('landing / loading shell holds the KPI strip at the loaded y (390px)', async ({
  page,
}) => {
  // Hold every rankings fetch so the loading skeleton is the measured state.
  let release: (() => void) | undefined
  const gate = new Promise<void>(r => (release = r))
  await page.route(RANKINGS_GLOB, async route => {
    await gate
    await route.continue()
  })

  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await expect(
    page.getByRole('status', { name: /loading district rankings/i })
  ).toBeVisible({ timeout: 30_000 })
  const loadingY = await kpiStripY(page)

  release?.()
  await page
    .locator('table[aria-label="District rankings"]')
    .waitFor({ state: 'visible', timeout: 30_000 })
  // The freshness pill renders only once the cached-dates query (not gated
  // above) resolves; measure the settled 3-chip toolbar, not a 2-chip
  // intermediate that wraps one row shorter.
  await page
    .locator('[data-testid="freshness-pill"]')
    .waitFor({ state: 'visible', timeout: 30_000 })
  const loadedY = await kpiStripY(page)

  expect(
    Math.abs(loadedY - loadingY),
    `loading→loaded shifted .districts-kpi-strip from y=${loadingY} to y=${loadedY} at 390px — the renderShell actions skeleton (#922) may have drifted from the loaded toolbar's geometry`
  ).toBeLessThanOrEqual(TOLERANCE_PX)
})

test('landing / error shell holds the KPI strip at the loading y (390px)', async ({
  page,
}) => {
  // Abort every rankings fetch (incl. query retries) → generic error state.
  await page.route(RANKINGS_GLOB, route => route.abort())

  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await expect(
    page.getByRole('status', { name: /loading district rankings/i })
  ).toBeVisible({ timeout: 30_000 })
  const loadingY = await kpiStripY(page)

  // React Query retries before settling on error — allow the full backoff.
  await expect(page.getByText('Error Loading Rankings')).toBeVisible({
    timeout: 30_000,
  })
  const errorY = await kpiStripY(page)

  expect(
    Math.abs(errorY - loadingY),
    `loading→error shifted .districts-kpi-strip from y=${loadingY} to y=${errorY} at 390px — an error branch may be bypassing renderShell (Lesson 125)`
  ).toBeLessThanOrEqual(TOLERANCE_PX)
})
