import { test, expect, type Page } from '@playwright/test'

/* Phone divisions page as collapsed division rows (#1844, mobile epic #1827
 * Phase 2, review §3 "divisions" row, §7 target "divisions page height").
 *
 * The review measured /district/61/divisions at 28,083 px (34.6 screens) at
 * 375: eight division cards, each with a 9-column area table scrolling 731 px
 * inside 261 px, and "Gap: N/A N/A N/A" rows. Below 768 the page is now one
 * MobileRowList row per division (#1861) linking to the routed division page,
 * and the Division and Area Progress Summary collapses per division with its
 * open set in `?summary=` (#1862). This smoke pins the page-level contract:
 *
 * - one 56–64 px row per division, chip whole and inside the row, ≥14 px
 *   text, linking to `/district/61/division/<id>`;
 * - no area table anywhere (the only tables left are the static criteria
 *   references), no "N/A N/A N/A";
 * - page ≤ 6,000 px at 375 and 390, zero document overflow with the
 *   `body{overflow-x:hidden}` mask disabled, light and dark;
 * - progress-summary divisions start collapsed and round-trip via the URL.
 *
 * 768 and 1280 keep the desktop division cards. The page height is attached
 * as a `page-height` annotation so a PR can quote it from the report. */

const DIVISIONS = '/district/61/divisions'
const LIST = 'ul[aria-label="Divisions"]'
const ROW = `${LIST} [data-testid="mobile-row"]`
const CARDS = '[role="region"][aria-label="Division performance cards"]'

/** Review §7 target for the divisions page at 375. */
const HEIGHT_MAX = 6_000

async function load(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator(ROW).first()).toBeVisible()
}

interface Geometry {
  width: number
  docHeight: number
  docOverflow: number
  theme: string | null
  areaTables: number
  naRuns: number
  rows: {
    label: string | null
    href: string | null
    left: number
    right: number
    height: number
    titlePx: number
    metaPx: number
    chipInside: boolean
    chipClipped: boolean
  }[]
}

/** Page and row geometry with the overflow mask off (Lesson 134). */
async function measure(page: Page): Promise<Geometry> {
  await page.addStyleTag({
    content: 'html,body{overflow-x:visible !important}',
  })
  return page.evaluate(rowSel => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }
    const px = (el: Element | null) =>
      el ? parseFloat(getComputedStyle(el).fontSize) : 0
    return {
      width: window.innerWidth,
      docHeight: document.documentElement.scrollHeight,
      docOverflow: document.documentElement.scrollWidth - window.innerWidth,
      theme: document.documentElement.getAttribute('data-theme'),
      // Any visible table other than the static criteria references (the DDP
      // explainer and the division/area "recognition level requirements"
      // tables) is an inline area table the phone layout must not render.
      areaTables: Array.from(document.querySelectorAll('table'))
        .filter(visible)
        .filter(t => !t.closest('.ddp-criteria'))
        .filter(
          t => !/level requirements$/.test(t.getAttribute('aria-label') ?? '')
        ).length,
      naRuns: (document.body.innerText.match(/N\/A\s+N\/A\s+N\/A/g) ?? [])
        .length,
      rows: Array.from(document.querySelectorAll(rowSel))
        .filter(visible)
        .map(row => {
          const r = row.getBoundingClientRect()
          const chip = row.querySelector('.mobile-row__chip')
          const c = chip?.getBoundingClientRect()
          return {
            label: row.getAttribute('aria-label'),
            href: row.getAttribute('href'),
            left: Math.round(r.left),
            right: Math.round(r.right),
            height: Math.round(r.height),
            titlePx: px(row.querySelector('.mobile-row__title')),
            metaPx: px(row.querySelector('.mobile-row__meta')),
            chipInside: c
              ? c.left >= r.left - 0.5 &&
                c.right <= r.right + 0.5 &&
                c.top >= r.top - 0.5 &&
                c.bottom <= r.bottom + 0.5
              : false,
            chipClipped: chip
              ? Array.from(chip.querySelectorAll('*'))
                  .concat(chip)
                  .some(el => el.scrollWidth > el.clientWidth + 0.5)
              : true,
          }
        }),
    }
  }, ROW)
}

function record(height: number, label: string): void {
  test.info().annotations.push({
    type: 'page-height',
    description: `${label}: ${height}px`,
  })
}

for (const theme of ['light', 'dark'] as const) {
  for (const [width, height] of [
    [375, 812],
    [390, 844],
  ] as const) {
    test(`divisions at ${width} (${theme}): one collapsed row per division, no area tables`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize({ width, height })
      await load(page, DIVISIONS)
      await expect(page.locator(CARDS)).toHaveCount(0)

      const g = await measure(page)
      const ctx = JSON.stringify({ ...g, rows: g.rows.slice(0, 3) })
      expect(g.theme, ctx).toBe(theme)
      expect(g.docOverflow, ctx).toBeLessThanOrEqual(0)
      expect(g.docHeight, ctx).toBeLessThanOrEqual(HEIGHT_MAX)
      expect(g.areaTables, ctx).toBe(0)
      expect(g.naRuns, ctx).toBe(0)
      // Districts carry 6–9 divisions (prod 2026-10: D61 has 8).
      expect(g.rows.length, ctx).toBeGreaterThanOrEqual(6)
      for (const r of g.rows) {
        const rc = JSON.stringify(r)
        expect(r.height, rc).toBeGreaterThanOrEqual(56)
        expect(r.height, rc).toBeLessThanOrEqual(64)
        expect(r.left, rc).toBeGreaterThanOrEqual(0)
        expect(r.right, rc).toBeLessThanOrEqual(g.width)
        expect(r.chipInside, rc).toBe(true)
        expect(r.chipClipped, rc).toBe(false)
        expect(r.titlePx, rc).toBeGreaterThanOrEqual(14)
        expect(r.metaPx, rc).toBeGreaterThanOrEqual(14)
        expect(r.href, rc).toMatch(/^\/district\/61\/division\/[A-Z0-9]+$/)
        // Collapsed row content: name, status, paid/base, distinguished.
        expect(r.label, rc).toMatch(
          /^Division [A-Z0-9]+ — .+, \d+\/\d+ paid, .+\d+\/\d+ distinguished$/
        )
      }
      record(g.docHeight, `${theme} ${width}`)
    })
  }
}

test('divisions at 375: progress summary starts collapsed and round-trips ?summary=', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await load(page, DIVISIONS)
  const toggles = page.locator('.progress-summary-mobile button[aria-expanded]')
  const n = await toggles.count()
  expect(n).toBeGreaterThanOrEqual(6)
  for (let i = 0; i < n; i++) {
    await expect(toggles.nth(i)).toHaveAttribute('aria-expanded', 'false')
    const box = await toggles.nth(i).boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  }

  await toggles.first().click()
  await expect(toggles.first()).toHaveAttribute('aria-expanded', 'true')
  await expect(page).toHaveURL(/[?&]summary=[^&]+/)
  const open = new URL(page.url()).searchParams.get('summary')
  // Opening a division shows its narrative, never an area table.
  expect((await measure(page)).areaTables).toBe(0)

  await load(page, page.url())
  expect(new URL(page.url()).searchParams.get('summary')).toBe(open)
  await expect(
    page.locator('.progress-summary-mobile button[aria-expanded]').first()
  ).toHaveAttribute('aria-expanded', 'true')
})

test('divisions at 375: a row opens the routed division page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await load(page, DIVISIONS)
  const first = page.locator(ROW).first()
  const href = await first.getAttribute('href')
  await first.click()
  await expect(page).toHaveURL(new RegExp(`${href}(\\?.*)?$`))
})

for (const width of [768, 1280]) {
  test(`divisions at ${width}px keep the desktop division cards`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(DIVISIONS, { waitUntil: 'networkidle', timeout: 60_000 })
    await expect(page.locator(CARDS)).toBeVisible()
    await expect(page.locator(ROW)).toHaveCount(0)
  })
}
