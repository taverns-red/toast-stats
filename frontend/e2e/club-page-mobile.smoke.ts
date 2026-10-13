import { test, expect, type Page } from './fixtures/test'

/* Club page on the mobile primitives (#1843, mobile epic #1827 Phase 2,
 * review §6.3).
 *
 * ── The regression this guards ───────────────────────────────────────────
 * At 375 the club hero was 401px tall (prod 2.51.0, 2026-10-12): an 11px
 * eyebrow, a 28px two-line title, the where-it-meets list wrapping to three
 * lines, a "View multi-year history" link and an anniversary badge, so the
 * first stat sat below the fold. The review's budget is ≤ 200px: name (22px),
 * the area/division line, one where-it-meets line, the two status pills and
 * "Contact on toastmasters.org ↗". The history link becomes a row below the
 * panels, and a static mini-map (inline SVG from the snapshot's coordinates,
 * never a second MapLibre instance) links to the district club map.
 *
 * ── Method ───────────────────────────────────────────────────────────────
 * Deployed preview (BASE_URL), real D61 data, bounding boxes (Lesson 134).
 * Every network request is recorded, so "no MapLibre, no tiles, no
 * club-index.json on this route" is asserted, not assumed.
 */

const CLUB = '/district/61/club/7238597'
const HERO_MAX_H = 200
const MAP_MARKUP_MAX = 30 * 1024

async function load(page: Page, requests: string[]): Promise<void> {
  page.on('request', r => requests.push(r.url()))
  await page.goto(CLUB, { waitUntil: 'networkidle', timeout: 60_000 })
  // The full render (analytics landed): the health pill replaces its
  // placeholder.
  await page
    .locator('.club-hero__pill:not([data-testid="club-hero-pill-placeholder"])')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await page.waitForTimeout(300)
}

const unmask = (page: Page) =>
  page.addStyleTag({ content: 'html,body{overflow-x:visible !important}' })

for (const width of [375, 390]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`club hero ≤ ${HERO_MAX_H}px with the primitives at ${width} (${scheme})`, async ({
      page,
    }) => {
      const requests: string[] = []
      await page.emulateMedia({ colorScheme: scheme })
      await page.setViewportSize({ width, height: 812 })
      await load(page, requests)
      await unmask(page)

      const m = await page.evaluate(() => {
        const visible = (el: Element | null) => {
          if (!el) return false
          const r = el.getBoundingClientRect()
          return r.width > 0 && r.height > 0
        }
        const hero = document.querySelector('.club-hero')!
        const h1 = hero.querySelector('h1')!
        const stats = [...document.querySelectorAll('.club-stat')].map(el =>
          Math.round(el.getBoundingClientRect().height)
        )
        const historyRow = [
          ...document.querySelectorAll('a[href$="/club/7238597/history"]'),
        ].filter(visible)
        return {
          heroH: Math.round(hero.getBoundingClientRect().height),
          h1Px: parseFloat(getComputedStyle(h1).fontSize),
          heroHistoryVisible: visible(
            hero.querySelector('.club-hero__history-link')
          ),
          heroControlsVisible: visible(
            hero.querySelector('.club-hero__controls')
          ),
          pillsInHero: [...hero.querySelectorAll('.club-hero__pill')].filter(
            visible
          ).length,
          contactInHero: [...hero.querySelectorAll('a')].some(
            a =>
              visible(a) &&
              /Contact on toastmasters\.org/.test(a.textContent ?? '')
          ),
          historyRows: historyRow.length,
          historyRowH: historyRow[0]
            ? Math.round(historyRow[0].getBoundingClientRect().height)
            : 0,
          stats,
          docOverflow:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        }
      })

      expect(m.heroH, `hero height ${m.heroH}px`).toBeLessThanOrEqual(
        HERO_MAX_H
      )
      expect(m.h1Px).toBe(22)
      expect(m.heroControlsVisible).toBe(false)
      expect(m.heroHistoryVisible).toBe(false)
      expect(m.pillsInHero).toBeGreaterThanOrEqual(1)
      expect(m.contactInHero).toBe(true)
      // "View multi-year history" is a row below the panels.
      expect(m.historyRows).toBe(1)
      expect(m.historyRowH).toBeGreaterThanOrEqual(56)
      // Stat strip cells ≥ 56px.
      expect(m.stats.length).toBeGreaterThan(0)
      for (const h of m.stats) expect(h).toBeGreaterThanOrEqual(56)
      expect(m.docOverflow).toBe(0)

      test.info().annotations.push({
        type: 'hero-height',
        description: `${m.heroH}px at ${width} (${scheme})`,
      })
    })
  }
}

// The longest club name in D61 (51 characters) wraps to two lines at 22px
// on macOS and three on the Linux runner. The hero's chrome must fit the
// budget with a two-line name; each line past two is the name's own (an h1
// is never truncated), so it is allowed on top.
test(`club hero chrome ≤ ${HERO_MAX_H}px for the longest D61 club name at 375`, async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/district/61/club/9127', {
    waitUntil: 'networkidle',
    timeout: 60_000,
  })
  await page
    .locator('.club-hero__pill:not([data-testid="club-hero-pill-placeholder"])')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  const { heroH, extraTitle } = await page
    .locator('.club-hero')
    .evaluate(el => {
      const h1 = el.querySelector('h1')!
      const lineH = parseFloat(getComputedStyle(h1).lineHeight)
      const lines = Math.round(h1.getBoundingClientRect().height / lineH)
      return {
        heroH: Math.round(el.getBoundingClientRect().height),
        extraTitle: Math.max(0, lines - 2) * lineH,
      }
    })
  expect(
    heroH - extraTitle,
    `hero height ${heroH}px, ${extraTitle}px of it a third+ title line`
  ).toBeLessThanOrEqual(HERO_MAX_H)
  test.info().annotations.push({
    type: 'hero-height-long-name',
    description: `${heroH}px`,
  })
})

for (const width of [375, 1280]) {
  test(`static mini-map links to the club map without MapLibre at ${width}`, async ({
    page,
  }) => {
    const requests: string[] = []
    await page.setViewportSize({ width, height: 900 })
    await load(page, requests)

    const map = page.locator('.club-minimap')
    await map.scrollIntoViewIfNeeded()
    await expect(map).toBeVisible()
    const link = map.getByRole('link', { name: /on the District 61 club map/ })
    await expect(link).toHaveAttribute('href', '/district/61/map?club=7238597')
    const box = await link.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
    const markup = await map.evaluate(el => el.outerHTML.length)
    expect(markup).toBeLessThanOrEqual(MAP_MARKUP_MAX)
    test.info().annotations.push({
      type: 'mini-map-markup-bytes',
      description: String(markup),
    })

    const offenders = requests.filter(u =>
      /maplibre|pmtiles|\/basemap\/|config\/club-index\.json/i.test(u)
    )
    expect(offenders).toEqual([])
  })
}

test('the mini-map link opens the district map with the club selected', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1280, height: 900 })
  // The basemap streams range requests, so the network never idles here
  // (same load pattern as district-map.smoke.ts).
  await page.goto('/district/61/map?club=7238597', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  })
  await expect(
    page.getByRole('region', { name: 'Selected club' })
  ).toContainText('90 Elgin Toastmasters', { timeout: 30_000 })
})
