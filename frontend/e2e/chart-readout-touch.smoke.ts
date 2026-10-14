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
const HINT = /Tap the chart to read a value/

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

/* Pin, unpin, legend chips and the phone axis inside the expand sheet
   (#1835). Same phone emulation as above. */
for (const theme of ['light', 'dark'] as const) {
  test.describe(`chart sheet on touch (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
    })

    test('a second tap unpins; Escape unpins before it closes the sheet; Enter pins', async ({
      page,
    }) => {
      await load(page, '/district/61/trends?chartExpanded=membership')
      const sheet = page.getByRole('dialog')
      const readout = sheet.locator(READOUT)
      await expect(readout).toHaveText(HINT)

      await tapPlot(page, sheet)
      await expect(readout).toHaveText(DATED)
      // The same spot again takes the pin back.
      await tapPlot(page, sheet)
      await expect(readout).toHaveText(HINT)
      // And a third tap pins it again.
      await tapPlot(page, sheet)
      await expect(readout).toHaveText(DATED)

      // The tap focused the plot: Escape unpins and the sheet stays open.
      await page.keyboard.press('Escape')
      await expect(readout).toHaveText(HINT)
      await expect(sheet).toBeVisible()
      // Nothing pinned: the next Escape is the sheet's.
      await page.keyboard.press('Escape')
      await expect(sheet).toBeHidden()

      // Keyboard only: arrow reads a point, Enter unpins, Enter pins.
      await load(page, '/district/61/trends?chartExpanded=membership')
      const sheet2 = page.getByRole('dialog')
      const readout2 = sheet2.locator(READOUT)
      await plotSurface(sheet2).focus()
      await page.keyboard.press('ArrowRight')
      await expect(readout2).toHaveText(DATED)
      await page.keyboard.press('Enter')
      await expect(readout2).toHaveText(HINT)
      await page.keyboard.press('Enter')
      await expect(readout2).toHaveText(DATED)
    })

    test('the legend is aria-pressed chips that hide and show a line', async ({
      page,
    }) => {
      await load(page, '/district/61/trends?chartExpanded=payments')
      const sheet = page.getByRole('dialog')
      const chips = sheet
        .getByRole('group', { name: 'Chart series' })
        .getByRole('button')
      const count = await chips.count()
      expect(count).toBeGreaterThan(1)
      // Recharts' own pointer-only legend strip is gone.
      await expect(sheet.locator('.recharts-legend-wrapper')).toHaveCount(0)
      for (let i = 0; i < count; i++) {
        const chip = chips.nth(i)
        await expect(chip).toHaveAttribute('aria-pressed', 'true')
        const box = await chip.boundingBox()
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
        const px = await chip.evaluate(el =>
          parseFloat(getComputedStyle(el).fontSize)
        )
        expect(px).toBeGreaterThanOrEqual(14)
      }
      const lines = sheet.locator('.recharts-line')
      const before = await lines.count()
      const last = chips.nth(count - 1)
      await last.scrollIntoViewIfNeeded()
      const box = await last.boundingBox()
      if (!box) throw new Error('chip has no box')
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
      await expect(last).toHaveAttribute('aria-pressed', 'false')
      await expect(lines).toHaveCount(before - 1)
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
      await expect(last).toHaveAttribute('aria-pressed', 'true')
      await expect(lines).toHaveCount(before)
    })

    for (const chart of ['membership', 'payments'] as const) {
      test(`${chart} sheet: 3–4 horizontal x ticks, at least 12 px`, async ({
        page,
      }) => {
        await load(page, `/district/61/trends?chartExpanded=${chart}`)
        const sheet = page.getByRole('dialog')
        const ticks = sheet.locator('.recharts-xAxis-tick-labels text')
        await expect(ticks.first()).toBeVisible()
        const read = await ticks.evaluateAll(els =>
          els.map(el => ({
            transform: el.getAttribute('transform') ?? '',
            px: parseFloat(getComputedStyle(el).fontSize),
          }))
        )
        // The plot fits the sheet: no side-scroller clipping the last
        // tick and the right end of the lines (the desktop min-width).
        const scroller = await sheet
          .locator('.recharts-wrapper')
          .first()
          .evaluate(el => {
            let n: HTMLElement | null = el.parentElement
            while (n && getComputedStyle(n).overflowX !== 'auto')
              n = n.parentElement
            return n ? { sw: n.scrollWidth, cw: n.clientWidth } : null
          })
        if (scroller) expect(scroller.sw).toBeLessThanOrEqual(scroller.cw)
        expect(read.length).toBeGreaterThanOrEqual(2)
        expect(read.length).toBeLessThanOrEqual(4)
        for (const t of read) {
          expect(t.transform).not.toMatch(/rotate/)
          expect(t.px).toBeGreaterThanOrEqual(12)
        }
      })
    }
  })
}

/* No chart on a phone depends on hover (#1835 AC). Every Recharts chart
   visible on these phone views either carries the readout line or prints
   its values beside it (data-chart-values="printed"). */
test.describe('touch-only probe: no hover-only chart', () => {
  const VIEWS: Array<{ path: string; open?: string }> = [
    { path: '/district/61/trends' },
    { path: '/district/61/trends?chartExpanded=membership' },
    { path: '/district/61/trends?chartExpanded=payments' },
    { path: '/district/61/rankings', open: 'Expand Ranking Progression chart' },
    { path: '/clubs' },
  ]

  for (const view of VIEWS) {
    test(`${view.path}${view.open ? ' (sheet)' : ''}`, async ({ page }) => {
      await load(page, view.path)
      if (view.open) {
        await page.getByRole('button', { name: view.open }).click()
        await expect(page.getByRole('dialog')).toBeVisible()
      }
      // Lazy charts mount as they scroll in; walk the page first.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y)
          await new Promise(r => setTimeout(r, 120))
        }
        window.scrollTo(0, 0)
      })
      const charts = await page.locator('.recharts-wrapper').evaluateAll(els =>
        els
          .filter(el => {
            const r = el.getBoundingClientRect()
            return r.width > 0 && r.height > 0
          })
          .map(el => {
            const host =
              el.closest('[data-chart-values="printed"]') ??
              el.closest('[role="dialog"], figure, section, .redesign-panel')
            const ok =
              !!el.closest('[data-chart-values="printed"]') ||
              !!host?.querySelector('[data-testid="chart-readout"]')
            return { ok, where: host?.getAttribute('aria-label') ?? '' }
          })
      )
      expect(charts.length).toBeGreaterThan(0)
      expect(charts.filter(c => !c.ok)).toEqual([])
    })
  }
})

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
