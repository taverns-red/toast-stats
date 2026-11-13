import { test, expect, type Page } from './fixtures/test'

/* The InfoTooltip trigger must add no height to the line it sits in (#2644).
 *
 * It used to be floored at 44px by base.css, so a 14px icon inflated the
 * landing KPI label to 49px (17px on /region/04) and the Awards Race heading
 * to 50px; `.tooltip-reserve` papered over that in the skeletons. The trigger
 * now keeps its 44px hit area in an ::after instead, and `.tooltip-reserve` is
 * gone, which is only safe if the loaded line is no taller than the skeleton
 * that stands in for it. jsdom has no layout, so this measures it live:
 *
 *  - every loaded KPI label is <= 24px tall and matches its skeleton label;
 *  - the loaded Awards Race header matches its skeleton header;
 *  - the landing Paid Clubs card matches the region page's, within 2px.
 *
 * Each state is held with route gating so it is provably the one measured
 * (cf. landing-mobile-cls.smoke.ts). If the loaded line is ever a pixel
 * taller than its skeleton, restore a reserve rather than loosening this. */

const DESKTOP = { width: 1280, height: 900 }
const LABEL_MAX_PX = 24
const TOLERANCE_PX = 1
const CARD_TOLERANCE_PX = 2

const RANKINGS_GLOB = '**/*rankings.json'
const AWARDS_GLOB = '**/*competitive-awards.json'

async function heights(page: Page, selector: string): Promise<number[]> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  return page
    .locator(selector)
    .evaluateAll(els => els.map(e => e.getBoundingClientRect().height))
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize(DESKTOP)
})

test('landing KPI labels are no taller loaded than in the skeleton, and <= 24px', async ({
  page,
}) => {
  let release: (() => void) | undefined
  const gate = new Promise<void>(r => (release = r))
  await page.route(RANKINGS_GLOB, async route => {
    await gate
    await route.fallback()
  })

  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await expect(
    page.getByRole('status', { name: /loading district rankings/i })
  ).toBeVisible({ timeout: 30_000 })
  const skeleton = await heights(page, '.districts-kpi-card__label')
  expect(skeleton.length, 'no skeleton KPI labels').toBeGreaterThan(0)

  release?.()
  await expect(page.getByTestId('kpi-paid-clubs')).toHaveText(/\d/, {
    timeout: 30_000,
  })
  const loaded = await heights(page, '.districts-kpi-card__label')
  expect(loaded.length).toBe(skeleton.length)

  loaded.forEach((h, i) => {
    expect(h, `loaded KPI label ${i} is ${h}px`).toBeLessThanOrEqual(
      LABEL_MAX_PX
    )
    expect(
      Math.abs(h - skeleton[i]!),
      `KPI label ${i}: skeleton ${skeleton[i]}px vs loaded ${h}px`
    ).toBeLessThanOrEqual(TOLERANCE_PX)
  })
})

test('the Awards Race header is no taller loaded than in its skeleton', async ({
  page,
}) => {
  let release: (() => void) | undefined
  const gate = new Promise<void>(r => (release = r))
  await page.route(AWARDS_GLOB, async route => {
    await gate
    await route.fallback()
  })

  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page
    .getByTestId('awards-race-skeleton')
    .waitFor({ state: 'visible', timeout: 30_000 })
  const [skeleton] = await heights(
    page,
    '[data-testid="awards-race-skeleton"] .awards-race__header'
  )
  expect(skeleton, 'no skeleton Awards Race header').toBeDefined()

  release?.()
  await page
    .locator('section.awards-race:not([data-testid="awards-race-skeleton"])')
    .waitFor({ state: 'visible', timeout: 30_000 })
  const [loaded] = await heights(
    page,
    'section.awards-race:not([data-testid="awards-race-skeleton"]) .awards-race__header'
  )
  expect(
    Math.abs(loaded! - skeleton!),
    `Awards Race header: skeleton ${skeleton}px vs loaded ${loaded}px`
  ).toBeLessThanOrEqual(TOLERANCE_PX)
})

test('landing and region Paid Clubs cards measure the same, within 2px', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await expect(page.getByTestId('kpi-paid-clubs')).toHaveText(/\d/, {
    timeout: 30_000,
  })
  const [landing] = await heights(
    page,
    '.districts-kpi-strip .districts-kpi-card:first-child'
  )
  const [landingLabel] = await heights(
    page,
    '.districts-kpi-strip .districts-kpi-card:first-child .districts-kpi-card__label'
  )

  await page.goto('/region/04', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  })
  const region = page.locator(
    '[aria-label="Region totals"] .districts-kpi-card:has(.districts-kpi-card__label:text-is("Paid Clubs"))'
  )
  await region.waitFor({ state: 'visible', timeout: 30_000 })
  const [regionCard] = await heights(
    page,
    '[aria-label="Region totals"] .districts-kpi-card:has(.districts-kpi-card__label:text-is("Paid Clubs"))'
  )
  const [regionLabel] = await heights(
    page,
    '[aria-label="Region totals"] .districts-kpi-card:has(.districts-kpi-card__label:text-is("Paid Clubs")) .districts-kpi-card__label'
  )

  expect(
    Math.abs(landingLabel! - regionLabel!),
    `label: landing ${landingLabel}px vs region ${regionLabel}px`
  ).toBeLessThanOrEqual(CARD_TOLERANCE_PX)
  expect(
    Math.abs(landing! - regionCard!),
    `card: landing ${landing}px vs region ${regionCard}px`
  ).toBeLessThanOrEqual(CARD_TOLERANCE_PX)
})
