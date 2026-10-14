import { test, expect, type Page } from './fixtures/test'

/* Form controls at ≥16px below 768 — no iOS focus zoom (#1838, epic #1827).
 *
 * iOS Safari zooms the page when a focused text field or <select> has a
 * computed font-size under 16px. Prod 2.48.0 at 375 had the shared chip-select
 * overlays (PY/date on /, /regions, /awards, /district/61/changes) at 12px and
 * the action-list scope select at 14px — the "jumpy" feel when changing PY or
 * date on an iPhone.
 *
 * Why computed font-size and not visualViewport.scale: Playwright's WebKit
 * does not reproduce iOS's focus zoom. A canary (iPhone 13 profile, tap a
 * 12px input) left `visualViewport.scale` at 1, same as a 16px one, so a scale
 * assertion could never fail. The computed font-size is the exact input iOS
 * keys the zoom off, so that is what we gate — in BOTH engines (the
 * `smoke`/`webkit` projects), because WebKit resolves some form-control font
 * rules differently (L111).
 *
 * Transparent overlays (`opacity: 0` native selects over a pill, family A in
 * touch-targets.smoke) are included on purpose: they take focus, so they zoom.
 */

const MIN_PX = 16
const PHONE = { width: 375, height: 812 }
const BELOW_TABLET = { width: 767, height: 1024 }
/* #2018: a phone in landscape (844×390) is wider than 768, so the width-only
 * floor missed it and the desktop header search rendered at 14px. The floor
 * also follows the input (`pointer: coarse`), as #2017 did for tap targets. */
const TOUCH_LANDSCAPE = { width: 844, height: 390 }
const DESKTOP = { width: 1280, height: 800 }

const VIEWPORTS = [
  { label: '375', viewport: PHONE, hasTouch: false },
  { label: '767', viewport: BELOW_TABLET, hasTouch: false },
  {
    label: '844×390 touch landscape',
    viewport: TOUCH_LANDSCAPE,
    hasTouch: true,
  },
] as const

interface Control {
  desc: string
  px: number
  h: number
}

async function measureControls(page: Page, scope = 'body'): Promise<Control[]> {
  return page.evaluate(sel => {
    const root = document.querySelector(sel) ?? document.body
    const skip = new Set(['checkbox', 'radio', 'range', 'hidden', 'file'])
    return Array.from(
      root.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        'input, select, textarea'
      )
    )
      .filter(el => {
        if (skip.has((el as HTMLInputElement).type)) return false
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || cs.visibility === 'hidden') return false
        const r = el.getBoundingClientRect()
        return r.width > 1 && r.height > 1
      })
      .map(el => {
        const r = el.getBoundingClientRect()
        const id =
          el.getAttribute('data-testid') ??
          el.getAttribute('aria-label') ??
          (el.getAttribute('class') || '').split(/\s+/).slice(0, 2).join('.')
        return {
          desc: `${el.tagName.toLowerCase()}[${id}]`,
          px: parseFloat(getComputedStyle(el).fontSize),
          h: Math.round(r.height),
        }
      })
  }, scope)
}

const fmt = (cs: Control[]) => cs.map(c => `${c.desc} ${c.px}px`).join('; ')

async function open(page: Page, path: string, ready: string) {
  test.setTimeout(90_000)
  await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
  await page
    .locator(ready)
    .first()
    .waitFor({ state: 'attached', timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready)
}

// Each route names the control it must mount (anti-vacuous-green): a page
// whose content failed to load would otherwise pass with zero controls.
const CHIP_SELECT = '[data-testid$="-chip-select"]'
const ROUTES: { path: string; ready: string }[] = [
  { path: '/', ready: CHIP_SELECT },
  { path: '/regions', ready: CHIP_SELECT },
  { path: '/awards', ready: CHIP_SELECT },
  { path: '/district/61/changes', ready: CHIP_SELECT },
  { path: '/district/61/action-list', ready: 'select' },
  { path: '/district/61/clubs', ready: 'input[type="search"]' },
]

for (const { label, viewport, hasTouch } of VIEWPORTS) {
  test.describe(label, () => {
    test.use({ viewport, hasTouch })
    for (const { path, ready } of ROUTES) {
      test(`every input/select is ≥${MIN_PX}px at ${label} — ${path}`, async ({
        page,
      }) => {
        await open(page, path, ready)
        const controls = await measureControls(page)
        expect(
          controls.length,
          `${path}: no form controls measured`
        ).toBeGreaterThan(0)
        const small = controls.filter(c => c.px < MIN_PX)
        expect(
          small,
          `${path}: sub-${MIN_PX}px controls: ${fmt(small)}`
        ).toEqual([])
        // Lesson 111: the 44px box must survive the font change (WebKit
        // ignores min-height on a native select unless it opts out of
        // appearance).
        const short = controls.filter(
          c => c.desc.startsWith('select') && c.h < 44
        )
        expect(
          short,
          `${path}: selects under 44px tall: ${fmt(short)}`
        ).toEqual([])
      })
    }
  })
}

/* The touch landscape run must cover the desktop header search (the control
 * #2018 found at 14px), and a mouse at 1280 keeps its compact desktop size:
 * the floor is for coarse pointers, not wide screens. */
test.describe('header search', () => {
  test.describe('844×390 touch landscape', () => {
    test.use({ viewport: TOUCH_LANDSCAPE, hasTouch: true })
    test(`header search input is ≥${MIN_PX}px`, async ({ page }) => {
      await open(page, '/', '.header-search__input')
      const controls = await measureControls(page, '.header-search')
      expect(controls.length, 'header search not measured').toBeGreaterThan(0)
      expect(controls.filter(c => c.px < MIN_PX)).toEqual([])
    })
  })
  test.describe('1280 mouse', () => {
    test.use({ viewport: DESKTOP, hasTouch: false })
    test('header search input keeps its desktop size', async ({ page }) => {
      await open(page, '/', '.header-search__input')
      const controls = await measureControls(page, '.header-search')
      expect(controls.length, 'header search not measured').toBeGreaterThan(0)
      expect(
        controls.every(c => c.px < MIN_PX),
        fmt(controls)
      ).toBe(true)
    })
  })
})

test(`context-bar sheet selects are ≥${MIN_PX}px at 375 — /district/61`, async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await open(page, '/district/61', '[data-testid="context-bar-chip"]')
  await page.locator('[data-testid="context-bar-chip"]:visible').click()
  await page.getByRole('dialog').waitFor({ state: 'visible' })
  const controls = await measureControls(page, '[role="dialog"]')
  expect(controls.length).toBeGreaterThan(0)
  const small = controls.filter(c => c.px < MIN_PX)
  expect(small, `sheet: ${fmt(small)}`).toEqual([])
})

test(`Filter & sort sheet controls are ≥${MIN_PX}px at 375 — /district/61/clubs`, async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await open(page, '/district/61/clubs', 'input[type="search"]')
  await page
    .getByRole('button', { name: /Filter & sort/ })
    .first()
    .click()
  await page.getByRole('dialog').waitFor({ state: 'visible' })
  const controls = await measureControls(page, '[role="dialog"]')
  expect(controls.length).toBeGreaterThan(0)
  const small = controls.filter(c => c.px < MIN_PX)
  expect(small, `sheet: ${fmt(small)}`).toEqual([])
})
