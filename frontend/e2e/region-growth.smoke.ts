import { test, expect, type Page } from './fixtures/test'
import reports from '../src/__tests__/fixtures/reports-rollups-2026-10-15.recorded.json' with { type: 'json' }
import rollups from '../src/__tests__/fixtures/region-rollups-2026-10-15.recorded.json' with { type: 'json' }
import reinstatable from '../src/__tests__/fixtures/reinstatable-clubs-2026-11-18.recorded.json' with { type: 'json' }
import {
  assertTiRenewalsLinks,
  withoutTiRenewalsContact,
} from './helpers/tiRenewalsContact'
import { addsToThisYearsBase } from '../src/utils/reinstateDeadline'

/* Region and world Club Growth funnels (#1812, #1813) — measured on the
 * deployed preview (BASE_URL) at 375, 768 and 1280, light and dark.
 *
 * `reports-rollups.json` is not on any CDN until #2117 lands and a pipeline
 * run writes it, so every test serves the recorded files (the #2117 builder
 * over the recorded prod 2026-10-15 sidecars of Regions 05 and 09; the
 * recorded prod region-rollups of that date) by route interception, or a
 * 404 to hold the "not available yet" state.
 *
 * #3094: the "Can reinstate" card reads the dated reinstate file. The tests
 * serve the recorded 2026-11-18 list (Districts 51, 61 and 93), re-dated to
 * the date the page asks for, or a 404 for a date without the file. */

const REGION = '/region/05/growth'
const WORLD = '/regions/growth'
const STAGES = ['prospective', 'chartered', 'coached', 'suspended'] as const

/** The date the page last asked the reinstate file for (it is re-dated). */
let servedReinstateDate = ''

type RecordedClub = { reason: string; addsToBase: boolean }

/** #3130 — the card's n, by the app's own rule on the served date: the
 *  clubs that don't raise this year's club base. Computed, not hard-coded,
 *  because the recorded clubs stop raising the base after March 31. */
function netGrowthIn(districtIds: readonly string[], date: string): number {
  const districts = reinstatable.districts as unknown as Record<
    string,
    RecordedClub[]
  >
  return districtIds
    .flatMap(id => districts[id] ?? [])
    .filter(c => !addsToThisYearsBase(c.reason, c.addsToBase, date)).length
}

async function serve(
  page: Page,
  files: {
    reports: unknown | null
    rollups: unknown | null
    reinstate?: boolean
  }
): Promise<void> {
  await page.route('**/snapshots/*/reinstatable-clubs.json', r => {
    const date = /snapshots\/([^/]+)\//.exec(r.request().url())?.[1] ?? ''
    servedReinstateDate = date
    return files.reinstate === false
      ? r.fulfill({
          status: 404,
          headers: { 'access-control-allow-origin': '*' },
          body: '',
        })
      : r.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({ ...reinstatable, snapshotDate: date }),
        })
  })
  for (const [name, body] of [
    ['reports-rollups.json', files.reports],
    ['region-rollups.json', files.rollups],
  ] as const) {
    await page.route(`**/snapshots/*/${name}`, r =>
      body === null
        ? r.fulfill({
            status: 404,
            headers: { 'access-control-allow-origin': '*' },
            body: '',
          })
        : r.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify(body),
          })
    )
  }
}

async function load(page: Page, url: string, ready: string): Promise<void> {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90_000 })
  await page.locator(ready).first().waitFor({ timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready)
}

const metrics = (page: Page) =>
  page.evaluate(() => {
    const links = Array.from(
      document.querySelectorAll('.growth-funnel__link')
    ).map(e => e.getBoundingClientRect())
    const card = document.querySelector('.growth-funnel__link')
    return {
      small: links.filter(r => r.height < 44 || r.width < 44).length,
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      cardBg: card ? getComputedStyle(card).backgroundColor : '',
    }
  })

const lum = (rgb: string) => {
  const [r, g, b] = (rgb.match(/\d+/g) ?? ['0', '0', '0']).map(Number)
  return (r! + g! + b!) / 3
}

for (const [label, url, child] of [
  ['region', REGION, 'District 61'],
  ['world', WORLD, 'Region 05'],
] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [375, 768, 1280] as const) {
      test(`${label} growth at ${width} (${theme}): five stages, drill-down, no overflow`, async ({
        page,
      }) => {
        test.setTimeout(120_000)
        await serve(page, { reports, rollups })
        await page.emulateMedia({ colorScheme: theme })
        await page.setViewportSize({ width, height: 900 })
        await load(page, url, '.growth-funnel__stage')
        await page.addStyleTag({
          content: 'html,body{overflow-x:visible !important}',
        })

        const funnel = page.getByRole('list', { name: 'Club Growth funnel' })
        const texts = await funnel.getByRole('listitem').allTextContents()
        expect(texts).toHaveLength(5)
        texts.forEach(t => expect(t).toMatch(/\d/))

        // #3094: the card sums the districts in scope, and each district
        // links to its own section. Region 05 has District 61 (22); the
        // world adds District 51 (1).
        const card = page.getByTestId('growth-stage-reinstate')
        await expect(card).toContainText(label === 'region' ? '22' : '23')
        // #3130: the clubs that add to net club growth, by the app's rule.
        const n = netGrowthIn(
          label === 'region'
            ? ['61']
            : Object.keys(reinstatable.districts).filter(id => id !== 'U'),
          servedReinstateDate
        )
        await expect(card).toContainText(
          `${n} ${n === 1 ? 'adds' : 'add'} to net club growth`
        )
        await expect(
          page
            .locator('#growth-reinstate')
            .getByRole('link', { name: /District 61/ })
            .first()
        ).toHaveAttribute(
          'href',
          /\/district\/61\/growth(\?[^#]*)?#growth-reinstate$/
        )
        if (width < 768) {
          // Phone rows lead with adds and wrap in full words; nothing is
          // clipped.
          const clipped = await page
            .locator(
              '#growth-reinstate .mobile-row__meta, #growth-reinstate .mobile-row__title'
            )
            .evaluateAll(
              els =>
                els.filter(
                  e =>
                    e.scrollWidth > e.clientWidth ||
                    e.scrollHeight > e.clientHeight
                ).length
            )
          expect(clipped).toBe(0)
          await expect(
            page.locator('#growth-reinstate .mobile-row__title').first()
          ).toContainText(/District \w+ — \d+ adds? to net club growth/)
        }

        // Every stage drills down to the level below, at the same stage.
        for (const stage of STAGES) {
          const section = page.locator(`#growth-${stage}`)
          const link = section.getByRole('link', { name: new RegExp(child) })
          await expect(link.first()).toHaveAttribute(
            'href',
            new RegExp(`/growth(\\?[^#]*)?#growth-${stage}$`)
          )
        }

        // Counts only: no person data. TI's renewals contact in "What it
        // takes" is the one address and phone allowed (#3100).
        const text = withoutTiRenewalsContact(
          (await page.locator('.growth-page').textContent()) ?? ''
        )
        expect(text).not.toMatch(/@|\+\d{10,}/)
        await assertTiRenewalsLinks(page)

        const m = await metrics(page)
        expect(m.small).toBe(0)
        expect(m.overflow).toBeLessThanOrEqual(0)
        expect(lum(m.cardBg) < 128).toBe(theme === 'dark')
      })
    }
  }
}

test('region growth without reports-rollups says not available yet, never 0', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await serve(page, { reports: null, rollups })
  await page.setViewportSize({ width: 1280, height: 900 })
  await load(page, REGION, '.growth-funnel__stage')
  const prospective = page.getByTestId('growth-stage-prospective')
  await expect(prospective).toContainText('Unknown')
  await expect(prospective).toContainText(/Not available yet/)
  await expect(page.getByTestId('rollup-growth-reports-note')).toBeVisible()
  // The roster stages still read from region-rollups.
  await expect(page.getByTestId('growth-stage-chartered')).toContainText('3')
})

test('an unpadded region id redirects to the canonical growth URL (#2130)', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await serve(page, { reports, rollups })
  await load(page, '/region/5/growth', '.growth-funnel__stage')
  await expect(page).toHaveURL(/\/region\/05\/growth$/)
})

/* #3094 — the card's number is the sum of the breakdown rows, the card
 * jumps to them, and on a date without the file there are four cards drawn
 * once (no layout shift from a fifth card coming or going). */
for (const [label, url] of [
  ['region', REGION],
  ['world', WORLD],
] as const) {
  test(`${label} growth: Can reinstate equals its rows and jumps to them (#3094)`, async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await serve(page, { reports, rollups })
    await page.setViewportSize({ width: 1280, height: 900 })
    await load(page, url, '.growth-funnel__stage')
    const card = page.getByTestId('growth-stage-reinstate')
    const value = Number(
      await card.locator('.growth-funnel__value').textContent()
    )
    const rows = page.locator(
      '[data-testid="rollup-growth-reinstate-table"] tbody tr'
    )
    const sums = await rows.evaluateAll(trs =>
      trs.map(tr =>
        Array.from(tr.querySelectorAll('td'))
          .slice(0, 2)
          .reduce((s, td) => s + Number(td.textContent), 0)
      )
    )
    expect(sums.reduce((a, b) => a + b, 0)).toBe(value)
    await card.getByRole('link').click()
    await expect(page).toHaveURL(/#growth-reinstate$/)
    await expect(page.locator('#growth-reinstate-heading')).toBeInViewport()
  })

  test(`${label} growth without the reinstate file: four cards, no shift (#3094)`, async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await serve(page, { reports, rollups, reinstate: false })
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.addInitScript(() => {
      ;(window as unknown as { __cls: number }).__cls = 0
      new PerformanceObserver(list => {
        for (const e of list.getEntries() as unknown as {
          value: number
          hadRecentInput: boolean
        }[]) {
          if (!e.hadRecentInput) {
            ;(window as unknown as { __cls: number }).__cls += e.value
          }
        }
      }).observe({ type: 'layout-shift', buffered: true })
    })
    await load(page, url, '.growth-funnel__stage')
    const funnel = page.getByRole('list', { name: 'Club Growth funnel' })
    await expect(funnel.getByRole('listitem')).toHaveCount(4)
    await expect(page.locator('#growth-reinstate')).toHaveCount(0)
    const strip = await page.evaluate(() => {
      const el = document.querySelector('.growth-funnel')
      return el ? el.getBoundingClientRect().height : 0
    })
    expect(strip).toBeGreaterThan(0)
    const cls = await page.evaluate(
      () => (window as unknown as { __cls: number }).__cls
    )
    expect(cls).toBeLessThan(0.1)
  })
}
