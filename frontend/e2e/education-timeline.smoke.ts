import { test, expect, type Page, type Route } from './fixtures/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/* Education timeline chart (#2592, epic #2590) on the District, Region and
 * World Education pages: a cumulative stacked step chart under the KPI tiles,
 * a prior-year ghost line, a legend that carries the old Pathways / Legacy /
 * DTM bar's names and values, and a table view.
 *
 * ── What the smoke serves ───────────────────────────────────────────────
 * Staging has no `derived/education-timeline/` objects until the backfill
 * runs (the manifest records them as optional 404s), so this spec decides
 * the timeline responses itself and never depends on staging:
 *
 *   - "available": a COMMITTED fixture (src/__tests__/fixtures/
 *     education-timeline-district-61.json), adapted per URL into the world,
 *     region or district shape and fulfilled by `page.route`;
 *   - "absent": a 404, and a 200 whose body fails the contract. Both must
 *     read "not available yet" -- never a zero line, never an error page.
 *
 * Everything else on the page (the rollup, the district reports, the KPI
 * tiles) comes from the run's CDN fixtures as for every other spec.
 *
 * ── What it asserts ─────────────────────────────────────────────────────
 *   - the chart sits directly under the KPI tiles and replaced the program
 *     bar; its headline prints the critical number and its as-of date;
 *   - ?by=path regroups to named paths plus Other, on the same route;
 *   - the table view opens and lists the same snapshot dates;
 *   - at 375: no horizontal overflow, readable legend text, 44px toggle;
 *   - light and dark both paint the bands (the swatch colour remaps);
 *   - the chart's height is reserved: the skeleton, the chart and the
 *     "not available" state occupy the same block, so nothing below moves. */

const FIXTURE = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      'src/__tests__/fixtures/education-timeline-district-61.json'
    ),
    'utf-8'
  )
) as {
  points: Record<string, unknown>[]
  [k: string]: unknown
}

const PAGES = [
  { name: 'district', path: '/district/61/education' },
  { name: 'region', path: '/region/05/education' },
  { name: 'world', path: '/regions/education' },
] as const

const CORS = { 'access-control-allow-origin': '*' }

/** The fixture in the shape the requested file names. */
function bodyFor(url: string): unknown {
  const file = new URL(url).pathname.split('/').pop() ?? ''
  if (file === 'world.json') {
    return {
      ...FIXTURE,
      entity: { kind: 'world', id: null },
      points: FIXTURE.points.map(p => ({ ...p, districts: 80 })),
    }
  }
  const region = /^region-(.+)\.json$/.exec(file)?.[1]
  if (region) {
    return {
      ...FIXTURE,
      entity: { kind: 'region', id: region },
      points: FIXTURE.points.map(p => ({ ...p, districts: 9 })),
    }
  }
  return FIXTURE
}

/** `yearend`: the staging reality in 2026-27, where last year has only its
 *  06-30 close (one prior point), so the ghost becomes a target line. */
function withYearEnd(body: unknown, yearEnd: boolean): unknown {
  if (!yearEnd) return body
  return {
    ...(body as Record<string, unknown>),
    prior: {
      programYear: '2025-2026',
      source: 'timeline',
      grain: 'day',
      points: [{ at: '2026-06-30', total: 412 }],
    },
  }
}

type Serve = 'fixture' | 'yearend' | 'absent' | 'drift'

async function serveTimeline(
  page: Page,
  serve: Serve,
  delayMs = 0
): Promise<void> {
  await page.route('**/derived/education-timeline/**', async (route: Route) => {
    if (delayMs) await new Promise(r => setTimeout(r, delayMs))
    if (serve === 'absent') {
      await route.fulfill({ status: 404, headers: CORS, body: 'not found' })
    } else if (serve === 'drift') {
      await route.fulfill({
        status: 200,
        headers: CORS,
        contentType: 'application/json',
        body: JSON.stringify({ not: 'a timeline' }),
      })
    } else {
      await route.fulfill({
        status: 200,
        headers: CORS,
        contentType: 'application/json',
        body: JSON.stringify(
          withYearEnd(bodyFor(route.request().url()), serve === 'yearend')
        ),
      })
    }
  })
}

const SECTION = 'section[aria-label="Awards over time"]'
const KPIS = 'ul[aria-label="Education at a glance"]'

async function load(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.locator(KPIS).first().waitFor({ timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready)
}

for (const vp of [
  { name: 'phone', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 900 },
] as const) {
  test.describe(`education timeline at ${vp.width}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
    })

    for (const pg of PAGES) {
      test(`${pg.name}: the chart sits under the KPI tiles with its critical number`, async ({
        page,
      }) => {
        await serveTimeline(page, 'fixture')
        await load(page, pg.path)
        const chart = page.locator(`${SECTION} .edu-tl`)
        await expect(chart).toBeVisible({ timeout: 30_000 })

        // Directly under the tiles, and the old program bar is gone.
        const adjacent = await page.evaluate(
          ([kpis, section]) =>
            document.querySelector(kpis!)?.nextElementSibling ===
            document.querySelector(section!),
          [KPIS, SECTION]
        )
        expect(adjacent).toBe(true)
        await expect(
          page.getByRole('list', { name: 'Awards by program', exact: true })
        ).toHaveCount(0)

        // The number and its date are text.
        const headline = page.getByTestId('education-timeline-headline')
        await expect(headline).toContainText(/\d[\d,]* awards/)
        await expect(headline).toContainText(
          /as of [A-Z][a-z]{2} \d{1,2}, \d{4}/
        )

        // Bands are painted: stacked areas and the dashed ghost.
        expect(
          await page.locator(`${SECTION} .recharts-area-area`).count()
        ).toBeGreaterThanOrEqual(6)
        await expect(page.locator(`${SECTION} .edu-tl__ghost`)).toHaveCount(1)

        // The legend carries the old bar's names and values.
        const legend = page.getByRole('list', { name: 'Chart legend' })
        await expect(legend.getByText('Level 1')).toBeVisible()
        await expect(legend.getByText('DTM')).toBeVisible()
        await expect(legend.getByText(/Last year/)).toBeVisible()
        await expect(
          page.getByTestId('education-timeline-ghost-note')
        ).toContainText(/daily/i)
      })
    }

    test('one prior point (the 06-30 close) draws last year as a labelled target line', async ({
      page,
    }) => {
      await serveTimeline(page, 'yearend')
      await load(page, '/district/61/education')
      const legend = page.getByRole('list', { name: 'Chart legend' })
      await expect(legend.getByText('Last year’s total: 412')).toBeVisible({
        timeout: 30_000,
      })
      await expect(page.locator(`${SECTION} .edu-tl__ghost`)).toHaveCount(1)
      await expect(
        page.getByTestId('education-timeline-ghost-note')
      ).toContainText(/year-end total, 412/)
      await page.getByText('Show as a table').click()
      await expect(
        page.getByRole('columnheader', { name: 'Last year’s total' })
      ).toBeVisible()
    })

    test('?by=path regroups to named paths plus Other on the same route', async ({
      page,
    }) => {
      await serveTimeline(page, 'fixture')
      await load(page, '/district/61/education?by=path')
      const legend = page.getByRole('list', { name: 'Chart legend' })
      await expect(legend.getByText('Presentation Mastery')).toBeVisible({
        timeout: 30_000,
      })
      await expect(legend.getByText('Other', { exact: true })).toBeVisible()
      await expect(legend.getByText('Level 1')).toHaveCount(0)
      await expect(page).toHaveURL(/\/district\/61\/education\?by=path/)
    })

    test('the table view lists the snapshot dates', async ({ page }) => {
      await serveTimeline(page, 'fixture')
      await load(page, '/district/61/education')
      await page.getByText('Show as a table').click({ timeout: 30_000 })
      const rows = page
        .getByRole('table', { name: 'Education awards by snapshot date' })
        .locator('tbody tr')
      await expect(rows).toHaveCount(FIXTURE.points.length)
    })

    test('"not available yet" when the file is absent or off-contract', async ({
      page,
    }) => {
      for (const serve of ['absent', 'drift'] as const) {
        await page.unroute('**/derived/education-timeline/**').catch(() => {})
        await serveTimeline(page, serve)
        await load(page, '/district/61/education')
        const note = page.getByTestId('education-timeline-unavailable')
        await expect(note).toBeVisible({ timeout: 30_000 })
        await expect(note).toContainText(/not available yet/i)
        // Not a zero line, not an error page, and the page keeps its bar.
        await expect(page.locator(`${SECTION} .recharts-wrapper`)).toHaveCount(
          0
        )
        await expect(page.getByRole('alert')).toHaveCount(0)
        await expect(
          page.getByRole('list', { name: 'Awards by program', exact: true })
        ).toBeVisible()
        await expect(page.locator(KPIS)).toBeVisible()
      }
    })
  })
}

test.describe('education timeline layout', () => {
  test('375: no overflow, readable legend, 44px table toggle', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await serveTimeline(page, 'fixture')
    await load(page, '/district/61/education')
    await page.locator(`${SECTION} .edu-tl`).waitFor({ timeout: 30_000 })
    const m = await page.evaluate(() => {
      const legend = document.querySelector('.edu-tl__legend-item')!
      const toggle = document.querySelector('.edu-tl__data-toggle')!
      return {
        overflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        legendFont: parseFloat(getComputedStyle(legend).fontSize),
        toggleHeight: toggle.getBoundingClientRect().height,
      }
    })
    expect(m.overflow).toBeLessThanOrEqual(0)
    expect(m.legendFont).toBeGreaterThanOrEqual(14)
    expect(m.toggleHeight).toBeGreaterThanOrEqual(44)
  })

  test('the bands remap in dark mode (the swatch colour differs)', async ({
    page,
  }) => {
    await serveTimeline(page, 'fixture')
    const swatch = async (scheme: 'light' | 'dark') => {
      await page.emulateMedia({ colorScheme: scheme })
      await load(page, '/district/61/education')
      await page.locator(`${SECTION} .edu-tl`).waitFor({ timeout: 30_000 })
      return page
        .locator('.edu-tl__swatch.edu-tl-c--l5')
        .evaluate(e => getComputedStyle(e).backgroundColor)
    }
    const light = await swatch('light')
    const dark = await swatch('dark')
    expect(light).not.toBe('')
    expect(dark).not.toBe('')
    expect(light).not.toBe(dark)
  })

  test('the chart block holds its height: nothing below moves when it loads', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    // Hold the timeline so the skeleton is on screen, then release it.
    await serveTimeline(page, 'fixture', 1_500)
    await page.goto('/district/61/education', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })
    const skeleton = page.locator(`${SECTION} .edu-tl__skeleton`)
    await skeleton.waitFor({ timeout: 30_000 })
    const probe = () =>
      page.evaluate(() => {
        const section = document.querySelector(
          'section[aria-label="Awards over time"]'
        )!
        const below = section.nextElementSibling!
        return {
          sectionHeight: Math.round(section.getBoundingClientRect().height),
          belowTop: Math.round(below.getBoundingClientRect().top + scrollY),
        }
      })
    const before = await probe()
    await page.locator(`${SECTION} .edu-tl`).waitFor({ timeout: 30_000 })
    await page.evaluate(() => document.fonts.ready)
    const after = await probe()
    expect(after.belowTop).toBe(before.belowTop)
    expect(after.sectionHeight).toBe(before.sectionHeight)
  })
})
