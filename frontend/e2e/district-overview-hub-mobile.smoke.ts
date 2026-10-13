import { test, expect, type Page } from './fixtures/test'

/* District Overview hub on a phone (#1842, mobile epic #1827 Phase 2,
 * review §5.5).
 *
 * ── The regression this guards ───────────────────────────────────────────
 * Below 768 the Overview opened on the desktop KPI strip: 860px tall at 375,
 * a 44px collapse-toggle column squeezing the 2-up cards, 8 numbers and an
 * info tooltip per card, and the "how is the district doing" narrative 1.6
 * screens down (prod sweep 2.48.0, 2026-10-12). The hub replaces it with
 * 2×2 tiles (number · delta · rank), a "Needs attention" block and the
 * sections as rows, so the first screen answers the question.
 *
 * ── Method ───────────────────────────────────────────────────────────────
 * Deployed preview (BASE_URL), real data, bounding boxes (Lesson 134):
 *  - the tile block fits a height budget and is two equal columns that start
 *    at the hub's own left edge (no side toggle column);
 *  - the Needs-attention block ends above the bottom section bar on the first
 *    screen;
 *  - the page is ≤ 4,000px and has no info tooltips inside the hub;
 *  - landscape phones get the tiles 4×1; 1280 keeps the desktop strip.
 */

const PHONE = { width: 375, height: 812 }
const SECTION_BAR_H = 56
const TILE_BLOCK_MAX_H = 300
const PAGE_MAX_H = 4000

async function loadHub(page: Page, path = '/district/61'): Promise<void> {
  await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
  await page
    .locator('[data-testid="district-hub-mobile"]:not(.district-hub--loading)')
    .waitFor({ state: 'visible', timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await page.waitForTimeout(500)
}

for (const scheme of ['light', 'dark'] as const) {
  test(`first screen at 375 is the hub, not the KPI strip (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize(PHONE)
    await loadHub(page)

    const m = await page.evaluate(() => {
      const box = (el: Element | null) => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        return {
          top: Math.round(r.top + window.scrollY),
          bottom: Math.round(r.bottom + window.scrollY),
          left: Math.round(r.left),
          width: Math.round(r.width),
          height: Math.round(r.height),
        }
      }
      const hub = document.querySelector('[data-testid="district-hub-mobile"]')
      const tiles = [
        ...document.querySelectorAll('[data-testid="district-hub-tile"]'),
      ].map(box)
      return {
        strip: !!document.querySelector('.district-kpi-strip'),
        hub: box(hub),
        tileBlock: box(
          document.querySelector('[data-testid="district-hub-tiles"]')
        ),
        tiles,
        attention: box(
          document.querySelector('[data-testid="district-hub-attention"]')
        ),
        infoButtons: hub
          ? hub.querySelectorAll('button[aria-label="More info"]').length
          : -1,
        // Visible h2 texts outside the hub, in page order (#1842 follow-up).
        h2s: [...document.querySelectorAll('h2')]
          .filter(
            h => !hub?.contains(h) && h.getBoundingClientRect().height > 0
          )
          .map(h => h.textContent?.trim() ?? ''),
        // Section rows (#1794): compact single-line nav links, still ≥44px.
        sectionRowHeights: [
          ...document.querySelectorAll(
            '[data-testid="district-hub-sections"] .mobile-row'
          ),
        ].map(r => Math.round(r.getBoundingClientRect().height)),
        pageH: document.documentElement.scrollHeight,
        overflowX: document.documentElement.scrollWidth - window.innerWidth,
      }
    })
    const msg = JSON.stringify(m)

    expect(m.strip, msg).toBe(false)
    expect(m.hub, msg).not.toBeNull()
    expect(m.tiles, msg).toHaveLength(4)
    // 2×2: two distinct columns, two distinct rows, equal widths.
    const lefts = new Set(m.tiles.map(t => t!.left))
    const tops = new Set(m.tiles.map(t => t!.top))
    expect(lefts.size, msg).toBe(2)
    expect(tops.size, msg).toBe(2)
    const widths = m.tiles.map(t => t!.width)
    expect(Math.max(...widths) - Math.min(...widths), msg).toBeLessThanOrEqual(
      1
    )
    // No side column: the first tile starts at the hub's left edge (the old
    // strip lost ~56px to its toggle).
    expect(Math.min(...lefts) - m.hub!.left, msg).toBeLessThanOrEqual(1)
    expect(Math.min(...widths), msg).toBeGreaterThanOrEqual(150)
    // Height budget for the KPI block (was 860px).
    expect(m.tileBlock!.height, msg).toBeLessThanOrEqual(TILE_BLOCK_MAX_H)
    // Needs attention is on the first screen, above the section bar.
    expect(m.attention!.bottom, msg).toBeLessThanOrEqual(
      PHONE.height - SECTION_BAR_H
    )
    expect(m.infoButtons, msg).toBe(0)
    // The hub IS the overview: no "Overview" heading stranded below its
    // section rows; the panel after it is titled for what it is.
    expect(m.h2s, msg).not.toContain('Overview')
    expect(m.h2s[0], msg).toBe('Details')
    expect(m.sectionRowHeights.length, msg).toBeGreaterThan(0)
    expect(Math.min(...m.sectionRowHeights), msg).toBeGreaterThanOrEqual(44)
    // Compact rows are what keep the hub inside its page budget; local macOS
    // fonts leave ~30px of headroom that CI Linux does not, so pin the row
    // height too or a dead override passes here and fails only in CI.
    expect(Math.max(...m.sectionRowHeights), msg).toBeLessThanOrEqual(48)
    expect(m.pageH, msg).toBeLessThanOrEqual(PAGE_MAX_H)
    expect(m.overflowX, msg).toBeLessThanOrEqual(0)
  })
}

test('a tile opens its detail sheet', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await loadHub(page)
  await page.locator('[data-testid="district-hub-tile"]').first().click()
  const sheet = page.getByRole('dialog', { name: 'Paid Clubs' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('progressbar')).toBeVisible()
})

test('landscape phone lays the tiles out 4×1', async ({ page }) => {
  await page.setViewportSize({ width: 812, height: 375 })
  await loadHub(page)
  const tops = await page
    .locator('[data-testid="district-hub-tile"]')
    .evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)))
  expect(tops).toHaveLength(4)
  expect(new Set(tops).size, JSON.stringify(tops)).toBe(1)
})

test('1280 keeps the desktop KPI strip and has no hub', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/district/61', { waitUntil: 'networkidle', timeout: 60_000 })
  await page
    .locator('.district-kpi-strip:not(.district-kpi-strip--loading)')
    .waitFor({ state: 'visible', timeout: 30_000 })
  expect(
    await page.locator('[data-testid="district-hub-mobile"]').count()
  ).toBe(0)
})
