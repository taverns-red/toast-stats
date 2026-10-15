import { test, expect, type Page } from './fixtures/test'

/* WCAG AA text contrast on the routes #1839 fixed (epic #1827).
 *
 * The 2026-10-11 mobile review and the 2.48.0 prod sweep found three misses:
 *  - the retired amber brand accent (#D4873F, gone since #2080) as TEXT on white: the
 *    club-history year links (2.86:1, 768+ where the full table renders) and
 *    the 404 code (2.86:1, under even the 3:1 large-text bar);
 *  - dark mode's primary button / skip link: white on the remapped light
 *    loyal-blue (#5DADE2) is 2.46:1 — the 404 "Go home" and every page's
 *    skip link once focused.
 *
 * #1904 extends it to 768 and 1280 (the 2.49.0 prod sweep): dark mode's
 * striped "projected" tier pill on the Clubs table (1.82:1 — dark ink with no
 * background-color under its gradient stripes, so the text lands on the dark
 * row wherever the stripe image is not painted) and the Trends chart legend,
 * whose recharts text inherits each series' stroke colour (cool gray
 * #A9B2B1 on white, 2.17:1).
 *
 * Method mirrors the review's `summarize.mjs contrast`: every visible text
 * node's colour, alpha-blended over the first opaque ancestor background,
 * against 4.5:1 (3:1 for ≥24px, or ≥18.66px bold). Both themes, both engines.
 */

interface Fail {
  el: string
  text: string
  ratio: number
}

async function contrastFailures(page: Page): Promise<Fail[]> {
  return page.evaluate(() => {
    type C = { r: number; g: number; b: number; a: number }
    const parse = (c: string): C | null => {
      const m = c.match(/rgba?\(([^)]+)\)/)
      if (!m) return null
      const p = m[1]!.split(',').map(parseFloat)
      return { r: p[0]!, g: p[1]!, b: p[2]!, a: p.length > 3 ? p[3]! : 1 }
    }
    const lum = ({ r, g, b }: C) => {
      const f = (v: number) => {
        v /= 255
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const bgOf = (el: Element | null): C => {
      for (let p = el; p; p = p.parentElement) {
        const c = parse(getComputedStyle(p).backgroundColor)
        if (c && c.a > 0.9) return c
      }
      return { r: 255, g: 255, b: 255, a: 1 }
    }
    const out: { el: string; text: string; ratio: number }[] = []
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    )
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent || '').trim()
      if (text.length < 2) continue
      const el = n.parentElement
      if (!el) continue
      const cs = getComputedStyle(el)
      if (
        cs.display === 'none' ||
        cs.visibility === 'hidden' ||
        cs.opacity === '0'
      )
        continue
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      const fg = parse(cs.color)
      if (!fg) continue
      const bg = bgOf(el)
      const blended =
        fg.a < 1
          ? {
              r: fg.r * fg.a + bg.r * (1 - fg.a),
              g: fg.g * fg.a + bg.g * (1 - fg.a),
              b: fg.b * fg.a + bg.b * (1 - fg.a),
              a: 1,
            }
          : fg
      const l1 = lum(blended)
      const l2 = lum(bg)
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
      const px = parseFloat(cs.fontSize)
      const large = px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight) >= 700)
      if (ratio < (large ? 3 : 4.5)) {
        out.push({
          el: `${el.tagName.toLowerCase()}.${(el.getAttribute('class') || '').split(/\s+/).slice(0, 2).join('.')}`,
          text: text.slice(0, 30),
          ratio: Math.round(ratio * 100) / 100,
        })
      }
    }
    return out
  })
}

const CASES: { path: string; width: number; ready: string }[] = [
  // 404 code + "Go home" (dark).
  {
    path: '/this/route/does/not/exist',
    width: 375,
    ready: '.error-page__code',
  },
  // The active year chip's green "· LIVE" on its tinted surface (4.27:1).
  { path: '/history', width: 375, ready: '.history-page-year-chip__live' },
  // Year links render in the full table at 768+ (phone shows priority rows).
  {
    path: '/district/61/club/7238597/history',
    width: 768,
    ready: '.club-history-year-link',
  },
  // #1904: the projected tier pill (dark) and the chart legend text, at the
  // tablet and desktop widths #1839's 375 gate did not cover.
  ...[768, 1280].flatMap(width => [
    {
      path: '/district/61/clubs',
      width,
      ready: '.clubs-tier-pill--projected',
    },
    {
      path: '/district/61/trends',
      width,
      // The series legend is chips since #1835 (was Recharts' strip).
      ready: '.chart-legend-chip',
    },
  ]),
]

for (const theme of ['light', 'dark'] as const) {
  for (const { path, width, ready } of CASES) {
    test(`0 AA contrast failures at ${width} ${theme} — ${path}`, async ({
      page,
    }) => {
      test.setTimeout(90_000)
      await page.emulateMedia({ colorScheme: theme })
      await page.addInitScript(t => {
        try {
          localStorage.setItem('theme', t)
        } catch {
          /* storage blocked: colorScheme still drives the theme */
        }
      }, theme)
      await page.setViewportSize({ width, height: 900 })
      await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
      await page.locator(ready).first().waitFor({ timeout: 30_000 })
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      const fails = await contrastFailures(page)
      expect(
        fails,
        `${path} ${theme}: ` +
          fails.map(f => `${f.el} "${f.text}" ${f.ratio}:1`).join('; ')
      ).toEqual([])
    })
  }
}
