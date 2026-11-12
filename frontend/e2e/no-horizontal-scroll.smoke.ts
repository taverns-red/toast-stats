import { test, expect } from './fixtures/test'

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
  '/history/countries', // #1797: SVG map + ranked table
  '/district/61',
  // #2432: the since-last-year column's sr-only change words escaped the
  // table scroller and widened the page by 73px at 768.
  '/district/61/clubs?since=climbed',
  // #2452: the What Changed club-filter chip carries a full club name.
  '/district/61/changes?club=7782',
  // #2476: region and world What Changed — a six-column district table and
  // a five-column region table, each in its own scroller.
  '/region/05/changes',
  '/regions/changes',
]
const THEMES = ['light', 'dark'] as const
// #2451: the Clubs table's opt-in Changes columns render the same
// ChangeIndicator (absolute sr-only word) as the since-last-year column. The
// toggle is a stored preference, not URL state, so this pass stores it on
// before loading the Clubs table.
const CHANGES_ROUTE = '/district/61/clubs'
// The v2 column preference (#2676): an explicit show override per Changes column.
const CHANGES_VISIBLE_KEY = 'toast-stats:v1:clubs-table:columns'
const CHANGES_VISIBLE_VALUE = JSON.stringify({
  schema: 2,
  overrides: {
    deltaMembership: true,
    deltaPayments: true,
    deltaDcpGoals: true,
    tierTransition: true,
    distinguishedFlip: true,
  },
})
// ClubsTable swaps the table for phone rows below 768 (useIsMobile(768)).
const TABLE_MIN_WIDTH = 768

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

      const passes = [
        ...ROUTES.map(route => ({ route, changes: false })),
        { route: CHANGES_ROUTE, changes: true },
      ]
      for (const { route, changes } of passes) {
        if (changes) {
          // Same origin as the previous pass, so storage is writable here.
          await page.evaluate(
            ([key, value]) => localStorage.setItem(key, value),
            [CHANGES_VISIBLE_KEY, CHANGES_VISIBLE_VALUE]
          )
        }
        await page.goto(route, { waitUntil: 'networkidle', timeout: 60_000 })
        await page.locator('.app-shell-top-bar').waitFor({ state: 'visible' })
        if (changes && width >= TABLE_MIN_WIDTH) {
          // Guard against a vacuous pass: the Changes columns must be on.
          await expect(
            page.getByRole('columnheader', { name: 'Δ Members' })
          ).toBeVisible({ timeout: 30_000 })
        }
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
          `${route}${changes ? ' (Changes columns on)' : ''} at ${width}px (${theme}) scrolls horizontally: scrollWidth ${scrollWidth} > ${clientWidth}. Past the right edge: ${offenders.join(', ')}`
        ).toBeLessThanOrEqual(clientWidth)
      }
    })
  }
}
