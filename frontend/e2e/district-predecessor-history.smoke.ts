import { test, expect, type Page } from './fixtures/test'

/* "Before this district existed" (#2427) on the deployed preview.
 *
 * District 201 was formed on 2026-07-01, so the panel is offered there,
 * collapsed, once its slot nears the viewport. District 61 existed last
 * year, so it never renders (one history shard decides that). The 375 page
 * budget is the hub smoke's (district-overview-hub-mobile.smoke.ts,
 * PAGE_MAX_H 4,000): the collapsed panel must fit inside it on D201 too.
 * Expanding is the reader's choice and is not held to the budget.
 */

const PHONE = { width: 375, height: 812 }
const PAGE_MAX_H = 4000

async function loadAndScroll(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
  await page
    .locator('[data-testid="district-hub-mobile"]:not(.district-hub--loading)')
    .waitFor({ state: 'visible', timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  // The panel's gate runs when its slot nears the viewport.
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight)
  )
}

for (const scheme of ['light', 'dark'] as const) {
  test(`D201 offers its predecessor history collapsed, inside the 375 budget (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize(PHONE)
    await loadAndScroll(page, '/district/201')

    const panel = page.locator('[data-testid="predecessor-history"]')
    await panel.waitFor({ state: 'visible', timeout: 30_000 })
    const toggle = panel.getByRole('button', {
      name: /before this district existed/i,
    })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')

    const m = await page.evaluate(() => ({
      pageH: document.documentElement.scrollHeight,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      toggleH: Math.round(
        document
          .querySelector('.predecessor-history__toggle')!
          .getBoundingClientRect().height
      ),
    }))
    console.log(`D201 page height at 375 (${scheme}, collapsed): ${m.pageH}px`)
    expect(m.pageH, JSON.stringify(m)).toBeLessThanOrEqual(PAGE_MAX_H)
    expect(m.overflowX, JSON.stringify(m)).toBeLessThanOrEqual(0)
    expect(m.toggleH, JSON.stringify(m)).toBeGreaterThanOrEqual(44)

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    // The full join: ~80 shards and one year-end per former district.
    const groups = panel.locator('[data-testid^="predecessor-"] dl')
    await groups.first().waitFor({ state: 'visible', timeout: 60_000 })
    await expect(
      panel.getByText(/current clubs under their former districts/i)
    ).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      )
    ).toBeLessThanOrEqual(0)
  })
}

test('D61 existed last year: no predecessor history panel', async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await loadAndScroll(page, '/district/61')
  // Give the one-shard gate time to settle, then confirm nothing rendered.
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)
  expect(
    await page.locator('[data-testid="predecessor-history"]').count()
  ).toBe(0)
})
