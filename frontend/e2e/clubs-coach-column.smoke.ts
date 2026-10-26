import { test, expect } from './fixtures/test'

/* Clubs-table Coach column (#1954), measured on the deployed preview.
 *
 *  - 1280: a "Coach" header; D61's live Coaches report (2026-10) has clubs
 *    with an active coach, so at least one row reads "Active"; every cell is
 *    Active / Completed / — and never a coach identity.
 *  - 375: ?coach=Active lists only the coached clubs, without pushing the
 *    page sideways, and every one of those rows carries the line-1 "Coach"
 *    flag (#1968) — whole, inside the row, beside an unclipped status chip. */

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
    // The URL-synced Coach filter narrows to the coached clubs; each row
    // flags itself on line 1 (#1968).
    await page.goto(`${CLUBS}?coach=Active`, {
      waitUntil: 'networkidle',
      timeout: 60_000,
    })
    await page.getByTestId('mobile-row').first().waitFor({ timeout: 30_000 })
    await page.addStyleTag({
      content: 'html,body{overflow-x:visible !important}',
    })
    const m = await page.evaluate(() => {
      const clipped = (el: Element | null) =>
        !el ||
        Array.from(el.querySelectorAll('*'))
          .concat(el)
          .some(e => e.scrollWidth > e.clientWidth + 0.5)
      const inside = (el: Element | null, r: DOMRect) => {
        const b = el?.getBoundingClientRect()
        return (
          !!b &&
          b.width > 0 &&
          b.left >= r.left - 0.5 &&
          b.right <= r.right + 0.5 &&
          b.top >= r.top - 0.5 &&
          b.bottom <= r.bottom + 0.5
        )
      }
      const rows = Array.from(
        document.querySelectorAll('[data-testid="mobile-row"]')
      ).map(row => {
        const r = row.getBoundingClientRect()
        const badge = row.querySelector('.mobile-row__line1 .mobile-row__badge')
        const chip = row.querySelector('.mobile-row__chip')
        return {
          name: row.getAttribute('aria-label') ?? '',
          badge: badge?.textContent?.trim() ?? '',
          badgeOk: inside(badge, r) && !clipped(badge),
          chipOk: inside(chip, r) && !clipped(chip),
          height: Math.round(r.height),
          titleLines: (() => {
            const t = row.querySelector('.mobile-row__title')
            if (!t) return 0
            const lh = parseFloat(getComputedStyle(t).lineHeight)
            return Math.round(t.getBoundingClientRect().height / lh)
          })(),
        }
      })
      return {
        rows,
        overflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      }
    })
    // D61 has a handful of actively coached clubs, never the whole district.
    expect(m.rows.length).toBeGreaterThan(0)
    expect(m.rows.length).toBeLessThan(30)
    expect(m.overflow).toBeLessThanOrEqual(0)
    for (const row of m.rows) {
      const ctx = JSON.stringify(row)
      expect(row.badge, ctx).toBe('Coach')
      expect(row.badgeOk, ctx).toBe(true)
      expect(row.chipOk, ctx).toBe(true)
      expect(row.name, ctx).toMatch(/, active coach,/)
      // #2335 (the #2331 rule): a name may wrap to 2 lines beside the badge
      // instead of ellipsizing; only a wrapped row may grow, to 82 px.
      expect(row.titleLines, ctx).toBeGreaterThanOrEqual(1)
      expect(row.titleLines, ctx).toBeLessThanOrEqual(2)
      expect(row.height, ctx).toBeLessThanOrEqual(row.titleLines > 1 ? 82 : 64)
    }
  })
}
