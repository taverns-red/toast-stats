import { test, expect, type Page } from './fixtures/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/* District Club Growth funnel (#1794, epic #1781) — measured on the deployed
 * preview (BASE_URL) at 375 (light + dark) and 1280:
 *
 *  - the funnel is an ordered list of four stages, each printing its value as
 *    text (a number or "Unknown"), never colour alone;
 *  - every stage links to its in-page club list, and the target exists;
 *  - prospective clubs link to toastmasters.org; chartered/coached clubs link
 *    to their club page here;
 *  - no contact data (email, phone, meeting links, passcodes) on the page;
 *  - ≥44px stage targets and zero document horizontal overflow at 375. */

const GROWTH = '/district/61/growth'
const STAGE = '.growth-funnel__stage'

async function load(page: Page): Promise<void> {
  await page.goto(GROWTH, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.locator(STAGE).first().waitFor({ timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready)
}

async function assertFunnel(page: Page): Promise<void> {
  const funnel = page.getByRole('list', { name: 'Club Growth funnel' })
  const stages = funnel.getByRole('listitem')
  await expect(stages).toHaveCount(4)
  const texts = await stages.allTextContents()
  const labels = ['Prospective', 'Chartered', 'Coached', 'Suspended']
  texts.forEach((t, i) => {
    expect(t).toContain(labels[i]!)
    expect(t).toMatch(/\d+|Unknown/)
  })
  const hrefs = await funnel
    .getByRole('link')
    .evaluateAll(as => as.map(a => a.getAttribute('href')))
  expect(hrefs).toEqual([
    '#growth-prospective',
    '#growth-chartered',
    '#growth-coached',
    '#growth-suspended',
  ])
  for (const h of hrefs) {
    await expect(page.locator(h!)).toHaveCount(1)
  }
}

async function assertPrivacy(page: Page): Promise<void> {
  const text = (await page.locator('.growth-page').textContent()) ?? ''
  expect(text).not.toMatch(/@|\+\d{10,}|passcode|zoom\.us|meet\.google/i)
  const external = await page
    .locator('.growth-page a[href^="http"]')
    .evaluateAll(as => as.map(a => a.getAttribute('href') ?? ''))
  for (const href of external) {
    expect(href).toMatch(/^https:\/\/www\.toastmasters\.org\/Find-a-Club\//)
  }
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`club growth at 375 (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize({ width: 375, height: 812 })
      await load(page)
      await page.addStyleTag({
        content: 'html,body{overflow-x:visible !important}',
      })
    })

    test('funnel values as text, linked stages, no overflow, 44px targets', async ({
      page,
    }) => {
      await assertFunnel(page)
      await assertPrivacy(page)
      const m = await page.evaluate(() => {
        const links = Array.from(
          document.querySelectorAll('.growth-funnel__link')
        ).map(a => a.getBoundingClientRect())
        const value = document.querySelector('.growth-funnel__value')
        const card = document.querySelector('.growth-funnel__link')
        return {
          small: links.filter(r => r.height < 44 || r.width < 44).length,
          overflow:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
          valueColor: value ? getComputedStyle(value).color : '',
          cardBg: card ? getComputedStyle(card).backgroundColor : '',
        }
      })
      expect(m.small).toBe(0)
      expect(m.overflow).toBeLessThanOrEqual(0)
      // Text and card surface remap together with the theme.
      expect(m.valueColor).not.toBe(m.cardBg)
      const dark = theme === 'dark'
      const lum = (rgb: string) => {
        const [r, g, b] = (rgb.match(/\d+/g) ?? ['0', '0', '0']).map(Number)
        return (r! + g! + b!) / 3
      }
      expect(lum(m.cardBg) < 128).toBe(dark)
    })

    test('a stage link jumps to its club list', async ({ page }) => {
      await page
        .getByRole('list', { name: 'Club Growth funnel' })
        .getByRole('link')
        .nth(2)
        .click()
      await expect(page).toHaveURL(/#growth-coached$/)
      await expect(
        page.getByRole('heading', { name: /Coached clubs/ })
      ).toBeInViewport()
    })
  })
}

test('club growth at 1280: four-across funnel and linked club rows', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await load(page)
  await assertFunnel(page)
  await assertPrivacy(page)
  const tops = await page
    .locator('.growth-funnel__link')
    .evaluateAll(as => as.map(a => Math.round(a.getBoundingClientRect().top)))
  expect(new Set(tops).size).toBe(1)
  const internal = await page
    .locator('.growth-page table a[href^="/district/61/club/"]')
    .count()
  const external = await page
    .locator('.growth-page table a[href^="https://www.toastmasters.org/"]')
    .count()
  // Live D61 data has prospective and coached clubs; either list proves the
  // link-through. Both are expected on today's data.
  expect(internal + external).toBeGreaterThan(0)
})

/* #1953 — the Suspended stage lists its clubs. D83 has suspensions this PY
 * on the recorded 2026-10-13 data (3 clubs); D61 has a measured zero. The
 * heading's count must equal the listed rows, and each row links to a club
 * page here or to toastmasters.org. */
for (const width of [375, 1280] as const) {
  test(`suspended stage lists its clubs at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/district/83/growth', {
      waitUntil: 'networkidle',
      timeout: 60_000,
    })
    const section = page.locator('#growth-suspended')
    await section.waitFor({ timeout: 30_000 })
    const heading =
      (await section.getByRole('heading').first().textContent()) ?? ''
    const count = Number(/\((\d+)\)/.exec(heading)?.[1] ?? NaN)
    expect(count).toBeGreaterThan(0)
    const rows = section.locator(
      width < 768 ? '[data-testid="mobile-row"]' : 'tbody tr'
    )
    await expect(rows).toHaveCount(count)
    const hrefs = await section
      .locator('a')
      .evaluateAll(as => as.map(a => a.getAttribute('href') ?? ''))
    for (const href of hrefs) {
      expect(href).toMatch(
        /^(\/district\/83\/club\/\d+|https:\/\/www\.toastmasters\.org\/Find-a-Club\/\d{8})$/
      )
    }
    await assertPrivacy(page)
  })
}

/* #1794 + #1795 — sponsor/mentor COUNTS under the Chartered stage.
 *
 * Live: the CDN gets the `sponsorsMentors` section from the first daily
 * after PR #2056 (2026-10-16). Until then the page must say the counts are
 * not available yet; after, it must list them. Either is a pass — the state
 * is read, not assumed.
 *
 * Populated: the reports response is augmented with the RECORDED section
 * (the real DistrictReportsBuilder over the live D61 2026-06-01 capture), so
 * the table and phone rows are measured on the preview before the data
 * lands: 6 clubs, no overflow, no raw TI code, no contact data. */
const SPONSORS_FIXTURE = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      'src/__tests__/fixtures/sponsors-mentors-2026-06-01.recorded.json'
    ),
    'utf8'
  )
) as { sponsorsMentors_2026_06_01: unknown }

const injectSponsors = (page: Page) =>
  page.route('**/district_61_reports.json', async route => {
    const res = await route.fetch()
    const body = await res.json()
    body.sections = {
      ...(body.sections ?? {}),
      sponsorsMentors: SPONSORS_FIXTURE.sponsorsMentors_2026_06_01,
    }
    await route.fulfill({
      status: res.status(),
      json: body,
      headers: { 'access-control-allow-origin': '*' },
    })
  })

test('sponsors and mentors: live state is either listed or not available yet', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await load(page)
  const section = page.locator('#growth-chartered')
  await expect(
    section.getByRole('heading', { name: 'Sponsors and mentors' })
  ).toBeVisible()
  const table = section.getByTestId('growth-sponsors-table')
  const text = (await section.textContent()) ?? ''
  if ((await table.count()) === 0) {
    expect(text).toMatch(/not available yet|No sponsor or mentor assignments/)
  } else {
    expect(text).toMatch(/\d+ sponsors? and \d+ mentors?/)
  }
})

for (const width of [375, 768, 1280] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`sponsors and mentors at ${width} (${theme}): recorded counts, no overflow`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize({ width, height: 900 })
      await injectSponsors(page)
      await load(page)
      await page.addStyleTag({
        content: 'html,body{overflow-x:visible !important}',
      })
      const section = page.locator('#growth-chartered')
      await expect(section).toContainText('11 sponsors and 9 mentors')
      await expect(section).toContainText('6 new clubs')
      const rows = section
        .getByTestId('growth-sponsors')
        .locator(width < 768 ? '[data-testid="mobile-row"]' : 'tbody tr')
      await expect(rows).toHaveCount(6)
      const text = (await section.textContent()) ?? ''
      expect(text).not.toMatch(/MENTORU|\bSPONSOR\b|\bMENTOR\b|AWARDED|PENDING/)
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      )
      expect(overflow).toBeLessThanOrEqual(0)
      await assertPrivacy(page)
    })
  }
}
