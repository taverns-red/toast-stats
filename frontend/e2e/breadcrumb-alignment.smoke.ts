import { test, expect, type Page } from '@playwright/test'
import { MIN_TOUCH_TARGET_PX } from '../src/utils/touchTargetUtils'

/* Breadcrumb baseline-alignment tripwire (#1387).
 *
 * The subpage breadcrumb rendered on two visual baselines: the links sat
 * ~14px ABOVE the `›` separators and the current-page crumb.
 *
 * Root cause — the WCAG 2.5.5 touch-target floor, not typography. Every part
 * is 14px, same family, same `vertical-align`. But `styles/layers/base.css`
 * (and the desktop bump in `styles/responsive.css`) floor `a[href]` at
 * 44px/48px `min-height`. Each crumb `<a>` is a flex item of its `<li>`, so it
 * is blockified and the floor applies — a 48px-tall box whose 20px line box
 * paints at the TOP. The `›` spans carry no floor, are 21px tall, and
 * `align-items:center` centres them in the 48px flex line. Labels landed at
 * y=80, everything else at y=94.
 *
 * Same mechanism as lesson "a skeleton that omits a button under-reserves by
 * the touch-target floor" (#1359): a 14px control whose BOX is silently 44px+.
 *
 * Why this shape:
 *  - Real geometry, not a className (L108/134/138). jsdom has no layout, so a
 *    unit test can assert the centring contract is *present* but never that
 *    the pixels line up. Only `getBoundingClientRect` proves it.
 *  - We measure the TEXT, not the box. The bug is precisely that the anchor's
 *    box and its glyphs disagree — a box-centre assertion passes today. A
 *    `Range` over the element's contents gives the rendered inline text box.
 *  - Grouped by flex LINE, because the `<ol>` is `flex-wrap` and genuinely
 *    wraps at 375px. Parts on different lines must NOT share a centre; parts
 *    on the same line must. Within one flex line `align-items:center` gives
 *    every `<li>` the same centre, so the `<li>` centre identifies the line.
 *  - Both engines (#710) and both themes, at 375 / 768 / 1350 — the floor is
 *    breakpoint-dependent (44px mobile/tablet, 48px desktop), so a fix that
 *    only works at one width would slip through a single-viewport check.
 *  - Asserts the 44px floor SURVIVES. The trivial "fix" is to shrink the hit
 *    area; that is forbidden, and this test fails if anyone tries it.
 */

// The deepest breadcrumb in the app: District › Clubs › <club name>. Three
// crumbs plus two separators, and long enough to wrap at 375px.
const ROUTE = '/district/61/club/01479548'

/* `wraps` marks the width where the `<ol className="flex-wrap">` genuinely
   breaks onto a second flex line (measured: 320px → two lines, 360px+ → one).
   320px is the app's supported floor (`body { min-width: 320px }`). Asserting
   the line count there keeps the wrap path from silently losing coverage if
   the sample club's name ever shortens — a vacuous green is worse than a
   loud red (R20 spirit). */
const VIEWPORTS = [
  { label: '320px', width: 320, height: 812, wraps: true },
  { label: '375px', width: 375, height: 812, wraps: false },
  { label: '768px', width: 768, height: 1024, wraps: false },
  { label: '1350px', width: 1350, height: 900, wraps: false },
]

const THEMES = ['light', 'dark'] as const

/** Sub-pixel rounding between a 20px and a 21px line box is real; 14px is not. */
const TOLERANCE_PX = 1

interface Part {
  txt: string
  tag: string
  /** Vertical centre of the RENDERED TEXT, not of the element's box. */
  textCentre: number
  /** Vertical centre of the owning <li> — identifies the flex line. */
  lineCentre: number
  boxW: number
  boxH: number
}

async function measureBreadcrumb(page: Page): Promise<Part[]> {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Breadcrumb"]')
    if (!nav) return []
    const out: Part[] = []
    for (const li of Array.from(nav.querySelectorAll('li'))) {
      const liRect = li.getBoundingClientRect()
      const lineCentre = liRect.top + liRect.height / 2
      for (const el of Array.from(li.children) as HTMLElement[]) {
        const text = (el.textContent || '').trim()
        if (!text) continue
        const range = document.createRange()
        range.selectNodeContents(el)
        const textRect = range.getBoundingClientRect()
        const box = el.getBoundingClientRect()
        out.push({
          txt: text,
          tag: el.tagName,
          textCentre: textRect.top + textRect.height / 2,
          lineCentre,
          boxW: box.width,
          boxH: box.height,
        })
      }
    }
    return out
  })
}

function describePart(p: Part): string {
  return `${p.tag}("${p.txt}") text-centre ${p.textCentre.toFixed(1)}`
}

for (const theme of THEMES) {
  for (const { label, width, height, wraps } of VIEWPORTS) {
    test(`breadcrumb parts share one baseline — ${label} ${theme}`, async ({
      page,
    }) => {
      test.setTimeout(90_000)
      await page.setViewportSize({ width, height })
      // DarkModeContext reads localStorage['theme'] before first paint.
      await page.addInitScript(t => {
        window.localStorage.setItem('theme', t)
      }, theme)

      await page.goto(ROUTE, { waitUntil: 'networkidle', timeout: 60_000 })

      // Content sentinel: the breadcrumb only mounts once the club resolves,
      // so this is both the ready-gate and the anti-vacuous-green guard.
      await page
        .locator('nav[aria-label="Breadcrumb"]')
        .waitFor({ state: 'visible', timeout: 30_000 })
      // Display-font reflow settles before we measure text boxes (L134).
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(500)

      expect(
        await page.getAttribute('html', 'data-theme'),
        `theme did not apply — measured the wrong appearance`
      ).toBe(theme)

      const parts = await measureBreadcrumb(page)

      // Non-vacuity: District › Clubs › club = 3 crumbs + 2 separators.
      expect(
        parts.length,
        'breadcrumb rendered no measurable parts — page did not render'
      ).toBe(5)

      // Group by flex line. `align-items:center` makes every <li> on a line
      // share a centre; a 2px bucket absorbs sub-pixel jitter without ever
      // merging two lines (the smallest line is ~21px tall).
      const lines = new Map<number, Part[]>()
      for (const p of parts) {
        const key = Math.round(p.lineCentre / 2)
        const bucket = lines.get(key)
        if (bucket) bucket.push(p)
        else lines.set(key, [p])
      }

      expect(
        lines.size,
        `${label}/${theme}: expected the breadcrumb to ` +
          `${wraps ? 'wrap onto 2+ flex lines' : 'fit on a single flex line'}` +
          `, measured ${lines.size}`
      ).toBe(wraps ? 2 : 1)

      for (const [, group] of lines) {
        const centres = group.map(p => p.textCentre)
        const spread = Math.max(...centres) - Math.min(...centres)
        expect(
          spread,
          `${label}/${theme}: breadcrumb parts on one line disagree by ` +
            `${spread.toFixed(1)}px — ${group.map(describePart).join('; ')}`
        ).toBeLessThanOrEqual(TOLERANCE_PX)
      }

      // The fix must not buy alignment by shrinking the hit area (WCAG 2.5.5,
      // guarded independently by touch-targets.smoke.ts).
      const links = parts.filter(p => p.tag === 'A')
      expect(links.length, 'expected linked crumbs').toBeGreaterThan(0)
      const undersized = links.filter(
        p => p.boxW < MIN_TOUCH_TARGET_PX || p.boxH < MIN_TOUCH_TARGET_PX
      )
      expect(
        undersized,
        `${label}/${theme}: breadcrumb link(s) below the ` +
          `${MIN_TOUCH_TARGET_PX}px floor: ` +
          undersized.map(p => `${p.txt} ${p.boxW}×${p.boxH}`).join('; ')
      ).toEqual([])
    })
  }
}
