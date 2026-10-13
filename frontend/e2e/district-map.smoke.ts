import { test, expect, type Page } from '@playwright/test'

/* District club map (#1784) on the deployed preview (BASE_URL), at 375 and
 * 1280, light and dark. Real data (D61) and the real basemap archive.
 *
 *  - the map region and its canvas render, inside the viewport, with no
 *    sideways page scroll;
 *  - pins drew: a screenshot of the map holds single pins in the health
 *    fills (found in the page's own 2D canvas, so no test-only hooks in
 *    the app);
 *  - no CSP, worker or tile error on the deployed headers (Lesson 122: only
 *    the preview proves the CSP);
 *  - legend chips are ≥ 44 px tall with ≥ 14 px text, and toggle `?status=`;
 *  - tapping a pin opens the club summary — a sheet at 375, the side panel
 *    at 1280 — with a club-page link and no contact details;
 *  - "Not on the map" is listed.
 */

const MAP = '/district/61/map'

/* The health fills (spec §3.3) as drawn on the canvas. */
const HEALTH_FILLS = [
  [0x2a, 0x8f, 0x6e],
  [0xe0, 0xa0, 0x30],
  [0xc9, 0x3d, 0x3d],
]

/* Find single pins in a screenshot: horizontal runs of a health fill 5–14
 * px long (a pin is 14 px; clusters are 32 px and up) whose vertical run is
 * short too. Returns their centres in CSS px, clear of the bottom strip. */
async function findPins(
  page: Page,
  png: Buffer,
  skipBottom: number,
  cssWidth: number
): Promise<Array<{ x: number; y: number }>> {
  return page.evaluate(
    async ({ b64, fills, skipBottom, cssWidth }) => {
      const img = new Image()
      img.src = `data:image/png;base64,${b64}`
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height)
      // Screenshots are in device pixels (WebKit's profile is 2x).
      const k = width / cssWidth
      const hit = (x: number, y: number) => {
        const i = (y * width + x) * 4
        return fills.some(
          ([r, g, b]) =>
            Math.abs(data[i]! - r!) < 12 &&
            Math.abs(data[i + 1]! - g!) < 12 &&
            Math.abs(data[i + 2]! - b!) < 12
        )
      }
      const found: Array<{ x: number; y: number }> = []
      for (let y = 20 * k; y < height - skipBottom * k; y += 2) {
        let x = 20 * k
        while (x < width - 20 * k) {
          if (!hit(x, y)) {
            x++
            continue
          }
          let end = x
          while (end < width && hit(end, y)) end++
          const run = end - x
          const cx = Math.round((x + end) / 2)
          if (run >= 5 * k && run <= 14 * k) {
            let top = y
            let bottom = y
            while (top > 0 && hit(cx, top - 1)) top--
            while (bottom < height - 1 && hit(cx, bottom + 1)) bottom++
            if (bottom - top <= 14 * k)
              found.push({
                x: Math.round(cx / k),
                y: Math.round((top + bottom) / 2 / k),
              })
          }
          x = end
        }
      }
      return found
    },
    { b64: png.toString('base64'), fills: HEALTH_FILLS, skipBottom, cssWidth }
  )
}

async function open(
  page: Page,
  theme: 'light' | 'dark',
  width: number
): Promise<string[]> {
  const errors: string[] = []
  const ours = /pmtiles|maplibre|worker|Content Security Policy|basemap|WebGL/i
  page.on('console', msg => {
    if (msg.type() === 'error' && ours.test(msg.text())) errors.push(msg.text())
  })
  page.on('pageerror', err => {
    if (ours.test(`${err.message} ${err.stack ?? ''}`)) errors.push(err.message)
  })
  await page.emulateMedia({ colorScheme: theme })
  await page.addInitScript(t => {
    try {
      window.localStorage.setItem('theme', t)
    } catch {
      // storage blocked: the page falls back to the system theme
    }
  }, theme)
  await page.setViewportSize({ width, height: width < 768 ? 812 : 900 })
  await page.goto(MAP, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  return errors
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [375, 1280]) {
    test(`district map at ${width} (${theme}): pins, legend, tap`, async ({
      page,
    }) => {
      test.setTimeout(90_000)
      const errors = await open(page, theme, width)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)

      const region = page.getByRole('region', {
        name: 'Club map, coloured by club health',
      })
      await expect(region.locator('canvas.maplibregl-canvas')).toBeVisible({
        timeout: 30_000,
      })
      // Pins drew (tiles, pins and icons settle within a few seconds).
      const skipBottom = width < 768 ? 200 : 40
      let pins: Array<{ x: number; y: number }> = []
      await expect
        .poll(
          async () => {
            const box = (await region.boundingBox())!
            pins = await findPins(
              page,
              await region.screenshot(),
              skipBottom,
              box.width
            )
            return pins.length
          },
          { timeout: 30_000, intervals: [1_000, 2_000] }
        )
        .toBeGreaterThan(0)

      const m = await page.evaluate(() => {
        const chips = Array.from(
          document.querySelectorAll<HTMLElement>('.map-legend__chip')
        ).filter(el => el.getBoundingClientRect().width > 0)
        return {
          overflow:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
          chipCount: chips.length,
          minChipHeight: Math.min(
            ...chips.map(c => c.getBoundingClientRect().height)
          ),
          minChipFont: Math.min(
            ...chips.map(c => parseFloat(getComputedStyle(c).fontSize))
          ),
        }
      })
      expect(m.overflow).toBeLessThanOrEqual(0)
      expect(m.chipCount).toBeGreaterThan(0)
      expect(m.minChipHeight).toBeGreaterThanOrEqual(44)
      expect(m.minChipFont).toBeGreaterThanOrEqual(14)

      // ODbL credit visible in both themes.
      await expect(region.locator('.maplibregl-ctrl-attrib')).toBeVisible()

      // Tap a single pin found in the screenshot.
      await region.click({ position: pins[0]! })
      const summary =
        width < 768
          ? page.getByRole('dialog', { name: /Club details|Clubs here/ })
          : page.getByRole('complementary', { name: 'Map legend and lists' })
      const link = summary.getByRole('link', { name: /Open club page/ }).first()
      await expect(link).toBeVisible()
      await expect(link).toHaveAttribute('href', /\/district\/61\/club\/\w+/)
      const text = (await summary.textContent()) ?? ''
      expect(text).not.toMatch(/@|passcode|zoom\.us/i)
      if (width < 768) await page.keyboard.press('Escape')

      // A legend chip filters through ?status= (one URL write).
      const chip = page
        .locator('.map-legend__chip[aria-pressed]')
        .filter({ hasText: 'Intervention required' })
        .first()
      await chip.click()
      await expect(page).toHaveURL(/status=intervention/)
      await expect(chip).toHaveAttribute('aria-pressed', 'true')

      if (width >= 768) {
        await expect(
          page.getByRole('region', { name: /Not on the map \(\d+\)/ })
        ).toBeVisible()
      }
      expect(errors).toEqual([])
    })
  }
}

/* Map filters (#1788): visit round, online-capable, division and area as
 * URL state, in the shared Filter & sort sheet at 375 and a side-panel
 * section at 1280; the list view applies the same set. */
const shownOf = async (page: Page) => {
  const status = page.getByRole('status').filter({ hasText: /Showing/ })
  // "of 0" is the line before the analytics land; wait for the real total.
  await expect(status).toHaveText(/Showing \d+ of [1-9]\d* clubs/, {
    timeout: 30_000,
  })
  const [, n, m] = /Showing (\d+) of (\d+)/.exec(
    (await status.textContent()) ?? ''
  )!
  return { n: Number(n), m: Number(m) }
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [375, 1280]) {
    test(`district map filters at ${width} (${theme})`, async ({ page }) => {
      test.setTimeout(90_000)
      await open(page, theme, width)
      await page.goto(`${MAP}?online=yes`, { waitUntil: 'domcontentloaded' })
      const online = await shownOf(page)
      expect(online.n).toBeGreaterThan(0)
      expect(online.n).toBeLessThan(online.m)

      await page.getByRole('button', { name: 'Filters, 1 active' }).click()
      const surface =
        width < 768
          ? page.getByRole('dialog', { name: 'Filter & sort' })
          : page.getByRole('region', { name: 'Filters' })
      await expect(surface).toBeVisible()
      await expect(
        surface.getByRole('button', { name: 'Online attendance possible' })
      ).toHaveAttribute('aria-pressed', 'true')

      const m = await page.evaluate(() => {
        const chips = Array.from(
          document.querySelectorAll<HTMLElement>('.filter-sheet__chip')
        ).filter(el => el.getBoundingClientRect().width > 0)
        return {
          overflow:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
          count: chips.length,
          minHeight: Math.min(
            ...chips.map(c => c.getBoundingClientRect().height)
          ),
          minFont: Math.min(
            ...chips.map(c => parseFloat(getComputedStyle(c).fontSize))
          ),
        }
      })
      expect(m.overflow).toBeLessThanOrEqual(0)
      expect(m.count).toBeGreaterThan(4)
      expect(m.minHeight).toBeGreaterThanOrEqual(44)
      expect(m.minFont).toBeGreaterThanOrEqual(14)

      // Round 1 composes with online (one write each) and reads the
      // snapshot's visit awards for the viewed date.
      await surface.getByRole('button', { name: 'Round 1' }).click()
      await expect(page).toHaveURL(/visit=r1/)
      await expect(page).toHaveURL(/online=yes/)
      // D61 has round-1 visits reported, so the set narrows.
      await expect
        .poll(async () => (await shownOf(page)).n, { timeout: 15_000 })
        .toBeLessThan(online.n)

      await surface.getByRole('button', { name: 'Clear all' }).click()
      await expect(page).not.toHaveURL(/visit=|online=/)
      if (width < 768) await page.keyboard.press('Escape')
      await expect
        .poll(async () => (await shownOf(page)).n, { timeout: 15_000 })
        .toBe(online.m)

      // The list view applies the same filters.
      await page.goto(`${MAP}?view=list&online=yes`, {
        waitUntil: 'domcontentloaded',
      })
      // The shared MobileRowList rows (#1945): 50, then "Show 25 more".
      const list = page.getByRole('list', { name: 'Clubs' })
      await expect(list.getByTestId('mobile-row')).toHaveCount(
        Math.min(online.n, 50),
        { timeout: 30_000 }
      )
      const more = page.getByRole('button', { name: /^Show \d+ more clubs/ })
      while (await more.isVisible()) await more.click()
      await expect(list.getByTestId('mobile-row')).toHaveCount(online.n)
      // Rows are whole-row links of 56–64 px.
      const h = (await list.getByTestId('mobile-row').first().boundingBox())!
        .height
      expect(h).toBeGreaterThanOrEqual(56)
      expect(h).toBeLessThanOrEqual(64)
    })
  }
}

/* Realignment sandbox (#1819): `?sandbox=1`, at 375 (bottom sheet) and
 * 1280 (side panel), light and dark. The keyboard-operable list path moves
 * a club, the plan lands in the URL and survives a reload (a shared link),
 * the area table recounts, CSV exports, Done leaves. No contact details. */
for (const theme of ['light', 'dark'] as const) {
  for (const width of [375, 1280]) {
    test(`realignment sandbox at ${width} (${theme})`, async ({ page }) => {
      test.setTimeout(120_000)
      await open(page, theme, width)
      await page.goto(`${MAP}?sandbox=1`, { waitUntil: 'domcontentloaded' })
      await expect(
        page.getByRole('region', {
          name: 'Club map, coloured by proposed area',
        })
      ).toBeVisible({ timeout: 30_000 })

      const surface = async () => {
        if (width >= 768)
          return page.getByRole('region', { name: 'Realignment sandbox' })
        await page.getByRole('button', { name: 'Open plan' }).click()
        return page.getByRole('dialog', { name: 'Realignment plan' })
      }
      const summary = (p: Awaited<ReturnType<typeof surface>>) =>
        p.getByRole('status', { name: 'Plan summary' })
      let panel = await surface()
      await expect(panel).toBeVisible({ timeout: 30_000 })
      await expect(summary(panel)).toHaveText(/No clubs moved yet/)

      await panel
        .getByRole('button', { name: 'Assign clubs from a list' })
        .click()
      const pick = panel.getByRole('combobox', { name: /^Area for / }).first()
      const current = await pick.inputValue()
      const target = await pick.evaluate(
        (el, cur) =>
          Array.from((el as HTMLSelectElement).options).find(
            o =>
              o.value.includes('|') &&
              !o.value.startsWith('new|') &&
              o.value !== cur
          )!.value,
        current
      )
      await pick.selectOption(target)
      await expect(page).toHaveURL(/[?&]plan=[A-Za-z0-9]+-[A-Za-z0-9]+-\d+/)
      await expect(summary(panel)).toHaveText(/1 club moved/)
      const [div, area] = target.split('|')
      await expect(
        panel
          .getByRole('table', { name: /Areas/ })
          .getByRole('row', { name: new RegExp(`^${div}${area}`) })
      ).toContainText('(+1)')

      // Touch targets, legibility, no sideways scroll, no contact details.
      const m = await page.evaluate(() => {
        const root = document.querySelector('.realign')!
        const controls = Array.from(
          root.querySelectorAll<HTMLElement>('button, select, a')
        ).filter(el => el.getBoundingClientRect().width > 0)
        return {
          overflow:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
          minHeight: Math.min(
            ...controls.map(c => c.getBoundingClientRect().height)
          ),
          minFont: Math.min(
            ...controls.map(c => parseFloat(getComputedStyle(c).fontSize))
          ),
          text: root.textContent ?? '',
          hrefs: Array.from(root.querySelectorAll('a')).map(a => a.href),
        }
      })
      expect(m.overflow).toBeLessThanOrEqual(0)
      expect(m.minHeight).toBeGreaterThanOrEqual(44)
      expect(m.minFont).toBeGreaterThanOrEqual(14)
      expect(m.text).not.toMatch(/@[\w-]+\.\w/)
      expect(m.hrefs.join(' ')).not.toMatch(/mailto:|tel:|zoom\.us|teams\./)

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        panel.getByRole('button', { name: 'Export CSV' }).click(),
      ])
      expect(download.suggestedFilename()).toMatch(
        /^district-61-realignment-plan-\d{4}-\d{2}-\d{2}\.csv$/
      )

      // The link is the plan: a reload (or a shared link) restores it.
      await page.reload({ waitUntil: 'domcontentloaded' })
      panel = await surface()
      await expect(summary(panel)).toHaveText(/1 club moved/, {
        timeout: 30_000,
      })

      await panel.getByRole('link', { name: 'Done' }).click()
      await expect(page).not.toHaveURL(/sandbox=|plan=/)
      await expect(
        page.getByRole('region', { name: 'Club map, coloured by club health' })
      ).toBeVisible()
    })
  }
}

/* Keyboard path between pins (#1940): the map canvas then one Tab stop for
 * the pins; arrows move between them, each named by club and category (not
 * colour) with a visible focus ring; Enter opens the club (a sheet at 375,
 * the side panel at 1280); Escape closes it and focus returns to the pin;
 * Tab moves on (no trap). */
const CATEGORY =
  /, (Thriving|Vulnerable|Intervention required|Suspended)(;|$)|^Group of \d+ clubs/

for (const theme of ['light', 'dark'] as const) {
  for (const width of [375, 1280]) {
    test(`keyboard pins at ${width} (${theme})`, async ({ page }) => {
      test.setTimeout(90_000)
      const errors = await open(page, theme, width)
      const pins = page.getByRole('toolbar', { name: /Club pins/ })
      await expect(pins.getByRole('button').first()).toBeAttached({
        timeout: 30_000,
      })

      // From the map canvas, Tab reaches the pins: past the attribution
      // links in Chromium (WebKit's Tab skips links), one stop for all pins.
      await page.locator('canvas.maplibregl-canvas').focus()
      const focused = pins.locator('button:focus')
      for (let i = 0; i < 6 && (await focused.count()) === 0; i++)
        await page.keyboard.press('Tab')
      await expect(focused).toHaveCount(1)
      const ring = await focused.evaluate(el => {
        const s = getComputedStyle(el)
        return { opacity: s.opacity, outline: s.outlineStyle }
      })
      expect(ring).toEqual({ opacity: '1', outline: 'solid' })
      expect(await focused.getAttribute('aria-label')).toMatch(CATEGORY)

      // Arrow to the first single-club pin (clusters zoom instead).
      const count = await pins.getByRole('button').count()
      let name = (await focused.getAttribute('aria-label')) ?? ''
      for (let i = 0; i < count && name.startsWith('Group of'); i++) {
        await page.keyboard.press('ArrowRight')
        name = (await focused.getAttribute('aria-label')) ?? ''
      }
      expect(name).toMatch(CATEGORY)
      expect(name).not.toMatch(/^Group of/)
      const pin = pins.getByRole('button', { name, exact: true })

      await page.keyboard.press('Enter')
      const summary =
        width < 768
          ? page.getByRole('dialog', { name: /Club details|Clubs here/ })
          : page.getByRole('region', { name: 'Selected club' })
      await expect(
        summary.getByRole('link', { name: /Open club page/ }).first()
      ).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(summary).toHaveCount(0)
      await expect(pin).toBeFocused()

      // No trap: Tab leaves the pins.
      await page.keyboard.press('Tab')
      await expect(focused).toHaveCount(0)
      expect(errors).toEqual([])
    })
  }
}
