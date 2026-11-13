import { test, expect } from './fixtures/test'

/* Table header text bottoms line up (#2651, part).
 *
 * The 2026-11-12 UX review measured plain and sortable headers 32px apart in
 * one row on `/`, a "Trend" header 33px low on `/regions`, and four different
 * text bottoms in one header row on `/region/04`. Every header row on those
 * routes must put the bottom of each visible header text within 1px of its
 * neighbours, whether the cell is a sort button or plain text, and the sort
 * caret must sit inline after the label (same line, to its right).
 *
 * Measured on the deployed build (BASE_URL): jsdom has no layout (Lesson 134).
 * Gated on rendered body rows so a loading page cannot pass vacuously.
 */

const ROUTES = ['/', '/regions', '/region/04', '/district/61/division/A']
const WIDTHS = [768, 1280]

for (const route of ROUTES) {
  for (const width of WIDTHS) {
    test(`header text bottoms align on ${route} at ${width}px`, async ({
      page,
    }) => {
      test.setTimeout(90_000)
      await page.setViewportSize({ width, height: 900 })
      await page.goto(route, { waitUntil: 'networkidle', timeout: 60_000 })
      await page.evaluate(() => document.fonts.ready)
      await expect(page.locator('main table tbody tr').first()).toBeVisible({
        timeout: 30_000,
      })

      const rows = await page.evaluate(() => {
        const out: {
          table: string
          cells: { text: string; bottom: number }[]
          carets: { text: string; sameLine: boolean; after: boolean }[]
        }[] = []
        for (const tr of document.querySelectorAll('main table thead tr')) {
          const table = tr.closest('table')!
          const tableBox = table.getBoundingClientRect()
          if (tableBox.width === 0 || tableBox.height === 0) continue
          const cells: { text: string; bottom: number }[] = []
          const carets: { text: string; sameLine: boolean; after: boolean }[] =
            []
          for (const th of tr.querySelectorAll('th')) {
            const rects: DOMRect[] = []
            const walker = document.createTreeWalker(th, NodeFilter.SHOW_TEXT)
            for (let n = walker.nextNode(); n; n = walker.nextNode()) {
              if (!n.textContent!.trim()) continue
              const box = n.parentElement!.getBoundingClientRect()
              if (box.width <= 1 || box.height <= 1) continue
              const range = document.createRange()
              range.selectNodeContents(n)
              for (const r of range.getClientRects()) {
                if (r.width > 0 && r.height > 0) rects.push(r)
              }
            }
            if (rects.length === 0) continue
            const text = th.textContent!.replace(/\s+/g, ' ').trim()
            const last = rects[rects.length - 1]
            cells.push({
              text,
              bottom: Math.max(...rects.map(r => r.bottom)),
            })
            const caret = th.querySelector('.sortable-header__indicator')
            if (caret) {
              const c = caret.getBoundingClientRect()
              carets.push({
                text,
                // The caret is vertically within the label's last line...
                sameLine: c.top < last.bottom && c.bottom > last.top,
                // ...and starts at or after the end of the label text.
                after: c.left >= last.right - 1,
              })
            }
          }
          if (cells.length > 1)
            out.push({
              table: table.getAttribute('aria-label') ?? table.className,
              cells,
              carets,
            })
        }
        return out
      })

      expect(rows.length, 'no header rows measured').toBeGreaterThan(0)
      for (const row of rows) {
        const bottoms = row.cells.map(c => c.bottom)
        const spread = Math.max(...bottoms) - Math.min(...bottoms)
        expect(
          spread,
          `"${row.table}" header text bottoms differ by ${spread}px: ${row.cells
            .map(c => `${c.text}=${c.bottom.toFixed(1)}`)
            .join(', ')}`
        ).toBeLessThanOrEqual(1)
        for (const c of row.carets) {
          expect(
            c.sameLine && c.after,
            `"${row.table}" sort caret for "${c.text}" is not inline after the label`
          ).toBe(true)
        }
      }
    })
  }
}
