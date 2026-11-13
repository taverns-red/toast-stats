import { test, expect, type Page } from './fixtures/test'

/* Division and area tables on the shared table styles (#2718, M5 of #2676;
 * #2655 UNIT-16, UNIT-28, REF-09 / UNIT-33).
 *
 * Layout facts jsdom cannot measure:
 *  - the print-pack roster fits its page at 1280 with no sideways scroll;
 *  - every sideways scroller on the division, area and print-pack pages is a
 *    named, focusable region (axe scrollable-region-focusable);
 *  - the phone gutter is 16px and the area table is not squeezed to 261px;
 *  - the area table has no sub-14px text and no five-line headers at 1024.
 */

const DIVISION = '/district/61/division/B'
const AREA = '/district/61/division/A/area/01'

async function open(page: Page, path: string, ready: string): Promise<void> {
  await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
  await page
    .locator(ready)
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
}

/** Scrollers (overflow-x auto|scroll) that actually scroll sideways and are
 *  not reachable by keyboard or have no accessible name. */
function unlabelledScrollers(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bad: string[] = []
    for (const el of document.querySelectorAll<HTMLElement>('*')) {
      const ox = getComputedStyle(el).overflowX
      if (ox !== 'auto' && ox !== 'scroll') continue
      if (el.scrollWidth <= el.clientWidth + 1) continue
      const named =
        el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby')
      if (el.tabIndex < 0 || !named) {
        bad.push(`${el.tagName.toLowerCase()}.${el.className}`)
      }
    }
    return bad
  })
}

for (const [name, path, ready] of [
  ['division page', DIVISION, 'table.entity-table--clubs'],
  ['area page', AREA, 'table.entity-table--clubs'],
] as const) {
  test(`${name}: every sideways scroller is named and focusable`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await open(page, path, ready)
    expect(await unlabelledScrollers(page)).toEqual([])
  })
}

test('division print pack: the roster fits at 1280 without scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await open(page, `${DIVISION}/print`, '[data-testid="council-pack-roster"]')
  const m = await page
    .locator('.council-pack__scroll:has([data-testid="council-pack-roster"])')
    .evaluate(el => ({ inner: el.scrollWidth, outer: el.clientWidth }))
  expect(m.inner).toBeLessThanOrEqual(m.outer)
  expect(await unlabelledScrollers(page)).toEqual([])
})

test('division print pack: a phone scrolls the roster in a named region', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await open(page, `${DIVISION}/print`, '[data-testid="council-pack-roster"]')
  const region = page.getByRole('region', { name: /club roster/i })
  await expect(region).toHaveAttribute('tabindex', '0')
  expect(await unlabelledScrollers(page)).toEqual([])
})

test('area page at 375: 16px gutter and a table wider than 261px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await open(page, AREA, '.priority-columns')
  const m = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.entity-page')!
    const cs = getComputedStyle(root)
    const table = document
      .querySelector<HTMLElement>('.priority-columns')!
      .getBoundingClientRect()
    return {
      left: parseFloat(cs.paddingLeft),
      right: parseFloat(cs.paddingRight),
      table: table.width,
      pageScroll:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    }
  })
  expect(m.left).toBe(16)
  expect(m.right).toBe(16)
  expect(m.table).toBeGreaterThan(300)
  expect(m.pageScroll).toBeLessThanOrEqual(0)
})

test('division page at 1024: area table headers stay short and 14px or more', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 900 })
  await open(page, DIVISION, 'table.entity-table--areas')
  const m = await page
    .locator('table.entity-table--areas thead th')
    .evaluateAll(ths =>
      ths.map(th => {
        const cs = getComputedStyle(th)
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3
        return {
          size: parseFloat(cs.fontSize),
          // Text lines only: the cell's own padding is not a line.
          lines: Math.round(
            (th.getBoundingClientRect().height -
              parseFloat(cs.paddingTop) -
              parseFloat(cs.paddingBottom)) /
              lh
          ),
        }
      })
    )
  expect(m.length).toBeGreaterThan(0)
  for (const h of m) {
    expect(h.size).toBeGreaterThanOrEqual(14)
    expect(h.lines).toBeLessThanOrEqual(4)
  }
})

for (const [name, path] of [
  ['division page', DIVISION],
  ['area page', AREA],
] as const) {
  test(`${name} at 768: the area table is compact, not a clipped nine-column table`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await open(page, path, '.priority-columns')
    await expect(page.locator('table.entity-table--areas')).toHaveCount(0)
  })
}
