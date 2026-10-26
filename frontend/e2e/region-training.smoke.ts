import { test, expect } from './fixtures/test'

/* Region officer-training table header on a phone (#2318).
 *
 * The round headers ("Round 2 (Nov–Feb) · opens Nov 1") span narrow
 * percentage columns, so on a 390 phone they wrapped word by word and broke
 * the date window at its dash: "ROUN… (NOV · OPE… NOV". Each part of the
 * header — the round, its months and the opening date — must stay on one
 * line; the table scrolls sideways for the rest.
 *
 * Measured on the deployed build (BASE_URL) with the live region rollups.
 */

const PAGE = '/region/05/training'

for (const theme of ['light', 'dark'] as const) {
  for (const width of [375, 390, 768, 1280]) {
    test(`round headers keep each part on one line at ${width}px (${theme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize({ width, height: 812 })
      await page.goto(PAGE, { waitUntil: 'networkidle', timeout: 60_000 })
      await page
        .locator('[data-testid="region-training-table"]')
        .waitFor({ timeout: 30_000 })
      await page.evaluate(() => document.fonts.ready)

      const parts = await page.evaluate(() => {
        const phrases = [
          /Round \d/,
          /\([A-Z][a-z]{2}–[A-Z][a-z]{2}\)/,
          /opens [A-Z][a-z]{2} \d{1,2}/,
        ]
        const out: Array<{ text: string; lines: number }> = []
        const heads = document.querySelectorAll(
          '[data-testid="region-training-table"] th[scope="colgroup"]'
        )
        for (const th of heads) {
          const walker = document.createTreeWalker(th, NodeFilter.SHOW_TEXT)
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const text = n.textContent ?? ''
            for (const re of phrases) {
              const m = re.exec(text)
              if (!m) continue
              const range = document.createRange()
              range.setStart(n, m.index)
              range.setEnd(n, m.index + m[0].length)
              // One line = every fragment shares the first one's top.
              const tops = new Set(
                Array.from(range.getClientRects()).map(r => Math.round(r.top))
              )
              out.push({ text: m[0], lines: tops.size })
            }
          }
        }
        return out
      })
      const ctx = JSON.stringify(parts)
      // Both rounds' names and months are present and measured.
      expect(
        parts.filter(p => p.text.startsWith('Round')),
        ctx
      ).toHaveLength(2)
      expect(
        parts.filter(p => p.text.startsWith('(')),
        ctx
      ).toHaveLength(2)
      for (const p of parts) expect(p.lines, ctx).toBe(1)
    })
  }
}
