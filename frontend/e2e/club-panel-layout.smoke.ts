import { test, expect, type Page } from './fixtures/test'
import { scrollUntilStable } from './helpers/scrollUntilStable'

/* Club page layout (#2655, from the 2026-11-12 UX review).
 *
 * Guards four things measured with bounding boxes on a real club page:
 * - UNIT-12: stacked panels are at least 16px apart (the last three had 0px,
 *   so their borders doubled), at 375 and 1280.
 * - UNIT-15: the phone hero shows the whole meeting place (it was cut to
 *   "875 Grande …").
 * - UNIT-34: goal timeline dates stay on one line at every width.
 * - UNIT-40: the club history page prints the full club name on a phone.
 * Club 9127 (Quebec, D61) has a long address, a former name and a lifecycle.
 */

const CLUB = '/district/61/club/9127'
const MIN_GAP = 16

async function load(page: Page, path: string, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.locator('h1').first().waitFor({ state: 'visible' })
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await page.waitForTimeout(500)
}

for (const width of [375, 1280]) {
  test(`stacked club panels are at least ${MIN_GAP}px apart at ${width}`, async ({
    page,
  }) => {
    await load(page, CLUB, width)
    // The worldwide card and the map load as they near the viewport.
    await scrollUntilStable(page)
    const gaps = await page.evaluate(() => {
      const boxes = [
        ...document.querySelectorAll(
          'section.club-panel, .club-close-to-distinguished'
        ),
      ]
        .map(el => {
          const r = el.getBoundingClientRect()
          return {
            name: (el.getAttribute('class') ?? '').slice(0, 50),
            top: r.top + window.scrollY,
            bottom: r.bottom + window.scrollY,
            left: r.left,
            width: r.width,
          }
        })
        .filter(b => b.width > 0)
        .sort((a, b) => a.top - b.top || a.left - b.left)
      const out: Array<{ above: string; below: string; gap: number }> = []
      for (let i = 1; i < boxes.length; i++) {
        const prev = boxes[i - 1]!
        const next = boxes[i]!
        // Side by side in one row: not stacked.
        if (next.top < prev.bottom - 1) continue
        out.push({
          above: prev.name,
          below: next.name,
          gap: Math.round(next.top - prev.bottom),
        })
      }
      return out
    })
    expect(gaps.length).toBeGreaterThan(3)
    for (const g of gaps) {
      expect(g.gap, `${g.above} -> ${g.below}`).toBeGreaterThanOrEqual(MIN_GAP)
    }
  })
}

test('the phone hero shows the whole meeting place at 375', async ({
  page,
}) => {
  await load(page, CLUB, 375)
  const m = await page.evaluate(() => {
    const facts = document.querySelector('.club-meets__facts') as HTMLElement
    return {
      clipped: facts.scrollWidth > facts.clientWidth + 1,
      nowrap: getComputedStyle(facts).whiteSpace === 'nowrap',
      text: facts.textContent ?? '',
    }
  })
  expect(m.text).toContain('Grande')
  expect(m.nowrap).toBe(false)
  expect(m.clipped).toBe(false)
})

for (const width of [375, 1280]) {
  test(`goal timeline dates do not wrap at ${width}`, async ({ page }) => {
    await load(page, CLUB, width)
    const lines = await page.evaluate(() =>
      [...document.querySelectorAll('.timeline-row .date')].map(el => {
        const h = el.getBoundingClientRect().height
        const lh = parseFloat(getComputedStyle(el).lineHeight) || 18
        return { text: el.textContent, lines: Math.round(h / lh) }
      })
    )
    expect(lines.length).toBeGreaterThan(0)
    for (const l of lines) expect(l.lines, l.text ?? '').toBe(1)
  })
}

test('the club history page prints the club name on a phone', async ({
  page,
}) => {
  await load(page, `${CLUB}/history`, 375)
  const box = await page.locator('h1').first().boundingBox()
  expect(box?.width ?? 0).toBeGreaterThan(100)
  expect(box?.height ?? 0).toBeGreaterThan(10)
  await expect(page.locator('h1').first()).toContainText('optimates')
})
