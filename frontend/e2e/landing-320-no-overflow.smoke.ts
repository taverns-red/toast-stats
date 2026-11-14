import { test, expect } from './fixtures/test'

/* The landing does not scroll sideways at 320px (#2620).
 *
 * 320px is the narrowest common phone width (older iPhone SE, zoomed phone
 * displays). At 320 the landing's document was 336px wide, so the page panned
 * 16px sideways: the World pulse's third tile and the membership sparkline ran
 * past the right edge. no-horizontal-scroll.smoke.ts covers 375/768/1280;
 * this pins the narrower floor on the landing. It measures the document's
 * scrollWidth (what a reader feels) and names the outermost elements past the
 * edge so a regression says where to fix. */

const WIDTH = 320
const THEMES = ['light', 'dark'] as const

for (const theme of THEMES) {
  test(`landing has no horizontal page scroll at ${WIDTH}px (${theme})`, async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await page.addInitScript(t => {
      try {
        localStorage.setItem('theme', t)
      } catch {
        // storage blocked: the theme falls back to prefers-color-scheme
      }
    }, theme)
    await page.emulateMedia({ colorScheme: theme })
    await page.setViewportSize({ width: WIDTH, height: 900 })
    await page.goto('/', { waitUntil: 'networkidle', timeout: 60_000 })
    await page.locator('.app-shell-top-bar').waitFor({ state: 'visible' })
    // The World pulse is the section that overflowed: wait for its data so
    // the loaded tiles and sparkline are what is measured, not the reserve.
    await page.locator('.world-pulse__tiles').waitFor({ state: 'visible' })
    await page.waitForTimeout(1_000)

    const { scrollWidth, clientWidth, offenders } = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth
      const past = (el: Element) => el.getBoundingClientRect().right > vw + 0.5
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
          return `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 3).join('.')} (right ${Math.round(r.right)}, width ${Math.round(r.width)})`
        })
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: vw,
        offenders,
      }
    })
    expect(
      scrollWidth,
      `/ at ${WIDTH}px (${theme}) scrolls horizontally: scrollWidth ${scrollWidth} > ${clientWidth}. Past the right edge: ${offenders.join(', ')}`
    ).toBeLessThanOrEqual(clientWidth)
  })
}
