import { test, expect, type Page } from './fixtures/test'

/* Landing first screen on phones (#1846, mobile epic #1827 Phase 2, review
 * §7 item 19).
 *
 * Before: at 375 the first KPI sat at y=532 — title, lede, a 4-line
 * orientation paragraph, freshness/PY/date chips and Export/Share all came
 * before it, and the two chip rows (regions 950/225, recognition 727/196)
 * scrolled sideways with no edge-aware cue.
 *
 * After: the shared context bar replaces that stack; search is the first
 * control; the orientation copy lives in the bar's sheet; each chip row marks
 * the edges that still hide chips (data-more-before / data-more-after) and
 * the CSS fades exactly those.
 *
 * Measured on the deployed preview (BASE_URL) by bounding box — jsdom has no
 * layout (Lesson 134). Gated on a content sentinel (the KPI value) so a
 * blank or still-loading page cannot pass vacuously.
 */

const FIRST_KPI_TOP_MAX = 300

async function load(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'networkidle', timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('kpi-paid-clubs')).toHaveText(/\d/, {
    timeout: 30_000,
  })
}

for (const width of [375, 390]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`landing first screen at ${width}px (${theme}): search first, first KPI ≤ ${FIRST_KPI_TOP_MAX}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 812 })
      await page.addInitScript(t => {
        try {
          localStorage.setItem('theme', t)
        } catch {
          /* storage blocked: the default theme is still measured */
        }
      }, theme)
      await load(page)

      const m = await page.evaluate(() => {
        const top = (sel: string) => {
          const el = document.querySelector(sel)
          if (!el) return null
          const r = el.getBoundingClientRect()
          return r.width > 0 && r.height > 0 ? Math.round(r.top) : null
        }
        return {
          bar: top('.districts-page > .context-bar'),
          search: top('.districts-toolbar__search-input'),
          kpi: top('.districts-kpi-strip [data-testid="kpi-paid-clubs"]'),
          kpiCard: top('.districts-kpi-strip .districts-kpi-card'),
          orientation: top('[data-testid="districts-orientation"]'),
        }
      })

      expect(m.bar, 'context bar not visible').not.toBeNull()
      expect(m.search, 'search not visible').not.toBeNull()
      expect(m.kpiCard, 'KPI card not visible').not.toBeNull()
      expect(
        m.search!,
        `search (y=${m.search}) must come before the first KPI (y=${m.kpiCard})`
      ).toBeLessThan(m.kpiCard!)
      expect(
        m.kpiCard!,
        `first KPI card top y=${m.kpiCard} > ${FIRST_KPI_TOP_MAX}`
      ).toBeLessThanOrEqual(FIRST_KPI_TOP_MAX)
      expect(m.orientation, 'orientation paragraph still inline').toBeNull()

      // The orientation copy is one tap away, in the bar's sheet.
      await page
        .locator('.districts-page > .context-bar')
        .getByTestId('context-bar-chip')
        .click()
      const sheet = page.getByRole('dialog')
      await expect(sheet).toContainText(/Each row below is one of the \d+/)
      await expect(
        sheet.getByRole('button', { name: 'Export CSV' })
      ).toBeVisible()
    })
  }

  test(`chip rows fade only the edges that hide chips at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 812 })
    await load(page)

    const rows = page.locator('.districts-toolbar .districts-toolbar__scroller')
    expect(await rows.count()).toBe(2)

    for (let i = 0; i < 2; i++) {
      const row = rows.nth(i)
      // Overflowing at rest: more to the right, nothing to the left.
      await expect(row).toHaveAttribute('data-more-after', '')
      await expect(row).not.toHaveAttribute('data-more-before', '')
      const mask = await row.evaluate(
        el =>
          getComputedStyle(el).maskImage ||
          getComputedStyle(el).getPropertyValue('-webkit-mask-image')
      )
      expect(mask).toMatch(/linear-gradient/)

      // Scrolled to the end: the trailing fade goes, the leading one comes.
      await row.evaluate(el => {
        el.scrollLeft = el.scrollWidth
        el.dispatchEvent(new Event('scroll'))
      })
      await expect(row).toHaveAttribute('data-more-before', '')
      await expect(row).not.toHaveAttribute('data-more-after', '')
    }
  })
}

test('desktop ≥768 keeps the inline header (orientation visible, no bar)', async ({
  page,
}) => {
  for (const width of [768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await load(page)
    await expect(page.getByTestId('districts-orientation')).toBeVisible()
    await expect(page.locator('.districts-page > .context-bar')).toBeHidden()
    await expect(
      page.getByRole('heading', { level: 1, name: /District Rankings/ })
    ).toBeVisible()
  }
})
