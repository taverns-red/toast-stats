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
 * (right 432 / 825 / 1407 against innerWidth 375 / 768 / 1350), as did the
 * district KPI strip's `Tooltip`s. The fix therefore lives in the shared
 * components (R10), and this guard covers both edges and both components.
 *
 * Why this shape (lessons 108 / 134 / 138, and the #1387 probe):
 *  - Real geometry, not `toBeVisible`. A visibility assertion passes on `main`
 *    with the panel half off-screen — that is precisely the bug. We read
 *    `getBoundingClientRect()` and compare against the live viewport.
 *  - Every viewport in the acceptance set (375 / 768 / 1350) and both themes.
 *    Column position decides the clip, and which column sits near an edge is a
 *    function of width, so a single-viewport check would miss most of it.
 *  - Both engines (#710) via the two playwright.config projects.
 *  - Asserts the 44px trigger floor SURVIVES in the same run. The forbidden
 *    "fix" is to shrink the control; this reds if anyone tries it.
 */

const VIEWPORTS = [
  { label: '375px', width: 375, height: 812 },
  { label: '768px', width: 768, height: 1024 },
  { label: '1350px', width: 1350, height: 900 },
]

const THEMES = ['light', 'dark'] as const

interface Target {
  /** Route to open. */
  route: string
  /** What the triggers are, for failure messages. */
  what: string
  /** Hover targets that open a tooltip panel. */
  triggers: string
  /** Selector that must exist before we measure (anti-vacuous-green). */
  sentinel: string
  /** How many panels this target must actually produce. */
  minPanels: number
}

const TARGETS: Target[] = [
  {
    // The reported bug: four rows, all clipped on the LEFT.
    route: '/district/61/analytics',
    what: 'Education Levels',
    triggers: 'section[aria-label="education levels"] svg[viewBox="0 0 20 20"]',
    sentinel: 'section[aria-label="education levels"]',
    minPanels: 5,
  },
  {
    // The mirror problem, on the other shared component: the landing page's
    // rightmost table-header InfoTooltip overflowed the RIGHT edge.
    route: '/',
    what: 'landing InfoTooltips',
    triggers: 'button[aria-label="info"]',
    sentinel: 'button[aria-label="info"]',
    // 13 triggers exist, but at 375px most of the stat-card and table-header
    // row is off-canvas or obscured and cannot be hovered at all; 4 open
    // there (including the two right-edge offenders) against 12 at 1350px.
    minPanels: 3,
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

async function openAndMeasure(
  page: Page,
  triggers: Locator
): Promise<PanelBox[]> {
  const count = await triggers.count()
  const measured: PanelBox[] = []
  for (let i = 0; i < count; i++) {
    const trigger = triggers.nth(i)
    try {
      await trigger.scrollIntoViewIfNeeded({ timeout: 5_000 })
      await trigger.hover({ timeout: 5_000 })
    } catch {
      // Obscured or off-canvas at this width — nothing a user can open.
      continue
    }
    // Tooltip's default open delay is 200ms.
    await page.waitForTimeout(350)
    measured.push(...(await readOpenPanels(page)))
    await page.mouse.move(0, 0)
    await page.waitForTimeout(120)
  }
  return measured
}

async function load(page: Page, route: string, theme: string): Promise<void> {
  // DarkModeContext reads localStorage['theme'] before first paint.
  await page.addInitScript(t => {
    window.localStorage.setItem('theme', t)
  }, theme)
  await page.goto(route, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready)
}

function describeBox(b: PanelBox): string {
  return `"${b.text}" [${b.left}, ${b.right}] in 0..${b.viewport}`
}

for (const theme of THEMES) {
  for (const { label, width, height } of VIEWPORTS) {
    test(`tooltip panels stay inside the viewport — ${label} ${theme}`, async ({
      page,
    }) => {
      test.setTimeout(180_000)
      await page.setViewportSize({ width, height })

      for (const target of TARGETS) {
        await load(page, target.route, theme)
        await page
          .locator(target.sentinel)
          .first()
          .waitFor({ state: 'visible', timeout: 30_000 })
        expect(
          await page.getAttribute('html', 'data-theme'),
          'theme did not apply — measured the wrong appearance'
        ).toBe(theme)

        const where = `${label}/${theme} ${target.route} (${target.what})`
        const boxes = await openAndMeasure(page, page.locator(target.triggers))

        // Non-vacuity: a panel that never opened cannot be clipped, and a
        // silently-empty run is the failure mode this guard must not have.
        expect(
          boxes.length,
          `${where}: opened ${boxes.length} tooltip panel(s), expected at ` +
            `least ${target.minPanels} — nothing was measured`
        ).toBeGreaterThanOrEqual(target.minPanels)

        const clipped = boxes.filter(b => b.left < 0 || b.right > b.viewport)
        expect(
          clipped,
          `${where}: ${clipped.length} tooltip panel(s) outside the ` +
            `viewport: ${clipped.map(describeBox).join('; ')}`
        ).toEqual([])
      }
    })
  }
}

/* The trivial way to stop a 320px panel overflowing a 375px viewport is to
   shrink the trigger (or the panel) until nothing collides. Shrinking the
   trigger trades a readability bug for a WCAG 2.5.5 violation, so pin the
   floor on the very controls this fix touches — independently of the
   whole-page sweep in touch-targets.smoke.ts. */
test('the tooltip triggers keep their 44px floor', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 375, height: 812 })
  await load(page, '/', 'light')
  await page
    .locator('button[aria-label="info"]')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(500)

  const undersized = await page.evaluate(floor => {
    const out: string[] = []
    for (const el of Array.from(
      document.querySelectorAll('button[aria-label="info"]')
    )) {
      const r = el.getBoundingClientRect()
      if (r.width <= 1 || r.height <= 1) continue // collapsed, not a target
      if (r.width < floor || r.height < floor) {
        out.push(`${Math.round(r.width)}×${Math.round(r.height)}`)
      }
    }
    return out
  }, MIN_TOUCH_TARGET_PX)

  expect(
    undersized,
    `info-tooltip trigger(s) below the ${MIN_TOUCH_TARGET_PX}px floor: ` +
      undersized.join('; ')
  ).toEqual([])
})
