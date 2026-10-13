import { test, expect, type Page } from './fixtures/test'
import {
  NOT_PROSE_LINKS,
  describeTarget,
  measureInteractiveTargets,
  measureText,
} from './helpers/mobile-measure'
import {
  INTERACTIVE_SELECTORS,
  MIN_TOUCH_TARGET_PX,
} from '../src/utils/touchTargetUtils'
import budgets from './mobile-375-budgets.json' with { type: 'json' }

/* 375 mobile gate (#1841, epic #1827 Phase 1b, review §7 "Mobile CI gate").
 *
 * One page load per route at 375×812 with touch, in light and dark, over the
 * 25 routes the 2026-10-11 mobile review measured. Each route waits for its
 * content sentinel (Lesson 141: chrome renders even when content fails), then
 * asserts four things in one place:
 *
 *  1. Document overflow = 0 with the `body { overflow-x: hidden }` mask
 *     (index.css) switched off. A canary showed `scrollWidth` already sees
 *     through the mask in Chromium and WebKit while the reader cannot scroll
 *     to the overflow, so the gate turns the mask off explicitly rather than
 *     rely on that: what is measured is the page a reader would get.
 *  2. Every tap target ≥ 44px, measured exactly as touch-targets.smoke does
 *     (shared helper), minus allowlisted offenders that each name an issue.
 *  3. Characters under 14px ≤ the route's ratchet (≤ 15%), measured as
 *     type-floor.smoke does. type-floor keeps the flat 15% / 12px floor; this
 *     gate holds each route to the share it had when the gate landed.
 *  4. First page-specific content starts by the route's budget (≤ 110px on
 *     the context-bar routes).
 *
 * Budgets live in mobile-375-budgets.json and only ratchet down. The measured
 * values are attached to every test as annotations so a ratchet is a copy.
 * Lighthouse mobile (lighthouserc.mobile.js) owns LCP/CLS/weight; this gate
 * owns layout geometry, so the two do not overlap.
 */

interface RouteBudget {
  path: string
  sentinel: string
  first?: string
  contextBar?: boolean
  firstContentMaxPx: number
  maxShareUnder14: number
  issue?: string
}
interface TapAllow {
  path: string
  selector: string
  issue: string
}

const VIEWPORT = { width: 375, height: 812 }
const ROUTES = budgets.routes as RouteBudget[]
const TAP_ALLOWLIST = budgets.tapAllowlist as TapAllow[]
const OVERFLOW_MAX = budgets.targets.overflowPx

/* Loading placeholders the app renders; nothing is measured while one shows
 * (same set as district-subpages-cls.smoke). */
const PENDING = '[aria-label^="Loading"], .chart-skeleton, .animate-pulse'

test.use({ viewport: VIEWPORT, hasTouch: true })

/* Wait until layout is at rest: no running animation, and the document size,
 * scroll position and first-content top unchanged for 5 frames and 150ms
 * (the #1985/#1997 pattern). Gives up after 5s and measures anyway, so a page
 * that never settles fails its assertions rather than hanging. */
async function settle(page: Page, firstSel: string): Promise<void> {
  await page.evaluate(
    sel =>
      new Promise<void>(resolve => {
        let last = ''
        let frames = 0
        let since = performance.now()
        const t0 = since
        const tick = () => {
          const t = performance.now()
          const de = document.documentElement
          const top = document.querySelector(sel)?.getBoundingClientRect().top
          const running = document
            .getAnimations()
            .filter(a => a.playState === 'running').length
          const now = `${de.scrollWidth}:${de.scrollHeight}:${window.scrollY}:${top}:${running}`
          if (now === last && running === 0) frames++
          else [last, frames, since] = [now, 0, t]
          if ((frames >= 5 && t - since >= 150) || t - t0 > 5000) resolve()
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    firstSel
  )
}

/* Overflow with the mask off, plus the outermost elements past the right
 * edge (not inside a scroller/clip) so a failure says where to fix. */
async function measureOverflow(
  page: Page
): Promise<{ overflow: number; offenders: string[] }> {
  await page.addStyleTag({
    content: 'html, body { overflow-x: visible !important; }',
  })
  return page.evaluate(() => {
    const de = document.documentElement
    const vw = de.clientWidth
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
        const cls = [...el.classList].slice(0, 3).join('.')
        return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} (right ${Math.round(r.right)})`
      })
    return { overflow: de.scrollWidth - vw, offenders }
  })
}

for (const theme of ['light', 'dark'] as const) {
  for (const route of ROUTES) {
    const { path } = route
    test(`375 gate — ${path} (${theme})`, async ({ page }) => {
      test.setTimeout(90_000)
      await page.addInitScript(t => {
        try {
          localStorage.setItem('theme', t)
        } catch {
          // storage blocked: the theme falls back to prefers-color-scheme
        }
      }, theme)
      await page.emulateMedia({ colorScheme: theme })
      await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })

      // Content-ready and non-vacuity: the sentinel is page content, not
      // chrome; `:visible` skips a responsive twin hidden at 375 (L149).
      await page
        .locator(route.sentinel)
        .locator('visible=true')
        .first()
        .waitFor({ state: 'visible', timeout: 30_000 })
      await expect(page.locator(PENDING).locator('visible=true')).toHaveCount(
        0,
        { timeout: 30_000 }
      )
      await page.evaluate(() => document.fonts.ready)
      const firstSel = route.first ?? route.sentinel
      await settle(page, firstSel)

      // 4. First page-specific content offset, at scroll 0.
      const firstTop = await page.evaluate(sel => {
        window.scrollTo(0, 0)
        const el = [...document.querySelectorAll(sel)].find(e => {
          const r = e.getBoundingClientRect()
          return r.width > 1 && r.height > 1
        })
        return el ? Math.round(el.getBoundingClientRect().top) : null
      }, firstSel)

      // 2. Tap targets.
      const allow = TAP_ALLOWLIST.filter(a => a.path === path)
      const targets = await measureInteractiveTargets(
        page,
        INTERACTIVE_SELECTORS,
        NOT_PROSE_LINKS,
        allow.map(a => a.selector)
      )
      const small = targets.filter(
        f => f.w < MIN_TOUCH_TARGET_PX || f.h < MIN_TOUCH_TARGET_PX
      )
      const failingTargets = small.filter(f => !f.allowedBy)
      // An allowlist entry whose offender is gone is stale: remove it.
      const stale = allow.filter(
        a => !small.some(f => f.allowedBy === a.selector)
      )

      // 3. Text size.
      const text = await measureText(page, 12)
      const share = text.total ? text.under14 / text.total : 1

      // 1. Overflow, last: it injects the unmask style.
      const { overflow, offenders } = await measureOverflow(page)

      test.info().annotations.push({
        type: 'measured',
        description: JSON.stringify({
          path,
          theme,
          firstTop,
          share: Math.round(share * 10_000) / 10_000,
          chars: text.total,
          overflow,
          smallTargets: small.length,
        }),
      })

      // The sentinel proved the content rendered; these keep a measure that
      // found nothing from passing (a 404 carries ~135 characters, so no
      // larger floor fits every route).
      expect(text.total, `${path}: no visible text measured`).toBeGreaterThan(0)
      expect(
        targets.length,
        `${path}: no measurable interactive elements — page did not render`
      ).toBeGreaterThan(0)

      expect(
        overflow,
        `${path} (${theme}) overflows the 375 viewport by ${overflow}px with the body mask off. Past the edge: ${offenders.join(', ')}`
      ).toBeLessThanOrEqual(OVERFLOW_MAX)
      expect(
        failingTargets,
        `${path} (${theme}): ${failingTargets.length} sub-${MIN_TOUCH_TARGET_PX}px target(s) not in the allowlist: ` +
          failingTargets.map(describeTarget).join('; ')
      ).toEqual([])
      expect(
        stale.map(a => `${a.selector} (${a.issue})`),
        `${path}: allowlisted targets no longer undersized — remove them from mobile-375-budgets.json`
      ).toEqual([])
      expect(
        share,
        `${path}: ${(share * 100).toFixed(1)}% of ${text.total} characters under 14px (ratchet ${route.maxShareUnder14 * 100}%). Largest: ` +
          text.offenders.join('; ')
      ).toBeLessThanOrEqual(route.maxShareUnder14)
      expect(
        firstTop,
        `${path}: first content (${firstSel}) not found`
      ).not.toBeNull()
      expect(
        firstTop,
        `${path} (${theme}): first content (${firstSel}) starts at ${firstTop}px (budget ${route.firstContentMaxPx}px)`
      ).toBeLessThanOrEqual(route.firstContentMaxPx)
    })
  }
}
