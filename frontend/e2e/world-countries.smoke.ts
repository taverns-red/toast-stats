import { test, expect, type Page } from './fixtures/test'

/* Worldwide country choropleth (#1797) on /history/countries, against the
 * deployed preview and its real staging data. At 375 and 1280, light and
 * dark:
 *   - the map draws (the US is in the top bin) inside the viewport with no
 *     sideways page scroll, and the Unknown clubs are stated;
 *   - the sea follows the theme;
 *   - tapping a country fills the readout and writes ?country=<ISO>;
 *   - 375: the table shows the top ten + Unknown, and "All N countries"
 *     opens the sheet; picking a country there closes it and selects it;
 *   - 1280: the ranked table sits beside the map;
 *   - no console error (a CSP block surfaces there). */

const THEMES = ['light', 'dark'] as const
const SEA = { light: 'rgb(217, 214, 208)', dark: 'rgb(30, 42, 51)' }

async function open(page: Page, theme: (typeof THEMES)[number], url: string) {
  await page.addInitScript(t => {
    window.localStorage.setItem('theme', t as string)
  }, theme)
  await page.goto(url)
  await page
    .locator('path[data-iso="840"]')
    .waitFor({ state: 'attached', timeout: 30_000 })
}

for (const theme of THEMES) {
  for (const width of [375, 1280]) {
    test(`country map at ${width}px (${theme})`, async ({ page }) => {
      const errors: string[] = []
      page.on('console', m => {
        if (m.type() === 'error') errors.push(m.text())
      })
      await page.setViewportSize({ width, height: width === 375 ? 812 : 900 })
      await open(page, theme, '/history/countries')

      // The map is drawn and coloured from real data.
      await expect(page.locator('path[data-iso="840"]')).toHaveAttribute(
        'data-bin',
        '4'
      )
      await expect(page.getByTestId('wm-summary')).toContainText(
        /not matched to a country/
      )
      await expect(page.getByTestId('wm-row-unknown')).toBeVisible()

      // Theme-aware sea.
      const sea = await page
        .locator('.wm-map__frame')
        .evaluate(el => getComputedStyle(el).backgroundColor)
      expect(sea).toBe(SEA[theme])

      // Fits the viewport: no sideways page scroll, map within the width.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      )
      expect(overflow).toBeLessThanOrEqual(0)
      const map = await page.locator('svg.wm-map__svg').boundingBox()
      expect(map).not.toBeNull()
      expect(map!.x).toBeGreaterThanOrEqual(0)
      expect(map!.x + map!.width).toBeLessThanOrEqual(width)

      // Tap/click a country: readout + URL.
      await page.locator('path[data-iso="356"]').click()
      await expect(page.getByTestId('wm-readout')).toContainText('India')
      await expect(page).toHaveURL(/[?&]country=356\b/)

      if (width === 375) {
        const rows = page.locator('.wm-layout__list table tbody tr')
        await expect(rows).toHaveCount(11)
        await page.getByRole('button', { name: /^All \d+ countries$/ }).click()
        const sheet = page.getByRole('dialog')
        await expect(sheet).toBeVisible()
        await sheet
          .getByRole('button', { name: 'Show Canada on the map' })
          .click()
        await expect(sheet).toBeHidden()
        await expect(page).toHaveURL(/[?&]country=124\b/)
        await expect(page.getByTestId('wm-readout')).toContainText('Canada')
      } else {
        const list = await page.locator('.wm-layout__list').boundingBox()
        expect(list!.x).toBeGreaterThan(map!.x + map!.width - 1)
        // Keyboard path: the table's country buttons select on the map.
        await page
          .getByRole('button', { name: 'Show Canada on the map' })
          .focus()
        await page.keyboard.press('Enter')
        await expect(page).toHaveURL(/[?&]country=124\b/)
      }

      expect(errors).toEqual([])
    })
  }
}
