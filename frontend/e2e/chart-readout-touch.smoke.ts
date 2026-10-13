import { test, expect, type Page, type Locator } from './fixtures/test'

/* Touch-only chart probe (#1835, mobile epic #1827 Phase 1 item 13).
 *
 * The mobile review (§4.1) found that a tap on the Trends chart left
 * `.recharts-tooltip-wrapper` at `visibility: hidden` — on a phone a chart's
 * values lived only behind hover. With the readout primitive, a device that
 * cannot hover gets a persistent line under the chart that a tap (or the
 * arrow keys) pins a value into.
 *
 * Emulated as a phone (hasTouch + isMobile → `(hover: none)`), 375×812,
 * light and dark, on the deployed preview (BASE_URL):
 * - the readout line is reserved before any tap (no layout shift on pin);
 * - one tap on the plot pins a dated value; no floating tooltip box shows;
 * - the arrow keys move the pinned value;
 * - the readout's text is ≥ 14 px and inside the viewport (Lesson 134). */

test.use({
  viewport: { width: 375, height: 812 },
  hasTouch: true,
  isMobile: true,
})

const READOUT = '[data-testid="chart-readout"]'
const DATED = /[A-Z][a-z]{2} \d{1,2}, \d{4}/

async function load(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready)
}

async function expectReadoutGeometry(page: Page, readout: Locator) {
  const g = await readout.evaluate(el => {
    const r = el.getBoundingClientRect()
    return {
      left: r.left,
      right: r.right,
      px: parseFloat(getComputedStyle(el).fontSize),
      vw: window.innerWidth,
    }
  })
  expect(g.left).toBeGreaterThanOrEqual(0)
  expect(g.right).toBeLessThanOrEqual(g.vw)
  expect(g.px).toBeGreaterThanOrEqual(14)
}

/** The chart's plot surface — legend icons are `svg.recharts-surface` too. */
const plotSurface = (scope: Locator) =>
  scope.locator('.recharts-wrapper > svg.recharts-surface').first()

/** Tap the middle of the chart's plot area. */
async function tapPlot(page: Page, scope: Locator, at = 0.6) {
  const surface = plotSurface(scope)
  await expect(surface).toBeVisible()
  // The plot can sit below the fold of a scrolling sheet; a touch outside
  // the viewport is a no-op.
  await surface.scrollIntoViewIfNeeded()
  const box = await surface.boundingBox()
  if (!box) throw new Error('chart surface has no box')
  await page.touchscreen.tap(box.x + box.width * at, box.y + box.height * 0.5)
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`chart readout on touch (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
    })

    test('Trends membership chart: tap pins a dated value in the sheet', async ({
      page,
    }) => {
      // The expand sheet deep-links (#980), so the chart is open on load.
      await load(page, '/district/61/trends?chartExpanded=membership')
      const sheet = page.getByRole('dialog')
      await expect(sheet).toBeVisible()
      const readout = sheet.locator(READOUT)
      await expect(readout).toHaveText(/Tap the chart to read a value/)
      await plotSurface(sheet).scrollIntoViewIfNeeded()
      const before = await readout.boundingBox()

      await tapPlot(page, sheet)
      await expect(readout).toHaveText(DATED)
      await expect(readout).toHaveText(/\d/)
      // The value line replaces the floating box — none is painted.
      await expect(page.locator('.recharts-default-tooltip')).toHaveCount(0)
      // Pinning does not move or resize the reserved slot's top.
      const after = await readout.boundingBox()
      expect(Math.round(after?.y ?? -1)).toBe(Math.round(before?.y ?? -2))
      await expectReadoutGeometry(page, readout)

      // The keyboard pins too, with no pointer at all (Recharts'
      // accessibility layer): reload, focus the plot, arrow right.
      await load(page, '/district/61/trends?chartExpanded=membership')
      const sheet2 = page.getByRole('dialog')
      const readout2 = sheet2.locator(READOUT)
      await expect(readout2).toHaveText(/Tap the chart to read a value/)
      await plotSurface(sheet2).focus()
      await page.keyboard.press('ArrowRight')
      await expect(readout2).toHaveText(DATED)
    })

    test('Clubs race chart: tap pins a snapshot inline', async ({ page }) => {
      await load(page, '/clubs')
      const figure = page.locator('figure.race-chart')
      await figure.scrollIntoViewIfNeeded()
      const readout = figure.locator(READOUT)
      await expect(readout).toHaveText(/Tap the chart to read a value/)
      await tapPlot(page, figure)
      await expect(readout).toHaveText(/^Snapshot /)
      await expect(readout).toHaveText(DATED)
      await expect(page.locator('.recharts-default-tooltip')).toHaveCount(0)
      await expectReadoutGeometry(page, readout)

      // The FIRST tap lands where it was made: a click trigger pinned
      // index 0 (the first snapshot) on the first tap of this stacked
      // AreaChart. The 60 % tap must read a later date than a tap early in
      // the plot (15 %, clear of the y axis).
      const dateOf = (t: string | null) =>
        Date.parse(DATED.exec(t ?? '')?.[0] ?? '')
      const firstText = await readout.textContent()
      const first = dateOf(firstText)
      await tapPlot(page, figure, 0.15)
      await expect(readout).not.toHaveText(firstText ?? '')
      const early = dateOf(await readout.textContent())
      expect(Number.isFinite(first) && Number.isFinite(early)).toBe(true)
      expect(first).toBeGreaterThan(early)
    })
  })
}

test.describe('hover device', () => {
  test.use({
    viewport: { width: 1280, height: 900 },
    hasTouch: false,
    isMobile: false,
  })

  test('desktop keeps the hover tooltip and shows no readout line', async ({
    page,
  }) => {
    await load(page, '/clubs')
    const figure = page.locator('figure.race-chart')
    await figure.scrollIntoViewIfNeeded()
    await expect(plotSurface(figure)).toBeVisible()
    await expect(figure.locator(READOUT)).toHaveCount(0)
  })
})
