import { test, expect } from './fixtures/test'

/* Officer training on the top-level Regions page (#2330).
 *
 * /regions shows each region's Round 1 / Round 2 officer training (4+ and
 * all seven) in the leaderboard and a world figure for reference, from the
 * date's region-rollups.json. Guards, on the deployed build (BASE_URL) with
 * live data, at phone, tablet and desktop widths in both themes:
 * - the world reference renders (figures, "not started" or "not available",
 *   never an empty box);
 * - each region's training figure links to /region/:n/training;
 * - no horizontal page scroll (the ≥768 table scrolls inside its own
 *   labelled region, #689).
 * Phones show two chosen columns (#1834); the URL picks the one training
 * column (the current round, 4+ over all seven). On phones the world line sits
 * below the table (375 first-content budget). */

const THEMES = ['light', 'dark'] as const
const WIDTHS = [320, 375, 390, 768, 1280]

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    test(`regions officer training at ${width}px (${theme})`, async ({
      page,
    }) => {
      test.setTimeout(90_000)
      await page.addInitScript(t => {
        try {
          localStorage.setItem('theme', t)
        } catch {
          // storage blocked: the theme falls back to prefers-color-scheme
        }
      }, theme)
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize({ width, height: 900 })
      const phone = width < 768
      await page.goto(phone ? '/regions?cols=training,score' : '/regions', {
        waitUntil: 'networkidle',
        timeout: 60_000,
      })

      const world = page.getByTestId('regions-training-world')
      await world.waitFor({ state: 'visible', timeout: 30_000 })
      await expect(world).toContainText(
        /World officer training (—|is not available)/
      )

      const table = page.locator('table[aria-label="Region rankings"]').first()
      await table.waitFor({ state: 'visible', timeout: 30_000 })
      if (phone) {
        await expect(table.locator('thead')).toContainText('Training')
      } else {
        await expect(table.locator('thead')).toContainText('Round 1 training')
        await expect(table.locator('thead')).toContainText('Round 2 training')
      }

      // Each region's figure links to its Training page — unless the date
      // carries no figures, which must then say so in words.
      const links = table.locator('a[href^="/region/"][href*="/training"]')
      const unavailable = table.getByText('not available')
      const count = await links.count()
      if (count === 0) {
        expect(await unavailable.count()).toBeGreaterThan(0)
      } else {
        expect(count).toBeGreaterThanOrEqual(14)
        await expect(links.first()).toHaveText(/^\d+%/)
      }

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(
        scrollWidth,
        `page scrolls sideways at ${width}px (${theme})`
      ).toBeLessThanOrEqual(clientWidth)

      if (count > 0 && width === 1280 && theme === 'light') {
        await links.first().click()
        await expect(page).toHaveURL(/\/region\/\d{2}\/training/)
        await page
          .locator('[data-testid="region-training-table"]')
          .waitFor({ timeout: 30_000 })
      }
    })
  }
}

/* The leaderboard fits its container at desktop widths (#2330 review): the
 * training columns once pushed the table past its scroller at 1280, clipping
 * the Round 2 "All 7" header. At 1024 and 1280 the whole table — every
 * header cell — must be visible without scrolling the table sideways, and
 * the right-edge "more" fade must not sit over the last column. */
for (const theme of THEMES) {
  for (const width of [1024, 1280]) {
    test(`regions leaderboard fits without side-scroll at ${width}px (${theme})`, async ({
      page,
    }) => {
      test.setTimeout(90_000)
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/regions', { waitUntil: 'networkidle', timeout: 60_000 })
      const table = page.locator('table[aria-label="Region rankings"]').first()
      await table.waitFor({ state: 'visible', timeout: 30_000 })
      await page.evaluate(() => document.fonts.ready)

      const m = await table.evaluate(t => {
        const box = (t.parentElement as HTMLElement).getBoundingClientRect()
        const scroller = t.parentElement as HTMLElement
        return {
          tableWidth: t.scrollWidth,
          containerWidth: scroller.clientWidth,
          clipped: [...t.querySelectorAll('thead th')]
            .map(th => ({
              text: (th.textContent ?? '').trim(),
              r: th.getBoundingClientRect(),
            }))
            .filter(
              ({ r }) => r.left < box.left - 0.5 || r.right > box.right + 0.5
            )
            .map(({ text }) => text),
        }
      })
      const ctx = JSON.stringify(m)
      expect(m.tableWidth, ctx).toBeLessThanOrEqual(m.containerWidth)
      expect(m.clipped, ctx).toEqual([])
      // Nothing to scroll to, so no "more to the right" fade over the last
      // column (it read as clipping in the first 1280 screenshot).
      await expect(page.locator('.region-rankings__scroll-cue')).toBeHidden()
    })
  }
}
