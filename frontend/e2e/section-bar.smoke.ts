import { test, expect, type Page } from '@playwright/test'

/* Phone bottom section bar (#1832, mobile epic #1827 Phase 1, review §5.1).
 *
 * Below 768 in portrait, a 56px bar fixed to the bottom edge holds
 * Overview · Clubs · Divisions · Trends · More; More opens the shared bottom
 * sheet (#1831) with the other five sections. The 61px top scroll-row is gone
 * there, so page content starts right under the context bar (≤110px; it was
 * 169px at 375 with the top row). Landscape phones and ≥768 keep the #1849
 * scroll-row unchanged.
 *
 * Clubs-world gets the same bar with 3 routes + More (Overview ·
 * Distinguished · Select · More → President's, Smedley). Its header has no
 * context bar yet, so its content-top is reported, not budgeted, here.
 *
 * Measured on the deployed preview (BASE_URL) by bounding box (Lesson 134):
 * every label inside its item and the bar and never clipped, every item
 * ≥44px with ≥8px between items, labels ≥14px (review §7), and the end of
 * the page clear of the bar. 320 is the narrowest phone checked: the longest
 * labels ("Divisions", "Distinguished") must fit there unclipped.
 */

interface Suite {
  name: string
  routes: readonly string[]
  bar: string
  subnav: string
  labels: readonly string[]
  /** Budget for the first content row, where the context bar has landed. */
  contentTopMax: number | null
  more: {
    from: string
    links: readonly string[]
    pick: string
    to: RegExp
    back: RegExp
  }
  fallback: { path: string; active: string }
}

// The app may append its URL state (?date=…); the path is what matters.
const SUITES: readonly Suite[] = [
  {
    name: 'district',
    routes: [
      '/district/61',
      '/district/61/changes',
      '/district/61/clubs',
      '/district/61/divisions',
      '/district/61/grid',
      '/district/61/trends',
      '/district/61/analytics',
      '/district/61/rankings',
      '/district/61/action-list',
    ],
    bar: '[data-testid="district-section-bar"]',
    subnav: '[data-testid="district-subnav"]',
    labels: ['Overview', 'Clubs', 'Divisions', 'Trends', 'More'],
    contentTopMax: 110,
    more: {
      from: '/district/61',
      links: [
        'What Changed',
        'Grid',
        'Map',
        'Analytics',
        'Rankings',
        'Action List',
      ],
      pick: 'Rankings',
      to: /\/district\/61\/rankings(\?|$)/,
      back: /\/district\/61(\?|$)/,
    },
    fallback: { path: '/district/61/clubs', active: 'Clubs' },
  },
  {
    name: 'clubs-world',
    routes: [
      '/clubs',
      '/clubs/race/distinguished',
      '/clubs/race/select',
      '/clubs/race/presidents',
      '/clubs/race/smedley',
    ],
    bar: '[data-testid="clubs-section-bar"]',
    subnav: '[data-testid="clubs-subnav"]',
    labels: ['Overview', 'Distinguished', 'Select', 'More'],
    contentTopMax: null,
    more: {
      from: '/clubs',
      links: ["President's", 'Smedley'],
      pick: 'Smedley',
      to: /\/clubs\/race\/smedley(\?|$)/,
      back: /\/clubs(\?|$)/,
    },
    fallback: { path: '/clubs/race/select', active: 'Select' },
  },
]

async function load(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready)
}

for (const s of SUITES) {
  const { bar: BAR, subnav: SUBNAV } = s
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [320, 375, 390]) {
      for (const path of s.routes) {
        test(`bottom bar on ${path} at ${width}px (${theme})`, async ({
          page,
        }) => {
          await page.emulateMedia({ colorScheme: theme })
          await page.setViewportSize({ width, height: 812 })
          await load(page, path)

          const m = await page.evaluate(
            ({ bar, subnav }) => {
              // sRGB contrast ratio of two `rgb(a)` strings (alpha ignored).
              // Inline: the preview's CSP forbids eval-style helpers.
              const lum = (s: string) => {
                const [r, g, b] = (s.match(/[\d.]+/g) ?? [])
                  .slice(0, 3)
                  .map(Number)
                  .map(v => {
                    const c = v / 255
                    return c <= 0.03928
                      ? c / 12.92
                      : Math.pow((c + 0.055) / 1.055, 2.4)
                  })
                return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
              }
              const ratio = (a: string, b: string) => {
                const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
                return (x! + 0.05) / (y! + 0.05)
              }
              const nav = document.querySelector(bar) as HTMLElement | null
              const rect = (el: Element | null) => {
                if (!el) return null
                const r = el.getBoundingClientRect()
                return {
                  top: Math.round(r.top),
                  bottom: Math.round(r.bottom),
                  left: Math.round(r.left),
                  right: Math.round(r.right),
                  width: Math.round(r.width),
                  height: Math.round(r.height),
                }
              }
              const items = nav
                ? Array.from(nav.querySelectorAll('a, button')).map(el => {
                    const label = el.querySelector('.section-bar__label')
                    return {
                      text: label?.textContent ?? '',
                      // Clipped/ellipsized label: content wider than its box.
                      clipped: label
                        ? label.scrollWidth > label.clientWidth + 0.5
                        : true,
                      box: rect(el),
                      label: rect(label),
                      labelPx: label
                        ? parseFloat(getComputedStyle(label).fontSize)
                        : 0,
                      contrast: label
                        ? ratio(
                            getComputedStyle(label).color,
                            getComputedStyle(nav).backgroundColor
                          )
                        : 0,
                    }
                  })
                : []
              const content = nav?.nextElementSibling ?? null
              return {
                bar: rect(nav),
                barPosition: nav ? getComputedStyle(nav).position : null,
                barBg: nav ? getComputedStyle(nav).backgroundColor : null,
                subnav: document.querySelector(subnav) !== null,
                items,
                contentTop: rect(content)?.top ?? null,
                docOverflow:
                  document.documentElement.scrollWidth - window.innerWidth,
                theme: document.documentElement.getAttribute('data-theme'),
              }
            },
            { bar: BAR, subnav: SUBNAV }
          )
          const ctx = JSON.stringify(m)

          expect(m.theme, ctx).toBe(theme)
          expect(m.subnav, ctx).toBe(false)
          expect(m.barPosition, ctx).toBe('fixed')
          expect(m.bar?.bottom, ctx).toBe(812)
          expect(m.bar?.height, ctx).toBe(56)
          expect(m.bar?.left, ctx).toBe(0)
          expect(m.bar?.width, ctx).toBe(width)
          expect(m.barBg, ctx).not.toBe('rgba(0, 0, 0, 0)')

          expect(
            m.items.map(i => i.text),
            ctx
          ).toEqual(s.labels)
          // Review §7: ≥8px between adjacent tap targets (#1832).
          for (let k = 1; k < m.items.length; k++) {
            expect(
              m.items[k]!.box!.left - m.items[k - 1]!.box!.right,
              ctx
            ).toBeGreaterThanOrEqual(8)
          }
          for (const i of m.items) {
            expect(i.clipped, ctx).toBe(false)
            expect(i.box!.left, ctx).toBeGreaterThanOrEqual(0)
            expect(i.box!.right, ctx).toBeLessThanOrEqual(width)
            expect(i.box!.width, ctx).toBeGreaterThanOrEqual(44)
            expect(i.box!.height, ctx).toBeGreaterThanOrEqual(44)
            // Label wholly inside its item and inside the bar (Lesson 134).
            expect(i.label!.left, ctx).toBeGreaterThanOrEqual(i.box!.left)
            expect(i.label!.right, ctx).toBeLessThanOrEqual(i.box!.right)
            expect(i.label!.bottom, ctx).toBeLessThanOrEqual(m.bar!.bottom)
            // Review §7: ≥14px; these are not uppercase eyebrows (#1832).
            expect(i.labelPx, ctx).toBeGreaterThanOrEqual(14)
            expect(i.contrast, ctx).toBeGreaterThanOrEqual(4.5)
          }

          // The accessible name is the visible label: the bold-width reserve
          // (label::after, alt text '') must not leak into it (WCAG 2.5.3).
          for (const name of s.labels.slice(0, -1)) {
            await expect(
              page.locator(BAR).getByRole('link', { name, exact: true }),
              name
            ).toHaveCount(1)
          }

          // Page content now starts under the context bar (where it exists).
          if (s.contentTopMax !== null) {
            expect(m.contentTop ?? 999, ctx).toBeLessThanOrEqual(
              s.contentTopMax
            )
          }
          expect(m.docOverflow, ctx).toBeLessThanOrEqual(0)

          // Nothing at the end of the page sits under the bar. `html` has
          // scroll-behavior: smooth (index.css), so scroll instantly and wait
          // until the page is at its end before measuring (WebKit animates).
          await page.evaluate(() =>
            window.scrollTo({
              top: document.documentElement.scrollHeight,
              behavior: 'instant',
            })
          )
          await page.waitForFunction(
            () =>
              Math.ceil(window.scrollY + window.innerHeight) >=
              document.documentElement.scrollHeight - 1
          )
          const end = await page.evaluate(bar => {
            const root = document
              .getElementById('root')!
              .getBoundingClientRect()
            const nav = document.querySelector(bar)!.getBoundingClientRect()
            return {
              rootBottom: Math.round(root.bottom),
              barTop: Math.round(nav.top),
            }
          }, BAR)
          expect(end.rootBottom, JSON.stringify(end)).toBeLessThanOrEqual(
            end.barTop
          )
        })
      }
    }
  }

  test(`${s.name}: More opens the shared sheet; a section is two taps and a real route`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await load(page, s.more.from)
    const more = page.locator(`${BAR} button`)
    await more.click()
    const sheet = page.getByRole('dialog', { name: 'More sections' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('link')).toHaveText([...s.more.links])
    await sheet.getByRole('link', { name: s.more.pick }).click()
    await expect(page).toHaveURL(s.more.to)
    await expect(sheet).toBeHidden()
    await expect(page.locator(`${BAR} button`)).toHaveAttribute(
      'data-active',
      'true'
    )
    // The back button returns to the hub (routes, not tabs).
    await page.goBack()
    await expect(page).toHaveURL(s.more.back)
    await expect(
      page.locator(BAR).getByRole('link', { name: 'Overview' })
    ).toHaveAttribute('aria-current', 'page')
  })

  for (const vp of [
    { width: 667, height: 375, name: 'landscape phone' },
    { width: 768, height: 1024, name: '768' },
    { width: 1280, height: 900, name: '1280' },
  ]) {
    test(`${s.name}: no bottom bar and the scroll-row is unchanged at ${vp.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await load(page, s.fallback.path)
      await expect(page.locator(BAR)).toHaveCount(0)
      await expect(page.locator(SUBNAV)).toBeVisible()
      await expect(
        page.locator(SUBNAV).getByRole('link', { name: s.fallback.active })
      ).toHaveAttribute('aria-current', 'page')
    })
  }
}
