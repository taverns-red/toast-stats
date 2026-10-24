import { test, expect, type Page } from './fixtures/test'

/* Landing at 375: the phone title fits and payments show (#2256).
 *
 * Found live on 2.67.0 (#2249):
 *  1. The context bar carried the H1's full text, "Find a district, club or
 *     region", which needs ~242px in a ~208px title slot, so it ellipsised
 *     to "Find a district, club or r…".
 *  2. The Total Payments KPI card is demoted (display: none) below 768, so
 *     phones never saw the payments total or its delta, though the approved
 *     brief (§3) puts payments in the 375 World pulse.
 *
 * Now the bar shows a shorter phone title (the H1's accessible name is
 * unchanged), and the World pulse carries a phone-only payments row: the
 * total and its delta on one line, rendered in the loading shell too so it
 * is part of the pulse's reserve.
 *
 * Measured on the deployed preview (BASE_URL) — jsdom has no layout
 * (Lesson 134). Both engines run this file (playwright.config.ts).
 */

async function load(page: Page, width: number, theme: 'light' | 'dark') {
  await page.setViewportSize({ width, height: 812 })
  await page.addInitScript(t => {
    try {
      localStorage.setItem('theme', t)
    } catch {
      /* storage blocked: the default theme is still measured */
    }
  }, theme)
  await page.goto('/', { waitUntil: 'networkidle', timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready)
  await expect(
    page.locator('.world-pulse__table tbody tr').first()
  ).toBeVisible({ timeout: 30_000 })
}

for (const theme of ['light', 'dark'] as const) {
  test(`phone title is not truncated at 375px (${theme})`, async ({ page }) => {
    await load(page, 375, theme)
    const title = page.locator('.context-bar__title')
    await expect(title).toBeVisible()
    const m = await title.evaluate(el => ({
      text: el.textContent ?? '',
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }))
    expect(m.text.trim().length).toBeGreaterThan(0)
    expect(m.text, 'the phone title carries no ellipsis').not.toMatch(/…/)
    expect(
      m.scrollWidth,
      `"${m.text}" needs ${m.scrollWidth}px in a ${m.clientWidth}px slot`
    ).toBeLessThanOrEqual(m.clientWidth)

    // The H1's accessible name is unchanged.
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /Find a district, club or region/,
      })
    ).toHaveCount(1)
  })

  test(`payments total and YTD delta show on one line in the World pulse at 375px (${theme})`, async ({
    page,
  }) => {
    await load(page, 375, theme)
    const row = page.getByTestId('pulse-payments')
    await expect(row).toBeVisible()
    const total = page.getByTestId('pulse-payments-total')
    const delta = page.getByTestId('pulse-payments-delta')
    await expect(total).toHaveText(/^\d{1,3}(,\d{3})*$/)
    await expect(delta).toHaveText(/^[+−]?[\d,]+ vs last PY/)
    // The label says what the delta compares: YTD against last year's total.
    await expect(row).toContainText(/YTD/)

    const m = await page.evaluate(() => {
      const box = (s: string) =>
        document.querySelector(s)!.getBoundingClientRect()
      const row = document.querySelector(
        '[data-testid="pulse-payments"]'
      ) as HTMLElement
      const t = box('[data-testid="pulse-payments-total"]')
      const d = box('[data-testid="pulse-payments-delta"]')
      const line = document.querySelector(
        '.world-pulse__payments-line'
      ) as HTMLElement
      const pulse = box('.world-pulse')
      return {
        totalTop: t.top,
        totalBottom: t.bottom,
        deltaTop: d.top,
        deltaBottom: d.bottom,
        deltaHeight: d.height,
        deltaLine: parseFloat(
          getComputedStyle(
            document.querySelector('[data-testid="pulse-payments-delta"]')!
          ).lineHeight
        ),
        lineOverflow: line.scrollWidth > line.clientWidth,
        rowHeight: row.getBoundingClientRect().height,
        rowReserve: parseFloat(getComputedStyle(row).minHeight),
        inPulse:
          box('[data-testid="pulse-payments"]').top >= pulse.top &&
          box('[data-testid="pulse-payments"]').bottom <= pulse.bottom,
      }
    })
    expect(m.inPulse, 'the payments row sits inside the World pulse').toBe(true)
    // One line: the delta is a single line box, vertically within the
    // total's line, and nothing overflows the row.
    expect(m.deltaHeight).toBeLessThan(m.deltaLine * 1.5)
    expect(m.deltaTop).toBeGreaterThanOrEqual(m.totalTop - 1)
    expect(m.deltaBottom).toBeLessThanOrEqual(m.totalBottom + 1)
    expect(m.lineOverflow, 'payments line overflows its row').toBe(false)
    // It fits its reserve (the loading shell renders the same row).
    expect(
      m.rowHeight,
      `payments row ${m.rowHeight}px overruns its ${m.rowReserve}px reserve`
    ).toBeLessThanOrEqual(m.rowReserve + 1)
  })
}

test('the phone payments row stays out of the desktop pulse at 1280px', async ({
  page,
}) => {
  await load(page, 1280, 'light')
  // Desktop shows payments in the KPI strip; the pulse row is phone-only.
  await expect(page.getByTestId('kpi-total-payments')).toBeVisible()
  await expect(page.getByTestId('pulse-payments')).toBeHidden()
})
