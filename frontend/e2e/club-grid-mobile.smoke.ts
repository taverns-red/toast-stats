import { test, expect, type Page } from './fixtures/test'

/* Club grid on phones (#1845, mobile epic #1827 Phase 2, review §2 S8 /
 * §7 item 18).
 *
 * At 375 the grid's 160-odd tiles used to reveal the club name only through
 * `title=` (hover, which a phone does not have). Now a tile is a button that
 * opens the shared BottomSheet with the full name, status and a link to the
 * club page. Measured on the deployed preview (BASE_URL) by bounding box and
 * computed style (Lesson 134), with the `body{overflow-x:hidden}` mask off:
 *
 *  - 0 visible `[title]` elements in the grid (title-only tooltips; the
 *    app-shell search button's title is site-wide chrome with an aria-label),
 *  - every tile ≥ 44×44 px, legend chips (swatch + label) ≥ 14 px,
 *  - tapping a tile opens a dialog named by the club, with a club-page link,
 *  - zero document horizontal overflow.
 *
 * At 1280 the tile stays a link to the club page (desktop unchanged). */

const GRID = '/district/61/grid'
const TILE = '.club-grid-tile'

async function load(page: Page): Promise<void> {
  await page.goto(GRID, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.locator(TILE).first().waitFor({ timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready)
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`club grid at 375 (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize({ width: 375, height: 812 })
      await load(page)
      await page.addStyleTag({
        content: 'html,body{overflow-x:visible !important}',
      })
    })

    test('no title-only tooltips, 44px tiles, 14px legend, no overflow', async ({
      page,
    }) => {
      const m = await page.evaluate(tileSel => {
        const visible = (el: Element) => {
          const r = el.getBoundingClientRect()
          return r.width > 0 && r.height > 0
        }
        const tiles = Array.from(document.querySelectorAll(tileSel)).filter(
          visible
        )
        const px = (el: Element) => parseFloat(getComputedStyle(el).fontSize)
        return {
          titled: Array.from(
            document.querySelectorAll('.club-grid-page [title]')
          )
            .filter(visible)
            .map(el => el.outerHTML.slice(0, 120)),
          tileCount: tiles.length,
          smallTiles: tiles
            .map(t => t.getBoundingClientRect())
            .filter(r => r.width < 44 || r.height < 44).length,
          tileTags: [...new Set(tiles.map(t => t.tagName))],
          legendPx: Array.from(
            document.querySelectorAll(
              '.club-grid-legend__swatch, .club-grid-legend__label'
            )
          ).map(px),
          overflow:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        }
      }, TILE)

      expect(m.tileCount).toBeGreaterThan(0)
      expect(m.titled).toEqual([])
      expect(m.smallTiles).toBe(0)
      expect(m.tileTags).toEqual(['BUTTON'])
      expect(m.legendPx.length).toBeGreaterThan(0)
      expect(Math.min(...m.legendPx)).toBeGreaterThanOrEqual(14)
      expect(m.overflow).toBeLessThanOrEqual(0)
    })

    test('tapping a tile opens a sheet with the club name and link', async ({
      page,
    }) => {
      const tile = page.locator(TILE).first()
      const name = (
        await tile.locator('.club-grid-tile__name').textContent()
      )?.trim()
      expect(name).toBeTruthy()
      await tile.click()
      const dialog = page.getByRole('dialog', { name: name! })
      await expect(dialog).toBeVisible()
      const link = dialog.getByRole('link', { name: /open club page/i })
      await expect(link).toHaveAttribute('href', /\/district\/61\/club\/\w+/)
      const box = await link.boundingBox()
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
      // Privacy: nothing that looks like contact or meeting details.
      const text = (await dialog.textContent()) ?? ''
      expect(text).not.toMatch(/@|https?:\/\/|passcode|zoom\.us/i)
      await dialog.getByRole('button', { name: /close/i }).click()
      await expect(dialog).toBeHidden()
    })
  })
}

test('club grid at 1280 keeps tiles as links (desktop unchanged)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await load(page)
  const tags = await page
    .locator(TILE)
    .evaluateAll(els => [...new Set(els.map(e => e.tagName))])
  expect(tags).toEqual(['A'])
})
