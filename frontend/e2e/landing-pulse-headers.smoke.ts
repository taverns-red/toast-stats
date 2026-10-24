import { test, expect, type Page } from './fixtures/test'

/* World pulse table headers on one line (#2249, re-review R1).
 *
 * Before: at 375 each numeric header had ~48px for 14px bold uppercase text
 * and `overflow-wrap: anywhere`, so the preview rendered "DISTR/ICTS",
 * "PAID/CLUB/S" and "VS PY/STAR/T" — on the first screen — and the 3-line
 * head overran the `.world-pulse__regions` reserve (6 × 32px + 44px).
 *
 * After: phones show short labels ("Dist." / "Clubs" / "± PY"), the full
 * label stays the header's accessible name, and headers can only wrap at
 * spaces. Also checks the payments KPI delta ("YTD vs last year's total")
 * is one line wherever it shows.
 *
 * Measured on the deployed preview (BASE_URL) — jsdom has no layout
 * (Lesson 134). Gated on rendered region rows so a still-loading page
 * cannot pass vacuously.
 */

async function load(page: Page, width: number, theme: 'light' | 'dark') {
  await page.setViewportSize({ width, height: 900 })
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

/** Line boxes and overflow of each header's visible text. */
function measureHeads(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.world-pulse__table thead th')].map(th => {
      const cell = th as HTMLElement
      const cs = getComputedStyle(cell)
      const inner =
        cell.clientWidth -
        parseFloat(cs.paddingLeft) -
        parseFloat(cs.paddingRight)
      // Visible text only: the visually hidden long label is a 1px clipped
      // box whose glyphs still report rects, so skip text whose element box
      // is 1px or less.
      const rects: DOMRect[] = []
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const box = n.parentElement!.getBoundingClientRect()
        if (box.width <= 1 || box.height <= 1) continue
        const range = document.createRange()
        range.selectNodeContents(n)
        for (const r of range.getClientRects()) {
          if (r.width > 0 && r.height > 0) rects.push(r)
        }
      }
      const tops = new Set(rects.map(r => Math.round(r.top)))
      const textWidth = rects.reduce((w, r) => Math.max(w, r.width), 0)
      return {
        text: cell.textContent!.replace(/\s+/g, ' ').trim(),
        lines: tops.size,
        textWidth: Math.round(textWidth),
        inner: Math.round(inner),
        overflow: cell.scrollWidth > cell.clientWidth,
        height: Math.round(cell.getBoundingClientRect().height),
      }
    })
  )
}

for (const width of [375, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`World pulse headers render on one line at ${width}px (${theme})`, async ({
      page,
    }) => {
      await load(page, width, theme)
      const heads = await measureHeads(page)
      expect(heads).toHaveLength(4)
      for (const h of heads) {
        expect(h.lines, `"${h.text}" wraps to ${h.lines} lines`).toBe(1)
        expect(h.overflow, `"${h.text}" overflows its cell`).toBe(false)
        expect(
          h.textWidth,
          `"${h.text}" is ${h.textWidth}px in a ${h.inner}px cell`
        ).toBeLessThanOrEqual(h.inner + 1)
      }

      // The full words stay the accessible names at every width.
      const table = page.getByRole('table', { name: 'Regions' })
      for (const name of ['Districts', 'Paid clubs', 'vs PY start']) {
        await expect(
          table.getByRole('columnheader', { name, exact: true })
        ).toHaveCount(1)
      }

      // The head plus five rows fit the reserve (6 × 32px + 44px link).
      const regions = await page
        .locator('.world-pulse__regions')
        .evaluate(el => ({
          height: el.getBoundingClientRect().height,
          reserve: parseFloat(getComputedStyle(el).minHeight),
        }))
      expect(
        regions.height,
        `regions block ${regions.height}px overruns its ${regions.reserve}px reserve`
      ).toBeLessThanOrEqual(regions.reserve + 1)
    })
  }
}

for (const width of [375, 768, 1280]) {
  test(`payments delta says YTD and stays on one line at ${width}px`, async ({
    page,
  }) => {
    await load(page, width, 'light')
    const delta = page.getByTestId('kpi-total-payments-delta')
    await expect(delta).toHaveText(/YTD vs last year's total/)
    const m = await delta.evaluate(el => {
      const r = el.getBoundingClientRect()
      return {
        visible: r.width > 0 && r.height > 0,
        height: r.height,
        lineHeight: parseFloat(getComputedStyle(el).lineHeight),
      }
    })
    // Below 768 the payments card is demoted (hidden); nothing to wrap.
    if (width < 768 && !m.visible) return
    expect(m.visible).toBe(true)
    expect(
      m.height,
      `payments delta is ${m.height}px tall (line ${m.lineHeight}px)`
    ).toBeLessThan(m.lineHeight * 1.5)
  })
}
