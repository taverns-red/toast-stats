import { test, expect } from './fixtures/test'

/* Body text uses the brand face, not the OS system font (#2631).
 *
 * `body:not(.fonts-loaded)` (typography.css and textEffectsRemover.ts) put a
 * system-ui stack on <body>, but `fonts-loaded` is set on <html>, so the rule
 * matched forever and, at specificity 0,1,1, beat `body { font-family:
 * var(--tm-font-body) }`. Everything inheriting from <body> rendered in San
 * Francisco / Segoe / Roboto while elements with their own font-family got
 * Source Sans 3.
 *
 * We gate the computed family of <body> itself after document.fonts.ready, on
 * a route that sets no font of its own, at phone and desktop widths.
 */

const VIEWPORTS = [
  { label: '375', viewport: { width: 375, height: 812 } },
  { label: '1280', viewport: { width: 1280, height: 800 } },
] as const

for (const { label, viewport } of VIEWPORTS) {
  test.describe(label, () => {
    test.use({ viewport })
    for (const path of ['/', '/district/61/clubs']) {
      test(`<body> computes to Source Sans 3 at ${label} — ${path}`, async ({
        page,
      }) => {
        test.setTimeout(90_000)
        await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
        await page.evaluate(() => document.fonts.ready)
        const family = await page.evaluate(
          () => getComputedStyle(document.body).fontFamily
        )
        expect(family).toMatch(/^"?Source Sans 3"?/)
      })
    }
  })
}
