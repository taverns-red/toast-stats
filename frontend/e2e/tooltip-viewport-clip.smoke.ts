import { test, expect, type Page, type Locator } from '@playwright/test'
import { MIN_TOUCH_TARGET_PX } from '../src/utils/touchTargetUtils'

/* Tooltip viewport-collision tripwire (#1405).
 *
 * The two shared tooltip components render a fixed-width panel centred on
 * their trigger — `Tooltip` at w-80 (320px), `InfoTooltip` at w-56 (224px) —
 * with no collision handling. `centre − width/2` is negative for a trigger in
 * a card's leftmost column, so half the panel rendered off-screen and the
 * opening words were unreadable. Measured on production before the fix
 * (Chromium, identical at 375 / 768 / 1350):
 *
 *   /district/61/analytics, Education Levels
 *     Level 1                left −67  right 253
 *     Level 2                left −65  right 255
 *     Level 3                left −65  right 255
 *     Level 4+ · Path · DTM  left −21  right 299
 *
 * The right edge had the mirror problem, and NOT only on the reported card —
 * the landing page's table-header `InfoTooltip` ran past it at every width
 * (right 432 / 825 / 1407 against 375 / 768 / 1350), as did the district KPI
 * strip's `Tooltip`s. The fix lives in the shared components (R10), so this
 * guard covers both edges and both components.
 *
 * Why this shape (lessons 108 / 134 / 138, and the #1387 probe):
 *  - Real geometry, not `toBeVisible`. A visibility assertion passes on `main`
 *    with the panel half off-screen — that IS the bug. We read
 *    `getBoundingClientRect()` and compare against the live viewport.
 *  - The edge cases are FORCED, not hunted. Which trigger happens to sit near
 *    an edge is a function of the width, the snapshot's data and what the
 *    responsive layout hides — at 375px most of the landing's table-header
 *    buttons live inside a horizontally-scrolled table and cannot be hovered
 *    at all, so a "hover everything and hope something is near an edge" sweep
 *    measures 2 panels at one width and 12 at another. Pinning a trigger to
 *    each edge makes both cases unconditional on every engine, at every width,
 *    whatever the data does — the same move `breadcrumb-alignment.smoke.ts`
 *    makes when it constrains the nav rather than hoping the row wraps.
 *  - The reported card is still swept as-reported, so the literal regression
 *    is covered and not just an abstraction of it.
 *  - Every viewport in the acceptance set (375 / 768 / 1350), both themes,
 *    both engines (#710) via the two playwright.config projects.
 *  - Asserts the 44px trigger floor SURVIVES. The tempting "fix" is to shrink
 *    the control; this reds if anyone tries it.
 */

const VIEWPORTS = [
  { label: '375px', width: 375, height: 812 },
  { label: '768px', width: 768, height: 1024 },
  { label: '1350px', width: 1350, height: 900 },
]

const THEMES = ['light', 'dark'] as const

/** The reported card: four rows plus the header tooltip, all left-clipped. */
const EDUCATION_CARD = 'section[aria-label="education levels"]'
const EDUCATION_TRIGGERS = `${EDUCATION_CARD} svg[viewBox="0 0 20 20"]`
const EDUCATION_PANELS = 5

/** One live instance of each shared component, for the forced-edge checks. */
const PINNABLE = [
  {
    what: 'Tooltip (w-80)',
    route: '/district/61/analytics',
    trigger: EDUCATION_TRIGGERS,
    sentinel: EDUCATION_CARD,
  },
  {
    what: 'InfoTooltip (w-56)',
    route: '/',
    trigger: 'button[aria-label="info"]',
    sentinel: 'button[aria-label="info"]',
  },
]

interface PanelBox {
  text: string
  left: number
  right: number
  viewport: number
}

async function readOpenPanels(page: Page): Promise<PanelBox[]> {
  return page.evaluate(() => {
    // The panel is clamped against the visible content width, which excludes
    // a classic scrollbar; `innerWidth` does not.
    const viewport =
      document.documentElement.clientWidth || window.innerWidth || 0
    return Array.from(document.querySelectorAll('[role="tooltip"]')).map(el => {
      const r = el.getBoundingClientRect()
      return {
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        left: Math.round(r.left),
        right: Math.round(r.right),
        viewport,
      }
    })
  })
}

async function hoverAndRead(page: Page, trigger: Locator): Promise<PanelBox[]> {
  await trigger.scrollIntoViewIfNeeded({ timeout: 5_000 })
  await trigger.hover({ timeout: 5_000 })
  // Tooltip's default open delay is 200ms.
  await page.waitForTimeout(350)
  const boxes = await readOpenPanels(page)
  await page.mouse.move(0, 0)
  await page.waitForTimeout(120)
  return boxes
}

async function load(page: Page, route: string, theme: string): Promise<void> {
  // DarkModeContext reads localStorage['theme'] before first paint.
  await page.addInitScript(t => {
    window.localStorage.setItem('theme', t)
  }, theme)
  await page.goto(route, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready)
}

/**
 * Move a tooltip's positioning wrapper hard against one viewport edge, so the
 * collision this guard is about happens for certain rather than depending on
 * where the layout happened to put a column.
 */
async function pinTriggerToEdge(
  page: Page,
  triggerSelector: string,
  edge: 'left' | 'right'
): Promise<void> {
  const pinned = await page.evaluate(
    ({ triggerSelector, edge }) => {
      const trigger = document.querySelector(triggerSelector)
      // Both components put the panel in a `position: relative` wrapper; that
      // wrapper is the panel's containing block, so moving it moves the pair.
      const wrapper = trigger?.closest<HTMLElement>('.relative')
      if (!wrapper) return false
      wrapper.style.position = 'fixed'
      wrapper.style.top = '50%'
      wrapper.style.zIndex = '9999'
      wrapper.style.left = edge === 'left' ? '0px' : 'auto'
      wrapper.style.right = edge === 'right' ? '0px' : 'auto'
      return true
    },
    { triggerSelector, edge }
  )
  expect(
    pinned,
    `could not find a positioning wrapper for ${triggerSelector} — the ` +
      'component structure changed and this guard is no longer testing it'
  ).toBe(true)
  await page.waitForTimeout(100)
}

function describeBox(b: PanelBox): string {
  return `"${b.text}" [${b.left}, ${b.right}] in 0..${b.viewport}`
}

function expectInsideViewport(boxes: PanelBox[], where: string): void {
  const clipped = boxes.filter(b => b.left < 0 || b.right > b.viewport)
  expect(
    clipped,
    `${where}: ${clipped.length} tooltip panel(s) outside the viewport: ` +
      clipped.map(describeBox).join('; ')
  ).toEqual([])
}

for (const theme of THEMES) {
  for (const { label, width, height } of VIEWPORTS) {
    /* The bug exactly as reported: every row of the Education Levels card,
       whose label column is the leftmost thing on the page. */
    test(`Education Levels tooltips stay inside the viewport — ${label} ${theme}`, async ({
      page,
    }) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width, height })
      await load(page, '/district/61/analytics', theme)
      await page
        .locator(EDUCATION_CARD)
        .waitFor({ state: 'visible', timeout: 30_000 })
      expect(
        await page.getAttribute('html', 'data-theme'),
        'theme did not apply — measured the wrong appearance'
      ).toBe(theme)

      const triggers = page.locator(EDUCATION_TRIGGERS)
      const boxes: PanelBox[] = []
      for (let i = 0; i < (await triggers.count()); i++) {
        boxes.push(...(await hoverAndRead(page, triggers.nth(i))))
      }

      // Non-vacuity: the card is a plain block that renders identically at
      // every width, so all five of its tooltips must have opened. A card that
      // failed to render cannot pass this guard by measuring nothing.
      expect(
        boxes.length,
        `${label}/${theme}: opened ${boxes.length} of ${EDUCATION_PANELS} ` +
          'Education Levels tooltips — the card did not render as expected'
      ).toBe(EDUCATION_PANELS)

      expectInsideViewport(boxes, `${label}/${theme} Education Levels`)
    })
  }
}

/* Both shared components, both edges, forced — independent of which column the
   data and the responsive layout happen to produce.
   Light theme only, deliberately: the theme axis is already covered above, and
   nothing in the clamp is theme-dependent (it reads a box and writes a length).
   The two axes that DO change the outcome are the viewport width and which
   component's panel width is being clamped, and both are swept here. */
for (const { label, width, height } of VIEWPORTS) {
  for (const { what, route, trigger, sentinel } of PINNABLE) {
    test(`${what} stays readable pinned to either edge — ${label}`, async ({
      page,
    }) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width, height })
      await load(page, route, 'light')
      await page
        .locator(sentinel)
        .first()
        .waitFor({ state: 'visible', timeout: 30_000 })

      for (const edge of ['left', 'right'] as const) {
        await pinTriggerToEdge(page, trigger, edge)
        const boxes = await hoverAndRead(page, page.locator(trigger).first())

        expect(
          boxes.length,
          `${label}: pinning ${what} to the ${edge} edge opened no panel — ` +
            'nothing was measured'
        ).toBeGreaterThan(0)
        expectInsideViewport(boxes, `${label} ${what} ${edge} edge`)
      }
    })
  }
}

/* The trivial way to stop a 320px panel overflowing a 375px viewport is to
   shrink the trigger until nothing collides. That trades a readability bug for
   a WCAG 2.5.5 violation, so pin the floor on the very controls this fix
   touches — independently of the whole-page sweep in touch-targets.smoke.ts. */
test('the tooltip triggers keep their 44px floor', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 375, height: 812 })
  await load(page, '/', 'light')
  await page
    .locator('button[aria-label="info"]')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(500)

  const measured = await page.evaluate(floor => {
    const undersized: string[] = []
    let counted = 0
    for (const el of Array.from(
      document.querySelectorAll('button[aria-label="info"]')
    )) {
      const r = el.getBoundingClientRect()
      if (r.width <= 1 || r.height <= 1) continue // collapsed, not a target
      counted++
      if (r.width < floor || r.height < floor) {
        undersized.push(`${Math.round(r.width)}×${Math.round(r.height)}`)
      }
    }
    return { undersized, counted }
  }, MIN_TOUCH_TARGET_PX)

  expect(
    measured.counted,
    'measured 0 info-tooltip triggers — the page did not render'
  ).toBeGreaterThan(0)
  expect(
    measured.undersized,
    `info-tooltip trigger(s) below the ${MIN_TOUCH_TARGET_PX}px floor: ` +
      measured.undersized.join('; ')
  ).toEqual([])
})
