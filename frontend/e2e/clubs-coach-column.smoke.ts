import { test, expect } from '@playwright/test'

/* Clubs-table Coach column (#1954), measured on the deployed preview.
 *
 *  - 1280: a "Coach" header; D61's live Coaches report (2026-10) has clubs
 *    with an active coach, so at least one row reads "Active"; every cell is
 *    Active / Completed / — and never a coach identity.
 *  - 375: an active coach rides the phone row's line 2 ("· Coach") without
 *    pushing the page sideways. */

const CLUBS = '/district/61/clubs'

test('coach column at 1280', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(CLUBS, { waitUntil: 'networkidle', timeout: 60_000 })
  const header = page.getByRole('columnheader', { name: /^Coach/ })
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
  test(`coach flag on phone rows at 375 (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })
    await page.setViewportSize({ width: 375, height: 812 })
    // A non-default sort shows the flat list of every club (#1833).
    await page.goto(`${CLUBS}?sort=name&dir=desc`, {
      waitUntil: 'networkidle',
      timeout: 60_000,
    })
    await page.getByTestId('mobile-row').first().waitFor({ timeout: 30_000 })
    await page.addStyleTag({
      content: 'html,body{overflow-x:visible !important}',
    })
    const m = await page.evaluate(() => ({
      flagged: [...document.querySelectorAll('[data-testid="mobile-row"]')]
        .map(r => r.querySelector('.mobile-row__line2')?.textContent ?? '')
        .filter(t => /· Coach$/.test(t.trim())).length,
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    }))
    expect(m.flagged).toBeGreaterThan(0)
    expect(m.overflow).toBeLessThanOrEqual(0)
  })
}
