import {
  test,
  expect,
  devices,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test'

/* Safe-area and landscape (#1847, mobile epic #1827, review S11 / §4.2 / §7
 * item 20).
 *
 * `viewport-fit=cover` makes env(safe-area-inset-*) real, so the app must pad
 * its own edges: the top bar past the notch, the bottom section bar and
 * every sheet past the home indicator. Chromium emulates the insets through
 * CDP (`Emulation.setSafeAreaInsetsOverride`), so there the bars are measured
 * against iPhone-shaped insets; WebKit cannot inject insets, so it runs the
 * same geometry at inset 0 (the layout must hold either way).
 *
 * Landscape phones (812 × 375 and the iPhone landscape profiles) get the
 * phone chrome: the 44px context bar instead of the desktop header stack, a
 * top bar that scrolls away, and first data ≤ 200px from the top (it was
 * 326px on the Overview hub and 700px on Clubs).
 *
 * Everything is measured by bounding box on the deployed preview (BASE_URL),
 * light and dark (Lesson 134).
 */

interface Insets {
  top: number
  bottom: number
  left: number
  right: number
}

interface Profile {
  name: string
  viewport: { width: number; height: number }
  ua: string
  insets: Insets
}

const { defaultBrowserType: _p, ...IPHONE_14 } = devices['iPhone 14']
const { defaultBrowserType: _l, ...IPHONE_15_PM_L } =
  devices['iPhone 15 Pro Max landscape']

// iPhone 14/15 class insets: 47 status/notch, 34 home indicator upright;
// 47 each side and 21 home indicator on its side.
const PORTRAIT: Insets = { top: 47, bottom: 34, left: 0, right: 0 }
const LANDSCAPE: Insets = { top: 0, bottom: 21, left: 47, right: 47 }

const PORTRAIT_PROFILES: readonly Profile[] = [
  {
    name: 'iPhone 14',
    viewport: IPHONE_14.viewport,
    ua: IPHONE_14.userAgent,
    insets: PORTRAIT,
  },
  {
    name: '375x812',
    viewport: { width: 375, height: 812 },
    ua: IPHONE_14.userAgent,
    insets: PORTRAIT,
  },
]

const LANDSCAPE_PROFILES: readonly Profile[] = [
  {
    name: '812x375',
    viewport: { width: 812, height: 375 },
    ua: IPHONE_14.userAgent,
    insets: LANDSCAPE,
  },
  {
    name: 'iPhone 15 Pro Max landscape',
    viewport: IPHONE_15_PM_L.viewport,
    ua: IPHONE_15_PM_L.userAgent,
    insets: LANDSCAPE,
  },
  {
    name: 'iPhone 14 landscape',
    viewport: devices['iPhone 14 landscape'].viewport,
    ua: IPHONE_14.userAgent,
    insets: LANDSCAPE,
  },
]

/** Routes with a first-data element, and how to find it. */
const LANDSCAPE_ROUTES = [
  { path: '/district/61', firstData: '.district-hub__tile' },
  {
    path: '/district/61/clubs',
    firstData:
      '[data-testid="mobile-row-list"] li, .mobile-row-list li, table tbody tr',
  },
] as const

const FIRST_DATA_MAX = 200

async function open(
  browser: Browser,
  browserName: string,
  p: Profile,
  theme: 'light' | 'dark'
): Promise<{ ctx: BrowserContext; page: Page; insets: Insets }> {
  const ctx = await browser.newContext({
    viewport: p.viewport,
    userAgent: p.ua,
    deviceScaleFactor: 2,
    hasTouch: true,
    // Firefox has no isMobile; the smoke projects are Chromium + WebKit.
    isMobile: browserName === 'chromium',
    colorScheme: theme,
  })
  const page = await ctx.newPage()
  let insets: Insets = { top: 0, bottom: 0, left: 0, right: 0 }
  if (browserName === 'chromium') {
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Emulation.setSafeAreaInsetsOverride', {
      insets: p.insets,
    })
    insets = p.insets
  }
  return { ctx, page, insets }
}

async function load(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready)
}

type Box = { top: number; bottom: number; left: number; right: number }

async function boxOf(page: Page, selector: string): Promise<Box | null> {
  return page.evaluate(s => {
    const el = Array.from(document.querySelectorAll(s)).find(
      e => e.getBoundingClientRect().height > 0
    )
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
  }, selector)
}

test('the viewport opts in to safe-area insets (viewport-fit=cover)', async ({
  page,
}) => {
  await load(page, '/district/61')
  const content = await page
    .locator('meta[name="viewport"]')
    .getAttribute('content')
  expect(content).toMatch(/viewport-fit=cover/)
})

for (const theme of ['light', 'dark'] as const) {
  for (const p of PORTRAIT_PROFILES) {
    test(`portrait ${p.name} (${theme}): bars and sheet clear the notch and home indicator`, async ({
      browser,
      browserName,
    }) => {
      const { ctx, page, insets } = await open(browser, browserName, p, theme)
      try {
        await load(page, '/district/61')
        const vh = await page.evaluate(() => window.innerHeight)

        // Top bar content starts below the status bar / notch.
        const brand = await boxOf(page, '.app-shell-brand')
        expect(brand, 'top bar brand').not.toBeNull()
        expect(brand!.top).toBeGreaterThanOrEqual(insets.top)

        // Bottom bar: flush with the bottom edge, every tap target above
        // the home indicator.
        const bar = await boxOf(page, '[data-testid="district-section-bar"]')
        expect(bar, 'section bar').not.toBeNull()
        expect(Math.abs(bar!.bottom - vh)).toBeLessThanOrEqual(1)
        const linkBottoms = await page
          .locator('[data-testid="district-section-bar"] .section-bar__link')
          .evaluateAll(els => els.map(e => e.getBoundingClientRect().bottom))
        expect(linkBottoms.length).toBeGreaterThanOrEqual(5)
        for (const b of linkBottoms)
          expect(b).toBeLessThanOrEqual(vh - insets.bottom + 0.5)

        // More sheet: inside the visible viewport, last row above the
        // home indicator.
        await page
          .locator('[data-testid="district-section-bar"] button')
          .click()
        const sheet = page.getByRole('dialog', { name: 'More sections' })
        await expect(sheet).toBeVisible()
        const s = await sheet.evaluate(d => {
          const panel = d.closest('.bottom-sheet') ?? d
          const r = panel.getBoundingClientRect()
          const links = d.querySelectorAll('a')
          const last = links[links.length - 1]!.getBoundingClientRect()
          return { top: r.top, bottom: r.bottom, lastBottom: last.bottom }
        })
        expect(s.top).toBeGreaterThanOrEqual(0)
        expect(s.bottom).toBeLessThanOrEqual(vh + 0.5)
        expect(s.lastBottom).toBeLessThanOrEqual(vh - insets.bottom + 0.5)
      } finally {
        await ctx.close()
      }
    })
  }

  for (const p of LANDSCAPE_PROFILES) {
    for (const r of LANDSCAPE_ROUTES) {
      test(`landscape ${p.name} ${r.path} (${theme}): phone chrome, clear of the notch, first data ≤ ${FIRST_DATA_MAX}px`, async ({
        browser,
        browserName,
      }) => {
        const { ctx, page, insets } = await open(browser, browserName, p, theme)
        try {
          await load(page, r.path)
          const { vw, vh, scrollW } = await page.evaluate(() => ({
            vw: window.innerWidth,
            vh: window.innerHeight,
            scrollW: document.documentElement.scrollWidth,
          }))
          expect(scrollW, 'horizontal overflow').toBeLessThanOrEqual(vw)

          // The phone context bar replaces the desktop header stack.
          const ctxBar = page.locator('[data-testid="context-bar"]')
          await expect(ctxBar).toBeVisible()
          await expect(
            page.locator('[data-testid="district-detail-lede"]')
          ).toBeHidden()

          const first = await boxOf(page, r.firstData)
          expect(first, `first data (${r.firstData})`).not.toBeNull()
          expect(first!.top).toBeLessThanOrEqual(FIRST_DATA_MAX)

          // Nothing the user reads or taps sits under the side notches.
          for (const sel of [
            '.app-shell-brand',
            '[data-testid="context-bar-back"]',
            '[data-testid="context-bar-chip"]',
            r.firstData,
          ]) {
            const b = await boxOf(page, sel)
            if (!b) continue
            expect(b.left, `${sel} left`).toBeGreaterThanOrEqual(
              insets.left - 0.5
            )
            expect(b.right, `${sel} right`).toBeLessThanOrEqual(
              vw - insets.right + 0.5
            )
          }

          // The top bar scrolls away; only the 44px context bar sticks.
          await page.evaluate(() => window.scrollTo(0, 400))
          await page.waitForTimeout(100)
          const stuck = await boxOf(page, '[data-testid="context-bar"]')
          const top = await boxOf(page, '.app-shell-top-bar')
          expect(top!.bottom).toBeLessThanOrEqual(insets.top + 0.5)
          expect(Math.abs(stuck!.top - insets.top)).toBeLessThanOrEqual(1)
          await page.evaluate(() => window.scrollTo(0, 0))

          // The context sheet fits the visible viewport, clear of the
          // notches and the home indicator.
          await page.locator('[data-testid="context-bar-chip"]:visible').click()
          const sheet = page.getByRole('dialog').first()
          await expect(sheet).toBeVisible()
          const s = await sheet.evaluate(d => {
            const panel = d.closest('.bottom-sheet') ?? d
            const r = panel.getBoundingClientRect()
            const cs = getComputedStyle(panel)
            return {
              top: r.top,
              bottom: r.bottom,
              padL: parseFloat(cs.paddingLeft),
              padR: parseFloat(cs.paddingRight),
              padB: parseFloat(cs.paddingBottom),
            }
          })
          expect(s.top).toBeGreaterThanOrEqual(0)
          expect(s.bottom).toBeLessThanOrEqual(vh + 0.5)
          expect(s.padL).toBeGreaterThanOrEqual(insets.left)
          expect(s.padR).toBeGreaterThanOrEqual(insets.right)
          expect(s.padB).toBeGreaterThanOrEqual(insets.bottom)
        } finally {
          await ctx.close()
        }
      })
    }
  }
}
