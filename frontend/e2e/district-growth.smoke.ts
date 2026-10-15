import { test, expect, type Page } from './fixtures/test'

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
