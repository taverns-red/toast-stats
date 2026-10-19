import { test, expect, type Page } from './fixtures/test'
import reports from '../src/__tests__/fixtures/reports-rollups-2026-10-15.recorded.json' with { type: 'json' }
import rollups from '../src/__tests__/fixtures/region-rollups-2026-10-15.recorded.json' with { type: 'json' }

/* Region and world Club Growth funnels (#1812, #1813) — measured on the
 * deployed preview (BASE_URL) at 375, 768 and 1280, light and dark.
 *
 * `reports-rollups.json` is not on any CDN until #2117 lands and a pipeline
 * run writes it, so every test serves the recorded files (the #2117 builder
 * over the recorded prod 2026-10-15 sidecars of Regions 05 and 09; the
 * recorded prod region-rollups of that date) by route interception, or a
 * 404 to hold the "not available yet" state. */

const REGION = '/region/05/growth'
const WORLD = '/regions/growth'
const STAGES = ['prospective', 'chartered', 'coached', 'suspended'] as const

async function serve(
  page: Page,
  files: { reports: unknown | null; rollups: unknown | null }
): Promise<void> {
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
      test(`${label} growth at ${width} (${theme}): four stages, drill-down, no overflow`, async ({
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
        expect(texts).toHaveLength(4)
        texts.forEach(t => expect(t).toMatch(/\d/))

        // Every stage drills down to the level below, at the same stage.
        for (const stage of STAGES) {
          const section = page.locator(`#growth-${stage}`)
          const link = section.getByRole('link', { name: new RegExp(child) })
          await expect(link.first()).toHaveAttribute(
            'href',
            new RegExp(`/growth(\\?[^#]*)?#growth-${stage}$`)
          )
        }

        // Counts only: no person data.
        const text = (await page.locator('.growth-page').textContent()) ?? ''
        expect(text).not.toMatch(/@|\+\d{10,}/)

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
