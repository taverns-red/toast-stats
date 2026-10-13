import { test, expect } from '@playwright/test'

/* Clubs-table Coach column (#1954), measured on the deployed preview.
 *
 *  - 1280: a "Coach" header; D61's live Coaches report (2026-10) has clubs
 *    with an active coach, so at least one row reads "Active"; every cell is
 *    Active / Completed / — and never a coach identity.
 *  - 375: ?coach=Active (the phone path — the row has no room for a flag)
 *    lists only the coached clubs, without pushing the page sideways. */

const CLUBS = '/district/61/clubs'

test('coach column at 1280', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(CLUBS, { waitUntil: 'networkidle', timeout: 60_000 })
  const header = page.getByRole('columnheader', { name: /\bCoach\b/ })
  await expect(header).toBeVisible({ timeout: 30_000 })
  const col = await header.evaluate(th =>
    Array.from(th.parentElement!.children).indexOf(th)
  )
  const cells = await page
    .locator('tbody tr')
    .evaluateAll(
      (rows, i) => rows.map(r => r.children[i]?.textContent?.trim() ?? ''),
      col
    )
  expect(cells.length).toBeGreaterThan(0)
  expect(cells).toContain('Active')
  for (const c of cells) expect(c).toMatch(/^(Active|Completed|—|-|)$/)
})

for (const theme of ['light', 'dark'] as const) {
  test(`coach filter on phones at 375 (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })
    await page.setViewportSize({ width: 375, height: 812 })
    // Phones reach coach status through the URL-synced Coach filter: the row
    // itself has no room for a flag (#1954).
    await page.goto(`${CLUBS}?coach=Active`, {
      waitUntil: 'networkidle',
      timeout: 60_000,
    })
    await page.getByTestId('mobile-row').first().waitFor({ timeout: 30_000 })
    await page.addStyleTag({
      content: 'html,body{overflow-x:visible !important}',
    })
    const m = await page.evaluate(() => ({
      rows: document.querySelectorAll('[data-testid="mobile-row"]').length,
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    }))
    // D61 has a handful of actively coached clubs, never the whole district.
    expect(m.rows).toBeGreaterThan(0)
    expect(m.rows).toBeLessThan(30)
    expect(m.overflow).toBeLessThanOrEqual(0)
  })
}
