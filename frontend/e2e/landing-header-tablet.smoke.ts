import { test, expect, type Page } from './fixtures/test'

/* Landing header at tablet widths (#1917).
 *
 * Measured on prod 2026-10-12 before the fix:
 *  - 768px: the header actions (freshness pill · PY · date · Export · Share)
 *    sat inline and took 616 of the header's 720px, leaving the intro column
 *    88px wide. Title on two lines, the lede one or two words per line, and
 *    the header 671px tall (211px at 1024).
 *  - 820px: same squeeze, intro 156px, header 437px.
 *  - 768px: the "How it works" nav link wrapped to two lines (57px tall
 *    against 44px for its siblings).
 *
 * Measured by bounding box on the deployed preview (BASE_URL); jsdom has no
 * layout (Lesson 134). Gated on a content sentinel (a KPI value) so a blank
 * or still-loading page cannot pass vacuously.
 */

// The intro must keep a readable measure beside or above the actions.
const INTRO_MIN_WIDTH = 320
// A one-line nav link is 44px (the touch floor) to 48px; two lines is ≥57.
const NAV_LINK_MAX_HEIGHT = 48
const RANKINGS_GLOB = '**/*rankings.json'

async function load(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'networkidle', timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await expect(page.getByTestId('kpi-paid-clubs')).toHaveText(/\d/, {
    timeout: 30_000,
  })
}

for (const width of [768, 820, 1024]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`landing header at ${width}px (${theme}) is not crowded`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript(t => {
        try {
          localStorage.setItem('theme', t)
        } catch {
          /* storage blocked: the default theme is still measured */
        }
      }, theme)
      await load(page)

      const m = await page.evaluate(() => {
        const box = (el: Element | null) => {
          if (!el) return null
          const r = el.getBoundingClientRect()
          return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width }
        }
        const header = document.querySelector(
          '.districts-page-root .districts-page-header'
        )
        const intro = header?.querySelector('.districts-page-header__intro')
        const actions = header?.querySelector(
          '.districts-page-header__actions:not(.districts-page-header__actions--skeleton)'
        )
        const title = header?.querySelector('.districts-page-header__title')
        const titleLines = title
          ? Math.round(
              title.getBoundingClientRect().height /
                parseFloat(getComputedStyle(title).lineHeight)
            )
          : null
        const links = [
          ...document.querySelectorAll('.app-shell-top-bar .app-shell-nav > *'),
        ].map(e => ({
          text: (e.textContent ?? '').trim(),
          h: Math.round(e.getBoundingClientRect().height),
          right: e.getBoundingClientRect().right,
        }))
        const tools = box(document.querySelector('.app-shell-tools'))
        const actionTargets = actions
          ? [...actions.querySelectorAll('button, a')].map(e => {
              const r = e.getBoundingClientRect()
              return {
                text: (e.textContent ?? '').trim(),
                w: r.width,
                h: r.height,
              }
            })
          : []
        return {
          intro: box(intro ?? null),
          actions: box(actions ?? null),
          titleLines,
          links,
          tools,
          actionTargets,
          overflowX: document.documentElement.scrollWidth > window.innerWidth,
        }
      })

      expect(m.intro, 'landing intro not found').not.toBeNull()
      expect(m.actions, 'landing header actions not found').not.toBeNull()
      expect(
        m.intro!.w,
        `intro column ${Math.round(m.intro!.w)}px < ${INTRO_MIN_WIDTH}px`
      ).toBeGreaterThanOrEqual(INTRO_MIN_WIDTH)
      expect(m.titleLines, 'title "District Rankings" wraps').toBe(1)

      // Intro and actions never overlap.
      const a = m.actions!
      const i = m.intro!
      const overlapX = Math.min(a.r, i.r) - Math.max(a.l, i.l)
      const overlapY = Math.min(a.b, i.b) - Math.max(a.t, i.t)
      expect(overlapX > 1 && overlapY > 1, 'intro and actions overlap').toBe(
        false
      )

      for (const t of m.actionTargets) {
        expect(t.h, `"${t.text}" target height`).toBeGreaterThanOrEqual(44)
      }

      expect(m.links.length).toBeGreaterThan(0)
      for (const l of m.links) {
        expect(
          l.h,
          `nav link "${l.text}" wraps (${l.h}px tall)`
        ).toBeLessThanOrEqual(NAV_LINK_MAX_HEIGHT)
        expect(
          l.right,
          `nav link "${l.text}" runs into the search/tools`
        ).toBeLessThanOrEqual(m.tools!.l)
      }
      expect(m.overflowX, 'horizontal page scroll').toBe(false)
    })
  }
}

/* The stacked tablet header must not reintroduce the loading→loaded shift
 * #922/#1359 closed: the shell's actions skeleton has to land the KPI strip
 * where the loaded header does. */
for (const width of [768, 820]) {
  test(`landing loading shell holds the KPI strip at the loaded y (${width}px)`, async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width, height: 900 })
    let release: (() => void) | undefined
    const gate = new Promise<void>(r => (release = r))
    await page.route(RANKINGS_GLOB, async route => {
      await gate
      await route.continue()
    })
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    const loading = await page.locator('.districts-kpi-strip').boundingBox()
    release!()
    await expect(page.getByTestId('kpi-paid-clubs')).toHaveText(/\d/, {
      timeout: 60_000,
    })
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    const loaded = await page.locator('.districts-kpi-strip').boundingBox()
    expect(loading, 'KPI strip missing while loading').not.toBeNull()
    expect(loaded, 'KPI strip missing once loaded').not.toBeNull()
    expect(Math.abs(loaded!.y - loading!.y)).toBeLessThanOrEqual(1)
  })
}
