import { test, expect, type Page } from './fixtures/test'

/* Long club names on the phone Action List (#2329).
 *
 * The V2 mobile how-to video (#2295) showed "Milton Escarpment Toastmast…" at
 * 390 px: the name was 255 px of Inter in a 250 px box. The row sat inside
 * the page gutter (24), the section's padding + border (21) and the list's
 * own border (1) on each side, so the name got 250 of 390 px, and the shared
 * row ellipsized it.
 *
 * Measured on the deployed build (BASE_URL), on the same district and pinned
 * date the video captures, with every section opened: each visible row title
 * shows its whole text (no horizontal clip from the ellipsis, no vertical clip
 * from the 2-line clamp), titles stay ≥ 16 px, a wrapped row stays compact
 * (≤ 2 title lines), rows sit inside the viewport, and the page never scrolls
 * sideways with the `overflow-x:hidden` mask off. 768 and 1280 keep tables.
 *
 * The measurement does not depend on one font: SF, Inter and DejaVu Sans all
 * clip this name at 320 and 375 before the fix. */

const PAGE = '/district/86/action-list?date=2026-10-24'
const ROW = '[data-testid="mobile-row"]'

/** 2 title lines (2 × 22) + meta (20) + gap (2) + padding (16). */
const WRAPPED_ROW_MAX = 82

async function load(page: Page): Promise<void> {
  await page.goto(PAGE, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready)
}

/** Open every collapsed section so all phone rows render. */
async function openAll(page: Page): Promise<void> {
  const closed = page.locator(
    '.action-list-section__toggle[aria-expanded="false"]'
  )
  while ((await closed.count()) > 0) {
    await closed.first().click()
  }
  await expect(page.locator(`${ROW}:visible`).first()).toBeVisible()
}

interface Geometry {
  width: number
  docOverflow: number
  theme: string | null
  rows: {
    title: string
    clipX: boolean
    clipY: boolean
    titlePx: number
    lines: number
    height: number
    left: number
    right: number
  }[]
}

async function measure(page: Page): Promise<Geometry> {
  await page.addStyleTag({
    content: 'html,body{overflow-x:visible !important}',
  })
  return page.evaluate(sel => {
    const rows = Array.from(document.querySelectorAll(sel))
      .filter(el => el.getBoundingClientRect().height > 0)
      .map(row => {
        const t = row.querySelector('.mobile-row__title') as HTMLElement
        const r = row.getBoundingClientRect()
        const cs = getComputedStyle(t)
        return {
          title: t.textContent ?? '',
          clipX: t.scrollWidth > t.clientWidth + 0.5,
          clipY: t.scrollHeight > t.clientHeight + 0.5,
          titlePx: parseFloat(cs.fontSize),
          lines: Math.round(
            t.getBoundingClientRect().height / parseFloat(cs.lineHeight)
          ),
          height: Math.round(r.height),
          left: Math.round(r.left),
          right: Math.round(r.right),
        }
      })
    return {
      width: window.innerWidth,
      docOverflow: document.documentElement.scrollWidth - window.innerWidth,
      theme: document.documentElement.getAttribute('data-theme'),
      rows,
    }
  }, ROW)
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [320, 375, 390]) {
    test(`action list names are whole at ${width}px (${theme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize({ width, height: 844 })
      await load(page)
      await openAll(page)
      const g = await measure(page)
      const ctx = JSON.stringify({ ...g, rows: g.rows.length })
      expect(g.theme, ctx).toBe(theme)
      expect(g.docOverflow, ctx).toBeLessThanOrEqual(0)
      expect(g.rows.length, ctx).toBeGreaterThan(0)
      // The video's row must be among them (the name that clipped).
      expect(
        g.rows.map(r => r.title),
        ctx
      ).toContain('Milton Escarpment Toastmasters')
      for (const r of g.rows) {
        const rc = JSON.stringify(r)
        expect(r.clipX, rc).toBe(false)
        expect(r.clipY, rc).toBe(false)
        expect(r.titlePx, rc).toBeGreaterThanOrEqual(16)
        expect(r.lines, rc).toBeLessThanOrEqual(2)
        expect(r.height, rc).toBeLessThanOrEqual(WRAPPED_ROW_MAX)
        expect(r.left, rc).toBeGreaterThanOrEqual(0)
        expect(r.right, rc).toBeLessThanOrEqual(g.width)
      }
    })
  }
}

for (const width of [768, 1280]) {
  test(`action list at ${width}px keeps the tables`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await load(page)
    await expect(page.locator('.action-table').first()).toBeVisible()
    await expect(page.locator(ROW)).toHaveCount(0)
  })
}
