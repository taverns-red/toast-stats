import { test, expect, type Page } from './fixtures/test'

/* Landing and region layout on phones, and the shell footer (#2653,
 * Fable 5.2 UX review LAND-04, LAND-13b, LAND-18, CHR-28, decisions D2 and
 * D11).
 *
 * Measured on the deployed preview (BASE_URL) by bounding box: jsdom has no
 * layout (Lesson 134). Every test waits for a content sentinel first, so a
 * blank or still-loading page cannot pass vacuously. */

const PHONE = { width: 375, height: 640 }

async function load(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready)
}

/** Top of the bottom section bar, or the viewport bottom when there is none. */
async function bottomEdge(page: Page): Promise<number> {
  return page.evaluate(() => {
    const bar = document.querySelector('[data-testid$="section-bar"]')
    const r = bar?.getBoundingClientRect()
    return r && r.height > 0 ? Math.round(r.top) : window.innerHeight
  })
}

test('/region/04 on a phone: the rankings table starts within 2 screens', async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await load(page, '/region/04')
  await page
    .locator('tbody tr')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
  const top = await page.evaluate(() => {
    const t = document.querySelector('table[aria-label*="district rankings"]')
    return t ? Math.round(t.getBoundingClientRect().top + window.scrollY) : null
  })
  expect(top, 'rankings table not found').not.toBeNull()
  expect(
    top!,
    `rankings table top y=${top} must be within 2 screens (${2 * PHONE.height})`
  ).toBeLessThanOrEqual(2 * PHONE.height)
})

test('/region/04 on a phone: KPIs are a 2x2 grid and recognition is collapsed', async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await load(page, '/region/04')
  const cards = page.locator('[aria-label="Region totals"] .districts-kpi-card')
  await expect(cards).toHaveCount(4)
  const tops = await cards.evaluateAll(els =>
    els.map(e => Math.round(e.getBoundingClientRect().top))
  )
  expect(new Set(tops).size, `KPI card tops ${tops}`).toBe(2)

  const recognition = page.getByTestId('region-recognition')
  await expect(recognition).toBeVisible()
  await expect(page.getByTestId('recognition-tier').first()).toBeHidden()
  await recognition.locator('summary').click()
  await expect(page.getByTestId('recognition-tier').first()).toBeVisible()
})

test('/regions on a phone: a row is visible above the bottom nav', async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await load(page, '/regions')
  const row = page
    .locator('table[aria-label="Region rankings"] tbody tr')
    .first()
  await row.waitFor({ state: 'visible', timeout: 30_000 })
  const edge = await bottomEdge(page)
  const box = await row.boundingBox()
  expect(box, 'no row box').not.toBeNull()
  expect(
    box!.y + box!.height,
    `first row bottom ${box!.y + box!.height} must be above the bottom nav (${edge})`
  ).toBeLessThanOrEqual(edge)
})

test('/regions on a phone uses the compact context bar', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await load(page, '/regions')
  await expect(page.locator('.context-bar').first()).toBeVisible()
  await expect(page.locator('.districts-page-header__lede')).toBeHidden()
})

for (const width of [768, 1280]) {
  test(`footer does not end a line with a dangling "·" at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await load(page, '/regions')
    await page.locator('footer').waitFor({ state: 'visible' })
    const dangling = await page.evaluate(() => {
      const footer = document.querySelector('footer')!
      const walker = document.createTreeWalker(footer, NodeFilter.SHOW_TEXT)
      const chars: { ch: string; top: number; bottom: number }[] = []
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent ?? ''
        for (let i = 0; i < text.length; i++) {
          if (/\s/.test(text[i]!)) continue
          const range = document.createRange()
          range.setStart(n, i)
          range.setEnd(n, i + 1)
          const r = range.getClientRects()[0]
          if (r) chars.push({ ch: text[i]!, top: r.top, bottom: r.bottom })
        }
      }
      const bad: string[] = []
      chars.forEach((c, i) => {
        if (c.ch !== '·') return
        const next = chars[i + 1]
        // The next visible character sits on a lower line: the "·" ends one.
        if (next && next.top >= c.bottom - 2) bad.push(`${i}`)
      })
      return bad
    })
    expect(dangling, 'a "·" ends a footer line').toEqual([])
  })
}

test('World pulse with no rollups file has no horizontal overflow at 375px', async ({
  page,
}) => {
  // A date with no region-rollups.json reads "Not available" in every tile.
  // The CDN fixtures hold no snapshot for an arbitrary past date, so rather
  // than pin one, answer the rollups read with a 404 (a page route wins over
  // the fixture's context route and nothing reaches the network).
  await page.route('**/region-rollups.json', route =>
    route.fulfill({
      status: 404,
      headers: { 'access-control-allow-origin': '*' },
      body: '',
    })
  )
  await page.setViewportSize({ width: 375, height: 812 })
  await load(page, '/')
  const pulse = page.locator('.world-pulse')
  await expect(pulse).toBeVisible({ timeout: 30_000 })
  // Not vacuous: the tiles really are in the absent-figure state.
  await expect(pulse.getByText('Not available')).toHaveCount(3)
  const m = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const card = document.querySelector('.world-pulse') as HTMLElement
    const over = [...card.querySelectorAll<HTMLElement>('*')]
      .filter(el => el.getBoundingClientRect().right > vw + 0.5)
      .map(el => el.className)
    return {
      vw,
      page: document.documentElement.scrollWidth,
      card: card.scrollWidth,
      cardClient: card.clientWidth,
      over,
    }
  })
  expect(m.page, JSON.stringify(m)).toBeLessThanOrEqual(m.vw)
  expect(m.card, JSON.stringify(m)).toBeLessThanOrEqual(m.cardClient)
  expect(m.over, JSON.stringify(m)).toEqual([])
})

test('Red Vote on a phone: one line near the top, the full block below the rankings (D2)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await load(page, '/')
  const line = page.getByTestId('red-vote-line')
  const block = page.getByTestId('red-vote-block')
  const rankings = page.getByRole('heading', { name: 'District Rankings' })
  await expect(line).toBeVisible({ timeout: 30_000 })
  await expect(line.getByRole('link')).toBeVisible()
  const lineBox = await line.boundingBox()
  expect(lineBox!.height, 'one line plus a CTA').toBeLessThanOrEqual(72)
  expect(lineBox!.y, 'near the top').toBeLessThanOrEqual(812)
  const blockBox = await block.boundingBox()
  const rankBox = await rankings.boundingBox()
  expect(blockBox!.y, 'the full block follows the rankings').toBeGreaterThan(
    rankBox!.y
  )
})

test('Red Vote on desktop: the full block stays above the toolbar, no phone line (D2)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await load(page, '/')
  await expect(page.getByTestId('red-vote-block')).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByTestId('red-vote-line')).toHaveCount(0)
  const blockBox = await page.getByTestId('red-vote-block').boundingBox()
  const rankBox = await page
    .getByRole('heading', { name: 'District Rankings' })
    .boundingBox()
  expect(blockBox!.y).toBeLessThan(rankBox!.y)
})

test('/regions counts regions with the unassigned districts (D11)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await load(page, '/regions')
  await page.locator('table[aria-label="Region rankings"]').waitFor()
  const text = await page.locator('main, #root').first().innerText()
  // innerText follows the eyebrow's text-transform, so match without case.
  expect(text).toMatch(/14 regions \+ \d+ districts? not assigned/i)
  expect(text).not.toMatch(/14 worldwide/i)
})
