import { test, expect, type Page } from './fixtures/test'

/* The "All Clubs" panel header on phones (#2343).
 *
 * The header row is the title and the export group ("Export Clubs", plus
 * "Export Changes" when a snapshot diff is loaded) side by side with
 * `justify-between`. On a phone the two buttons do not fit beside the title,
 * so they stacked in a column that took most of the width and squeezed the
 * title to "All / Clubs" (seen on /district/86/clubs at 390 px).
 *
 * Measured on the deployed build (BASE_URL) by bounding box (Lesson 134):
 * at 320/375/390 the title is one line and the export buttons sit below it,
 * inside the viewport, with no sideways page scroll (mask off). At 1280 the
 * header is unchanged: the buttons share the title's row, to its right. */

const CLUBS = '/district/86/clubs'
const TITLE = '.clubs-panel-title'
const BUTTON = '.clubs-export-group button'

async function load(page: Page): Promise<void> {
  await page.goto(CLUBS, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready)
}

async function measure(page: Page) {
  await page.addStyleTag({
    content: 'html,body{overflow-x:visible !important}',
  })
  return page.evaluate(
    ([titleSel, buttonSel]) => {
      const t = document.querySelector(titleSel as string) as HTMLElement
      const tr = t.getBoundingClientRect()
      const lh = parseFloat(getComputedStyle(t).lineHeight)
      return {
        width: window.innerWidth,
        docOverflow: document.documentElement.scrollWidth - window.innerWidth,
        theme: document.documentElement.getAttribute('data-theme'),
        title: {
          text: t.textContent,
          lines: Math.round(tr.height / lh),
          top: tr.top,
          bottom: tr.bottom,
          right: tr.right,
        },
        buttons: Array.from(document.querySelectorAll(buttonSel as string)).map(
          b => {
            const r = b.getBoundingClientRect()
            return {
              text: (b.textContent ?? '').trim(),
              top: r.top,
              left: r.left,
              right: r.right,
            }
          }
        ),
      }
    },
    [TITLE, BUTTON]
  )
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [320, 375, 390]) {
    test(`All Clubs title is one line above the exports at ${width}px (${theme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize({ width, height: 844 })
      await load(page)
      await expect(page.locator(TITLE)).toBeVisible()
      const g = await measure(page)
      const ctx = JSON.stringify(g)
      expect(g.theme, ctx).toBe(theme)
      expect(g.title.text, ctx).toBe('All Clubs')
      expect(g.title.lines, ctx).toBe(1)
      expect(g.docOverflow, ctx).toBeLessThanOrEqual(0)
      expect(g.buttons.length, ctx).toBeGreaterThan(0)
      for (const b of g.buttons) {
        expect(b.top, ctx).toBeGreaterThanOrEqual(g.title.bottom)
        expect(b.left, ctx).toBeGreaterThanOrEqual(0)
        expect(b.right, ctx).toBeLessThanOrEqual(g.width)
      }
    })
  }
}

test('desktop keeps the exports beside the title at 1280px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await load(page)
  await expect(page.locator(TITLE)).toBeVisible()
  const g = await measure(page)
  const ctx = JSON.stringify(g)
  expect(g.title.lines, ctx).toBe(1)
  expect(g.buttons.length, ctx).toBeGreaterThan(0)
  for (const b of g.buttons) {
    expect(b.top, ctx).toBeLessThan(g.title.bottom)
    expect(b.left, ctx).toBeGreaterThan(g.title.right)
  }
})
