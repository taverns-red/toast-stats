import { test, expect, type Page } from './fixtures/test'

/* Command palette, phone menu and sticky search follow the dialog pattern
 * (#2638, UX review CHR-05, CHR-06, CHR-11).
 *
 * - 360x640 with "About" expanded: the phone menu scrolls inside the
 *   viewport, so the last link and the version can be brought on screen.
 * - The palette keeps Tab inside, closes on Escape from anywhere, returns
 *   focus to the Search button and locks page scroll while open.
 * - At 375 the clubs sticky search sits at or below the context bar.
 *
 * Geometry is read with getBoundingClientRect (viewport-relative, Lesson
 * 138), not Playwright's document-relative boundingBox. */

async function load(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready)
}

/** Opening the palette fetches the club and division indexes, which have no
 *  recorded CDN fixture (#2545). These tests check the dialog, not search
 *  results, so an empty index is enough; a page-level route runs before the
 *  context-level fixture and keeps the fetch off the network. */
async function stubSearchIndexes(page: Page): Promise<void> {
  await page.route('**/config/club-index.json', route =>
    route.fulfill({ json: { clubs: {} } })
  )
  await page.route('**/config/divisions-areas-index.json', route =>
    route.fulfill({
      json: {
        generatedAt: '2026-11-12T00:00:00Z',
        snapshotDate: '2026-11-12',
        totalDivisions: 0,
        totalAreas: 0,
        districts: {},
      },
    })
  )
}

test.describe('phone menu at 360x640 (CHR-06)', () => {
  test.use({ viewport: { width: 360, height: 640 }, hasTouch: true })

  test('with About expanded, the version line scrolls into view', async ({
    page,
  }) => {
    await load(page, '/')
    await page.getByRole('button', { name: 'Open menu' }).click()
    await page.getByText('About', { exact: true }).click()
    const version = page.getByTestId('app-version')
    await version.scrollIntoViewIfNeeded()
    const rect = await version.evaluate(el => {
      const r = el.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, vh: window.innerHeight }
    })
    expect(rect.bottom).toBeLessThanOrEqual(rect.vh)
    expect(rect.top).toBeGreaterThanOrEqual(56)
  })

  test('Escape closes the menu and returns focus to its button', async ({
    page,
  }) => {
    await load(page, '/')
    const toggle = page.getByRole('button', { name: 'Open menu' })
    await toggle.click()
    await page.getByRole('link', { name: 'Awards' }).first().focus()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused()
  })
})

test.describe('command palette on a phone (CHR-05)', () => {
  test.use({
    viewport: { width: 375, height: 667 },
    hasTouch: true,
    isMobile: true,
  })

  test('Tab stays inside, Escape works from anywhere, focus returns', async ({
    page,
  }) => {
    await stubSearchIndexes(page)
    await load(page, '/')
    const search = page.getByRole('button', { name: 'Search', exact: true })
    await search.click()
    const dialog = page.getByRole('dialog', { name: 'Universal search' })
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByRole('button', { name: 'Close search' })
    ).toBeVisible()
    // Page scroll is locked while the palette is open.
    expect(
      await page.evaluate(() => getComputedStyle(document.body).overflow)
    ).toBe('hidden')
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab')
      expect(
        await page.evaluate(
          () => !!document.activeElement?.closest('[role="dialog"]')
        )
      ).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(
      page.getByRole('button', { name: 'Search', exact: true })
    ).toBeFocused()
    expect(
      await page.evaluate(() => getComputedStyle(document.body).overflow)
    ).not.toBe('hidden')
  })

  test('keyboard hints are hidden on touch', async ({ page }) => {
    await stubSearchIndexes(page)
    await load(page, '/')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page.locator('.command-palette__hint')).toBeHidden()
    await expect(page.locator('.command-palette__footer')).toBeHidden()
  })
})

test.describe('clubs sticky search at 375 (CHR-11)', () => {
  test.use({
    viewport: { width: 375, height: 667 },
    hasTouch: true,
    isMobile: true,
  })

  test('sits at or below the context bar, not under it', async ({ page }) => {
    await load(page, '/district/61/clubs')
    const search = page.locator('.clubs-mobile-sticky-search')
    await expect(search).toBeVisible({ timeout: 30_000 })
    await page.evaluate(() => window.scrollBy(0, 600))
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0)
    const m = await page.evaluate(() => {
      const bar = document.querySelector('.context-bar')
      const s = document.querySelector('.clubs-mobile-sticky-search')
      if (!bar || !s) return null
      return {
        barBottom: bar.getBoundingClientRect().bottom,
        searchTop: s.getBoundingClientRect().top,
      }
    })
    expect(m).not.toBeNull()
    expect(m!.searchTop).toBeGreaterThanOrEqual(m!.barBottom - 0.5)
  })
})
