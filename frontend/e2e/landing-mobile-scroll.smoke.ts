import { test, expect, type Page } from '@playwright/test'

/* Landing-page mobile scroll-length guard (#864, epic #865 "mobile UX audit").
 *
 * Epic A turned `/` from a ~28-viewport scroll into a "find my district" page
 * via three sprints: hoist the picker + demote the KPI strip (#861), defer the
 * Awards Race behind a link (#862), and cap the districts list to the top
 * MOBILE_RANKINGS_CAP with a "Show all" disclosure on mobile (#863).
 *
 * Sprint 4 (#864) verified the cumulative win empirically: at 375px / 414px the
 * full-page scrollHeight dropped from a measured 19,529–22,176px baseline
 * (pre-#861, commit de7cf5e3) to ~5,046–5,433px — a 73.8–75.9% reduction in
 * both Chromium and WebKit, well past the epic's ≥60% target.
 *
 * This guard locks that win in. The mobile caps are render-time gates fed by a
 * separately-resolving rankings query (the Lesson 79 / 107 CLS shape): a future
 * change that un-defers the Awards Race or un-caps the list would silently
 * restore the multi-screen scroll. An 8,000px ceiling sits ~47% above the
 * current ~5.4k px ship (so ordinary content growth won't flake it) yet
 * guarantees a ≥59% reduction against the lowest measured baseline (19,529px) —
 * any regression toward the old uncapped page (the un-capped list alone adds
 * ~14k px) breaches it loudly. Runs in BOTH engines via playwright.config
 * (smoke=Chromium, webkit=Safari) because the mobile state is width-driven
 * (useIsMobile -> matchMedia), not touch-driven.
 *
 * #1834: the hard top-20 cap became the priority-columns list with a 25-row
 * reveal step (?rows=). Showing all 94 rows put the page at 7,481px, just
 * under budget; this guard now runs in CI (pr-preview.yml) so growth is
 * flagged instead of silently eating the margin. */

const SCROLL_BUDGET_PX = 8000

const VIEWPORTS = [
  { name: '375', width: 375, height: 812 }, // iPhone-class portrait
  { name: '414', width: 414, height: 896 }, // larger phone portrait
]

async function landingScrollHeight(page: Page): Promise<number> {
  await page.goto('/', { waitUntil: 'networkidle', timeout: 60_000 })

  // Wait for the rankings table to render so we measure the populated page,
  // not a loading skeleton (a skeleton is short and would falsely pass).
  await page
    .locator('table[aria-label="District rankings"]')
    .waitFor({ state: 'visible', timeout: 30_000 })

  // The phone rankings view must be active, or we'd be measuring the desktop
  // fallback and the budget would be meaningless. #1834 replaced the top-20
  // cap (#863) with the priority-columns table (every row, ~57px each vs the
  // capped view's ~120px), so the phone table is the marker now.
  await expect(page.locator('.priority-columns__table')).toBeVisible({
    timeout: 10_000,
  })

  // Let any secondary, separately-resolving section settle before measuring.
  await page.waitForTimeout(1_000)

  return page.evaluate(() => document.documentElement.scrollHeight)
}

for (const vp of VIEWPORTS) {
  test(`landing / stays under scroll budget at ${vp.name}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    const scrollHeight = await landingScrollHeight(page)
    expect(
      scrollHeight,
      `landing / scrollHeight ${scrollHeight}px exceeds the ${SCROLL_BUDGET_PX}px mobile budget at ${vp.width}px — the #861-#863 mobile caps may have regressed`
    ).toBeLessThanOrEqual(SCROLL_BUDGET_PX)
  })
}
