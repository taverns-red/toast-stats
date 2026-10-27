import { test, expect } from './fixtures/test'

/* Region District Recognition scoreboard fits the page (#2307).
 *
 * One card per tier sits in the KPI strip grid between the region totals
 * and the rankings table. On a 390 phone the cards stack one per row and
 * their "Nearest: District N — … to go" lines must wrap inside the card,
 * not widen the page; at 1280 the four cards share one row. Measured on
 * the deployed build (BASE_URL) with the live awards file. */

const PAGE = '/region/05'

for (const width of [390, 1280]) {
  test(`recognition scoreboard fits without horizontal page scroll at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(PAGE, { waitUntil: 'networkidle', timeout: 60_000 })
    const section = page.locator('[data-testid="region-recognition"]')
    await section.waitFor({ timeout: 30_000 })
    await page
      .locator('[data-testid="recognition-tier"]')
      .first()
      .waitFor({ timeout: 30_000 })
    await page.evaluate(() => document.fonts.ready)

    const m = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth
      const cards = [
        ...document.querySelectorAll('[data-testid="recognition-tier"]'),
      ].map(c => c.getBoundingClientRect())
      return {
        vw,
        scrollWidth: document.documentElement.scrollWidth,
        cardRights: cards.map(r => Math.round(r.right)),
        cardTops: cards.map(r => Math.round(r.top)),
        onTrackLines: document.querySelectorAll(
          '[data-testid="recognition-tier"] [data-testid="recognition-on-track"]'
        ).length,
      }
    })
    const ctx = JSON.stringify(m)
    expect(m.scrollWidth, ctx).toBeLessThanOrEqual(m.vw)
    for (const right of m.cardRights)
      expect(right, ctx).toBeLessThanOrEqual(m.vw)
    // Last year's pace (2025-26) is published, so every card carries its
    // on-track line, apart from the "meet it today" count.
    expect(m.onTrackLines, ctx).toBe(m.cardTops.length)
    const rows = new Set(m.cardTops).size
    if (width >= 1280) expect(rows, ctx).toBe(1)
    else expect(rows, ctx).toBe(m.cardTops.length)
  })
}
