import { test, expect } from './fixtures/test'

/* Heading order and size ramp (#2650, WCAG 1.3.1).
 *
 * Before: /district/:id/clubs, /changes and /map went H1 to H3; the regions
 * changes pages put three H3s before the first H2; Education had two H1s; and
 * cards titled H2 were smaller than the H4s under them.
 *
 * After, on every route below, the visible headings in document order
 *   - include exactly one h1,
 *   - never skip a level on the way down (h1 to h3 is a skip; h3 to h1 is not),
 *   - never invert in size: a deeper heading is no larger than the nearest
 *     shallower heading before it.
 * The size rule is what axe's heading-order does not check, so it is walked
 * here with computed styles. */

const ROUTES = [
  '/district/61/clubs',
  '/district/61/changes',
  '/district/61/map',
  '/district/61/divisions',
  '/district/61/education',
  '/regions/changes',
  '/region/4/changes',
  '/region/4',
]

interface Heading {
  level: number
  text: string
  px: number
}

const WIDTHS = [1280, 375]

for (const route of ROUTES) {
  for (const width of WIDTHS) {
    test(`${route} at ${width}px: one h1, no skipped levels, sizes never invert`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('h1:visible').first()).toBeVisible({
        timeout: 15_000,
      })
      await page.waitForLoadState('networkidle')

      const headings: Heading[] = await page.evaluate(() =>
        [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
          .filter(el => el.checkVisibility({ visibilityProperty: true }))
          .map(el => ({
            level: Number(el.tagName[1]),
            text: (el.textContent ?? '').trim().slice(0, 40),
            px: parseFloat(getComputedStyle(el).fontSize),
          }))
      )

      const h1s = headings.filter(h => h.level === 1)
      expect(
        h1s.map(h => h.text),
        'exactly one h1'
      ).toHaveLength(1)

      const skips: string[] = []
      const inversions: string[] = []
      const stack: Heading[] = []
      let prev = headings[0]?.level ?? 1
      for (const h of headings) {
        if (h.level > prev + 1)
          skips.push(`h${prev} to h${h.level} "${h.text}"`)
        prev = h.level
        while (stack.length && stack[stack.length - 1].level >= h.level)
          stack.pop()
        const parent = stack[stack.length - 1]
        if (parent && h.px > parent.px)
          inversions.push(
            `h${h.level} "${h.text}" ${h.px}px > h${parent.level} "${parent.text}" ${parent.px}px`
          )
        stack.push(h)
      }
      expect(skips, 'skipped heading levels').toEqual([])
      expect(inversions, 'deeper heading larger than its parent').toEqual([])
    })
  }
}
