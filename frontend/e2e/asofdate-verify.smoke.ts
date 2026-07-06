import { test, expect } from '@playwright/test'

/**
 * Sprint 1 / epic #1319 verification (#1320).
 *
 * The rankings fetch API was renamed: `CdnRankingsData.date` → `asOfDate`.
 * Every DataControlsBar on Districts / Regions / Region is now fed from
 * `data?.asOfDate`. If the rename silently fed `undefined` through, the
 * freshness pill would render "Invalid Date" or lose its date. This drives the
 * three real pages on the PR preview and asserts each freshness pill still
 * shows a genuine as-of date — the "no behavior change beyond naming" criterion.
 *
 * Runs under BOTH the `smoke` (Chromium) and `webkit` (Safari) projects.
 */

const DATE_RE =
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/

for (const { name, path } of [
  { name: 'Districts (/)', path: '/' },
  { name: 'Regions (/regions)', path: '/regions' },
  { name: 'Region (/region/7)', path: '/region/7' },
]) {
  test(`${name}: freshness pill shows a real as-of date`, async ({
    page,
  }, testInfo) => {
    await page.goto(path)

    const pill = page.getByTestId('freshness-pill').first()
    await expect(pill).toBeVisible({ timeout: 15_000 })

    const text = (await pill.textContent())?.trim() ?? ''
    expect(text).not.toContain('Invalid Date')
    expect(text).toMatch(DATE_RE)

    await page.screenshot({
      path: `/tmp/1320-${testInfo.project.name}-${path.replace(/\W+/g, '_')}.png`,
      fullPage: true,
    })
  })
}
