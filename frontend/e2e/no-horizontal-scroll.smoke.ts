import { test, expect } from '@playwright/test'

/* No horizontal page scroll (#1651).
 *
 * The shared top bar's tools cluster (search, "How it works", theme toggle,
 * placeholder avatar) is `flex-shrink: 0`. Once #1058 added the search
 * control it outgrew the bar: 26px past the viewport at 375px and 178px at
 * 768px, so EVERY page panned sideways. #735 had sized the bar to clear
 * 375px, but no guard pinned that, so the regression went unnoticed.
 *
 * This guard pins it on the routes the issue names, at phone, tablet and
 * desktop widths, in both themes. It measures the document's scrollWidth,
 * which is what a reader feels, rather than any one element, so a future
 * overflow from any component trips it too. It runs in both engines via
 * playwright.config. */

const WIDTHS = [375, 768, 1280]
// #1655: the District overview (KPI card info button, milestone entries) and
// its Analytics subpage (Top Growth / Top DCP rows) overflowed with real data.
const ROUTES = [
  '/clubs',
  '/',
  '/club/9750',
  '/awards',
  '/district/61',
  '/district/61/analytics',
]
const THEMES = ['light', 'dark'] as const

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    test(`no horizontal page scroll at ${width}px (${theme})`, async ({
      page,
    }) => {
      test.setTimeout(120_000)
      await page.addInitScript(t => {
        try {
          localStorage.setItem('theme', t)
        } catch {
          // storage blocked: the theme falls back to prefers-color-scheme
        }
      }, theme)
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize({ width, height: 900 })

      for (const route of ROUTES) {
        await page.goto(route, { waitUntil: 'networkidle', timeout: 60_000 })
        await page.locator('.app-shell-top-bar').waitFor({ state: 'visible' })
        // Let separately-resolving sections settle before measuring.
        await page.waitForTimeout(1_000)

        const { scrollWidth, clientWidth, offenders } = await page.evaluate(
          () => {
            const vw = document.documentElement.clientWidth
            const past = (el: Element) =>
              el.getBoundingClientRect().right > vw + 0.5
            // Content inside a scroller or clip (e.g. the district subnav
            // strip) can sit past the edge without widening the page, so it
            // is not an offender. Report the outermost element that is past
            // the edge while its parent is not: that is where to fix (#1655).
            const clipped = (el: Element) => {
              for (let a = el.parentElement; a; a = a.parentElement) {
                if (a === document.body) return false
                if (getComputedStyle(a).overflowX !== 'visible') return true
              }
              return false
            }
            const offenders = [...document.querySelectorAll('body *')]
              .filter(
                el =>
                  past(el) &&
                  !(el.parentElement && past(el.parentElement)) &&
                  !clipped(el)
              )
              .slice(0, 5)
              .map(el => {
                const r = el.getBoundingClientRect()
                return `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 3).join('.')} (right ${Math.round(r.right)}, "${(el.textContent ?? '').trim().slice(0, 30)}")`
              })
            return {
              scrollWidth: document.documentElement.scrollWidth,
              clientWidth: vw,
              offenders,
            }
          }
        )
        expect(
          scrollWidth,
          `${route} at ${width}px (${theme}) scrolls horizontally: scrollWidth ${scrollWidth} > ${clientWidth}. Past the right edge: ${offenders.join(', ')}`
        ).toBeLessThanOrEqual(clientWidth)
      }
    })
  }
}
