import { test, expect, type Page } from './fixtures/test'

/* KPI figures share a baseline (#2649, Fable 5.2 UX review HUB-06).
 *
 * When a tile label wraps to two lines the value used to drop ~21px below its
 * neighbours' ("Members with an award" 55px vs "Awards this year" 34px at
 * 375). In every row of a KPI strip, the figures must start at the same
 * height (±1px), at 375, 768 and 1280, on the three tile families the review
 * measured: education, meetings and survival. */

const ROUTES = [
  { name: 'education', url: '/district/61/education', ready: '.education-kpi' },
  { name: 'meetings', url: '/district/61/meetings', ready: '.meetings-kpi' },
  {
    name: 'survival',
    url: '/district/61/growth/survival',
    ready: '.survival-kpi',
  },
] as const

async function rowSpreads(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const spreads: number[] = []
    const strips = document.querySelectorAll<HTMLElement>('ul[class$="-kpis"]')
    for (const strip of strips) {
      const rows = new Map<number, number[]>()
      for (const tile of Array.from(strip.children)) {
        const value = tile.querySelector<HTMLElement>('[class*="-kpi__value"]')
        if (!value) continue
        const rowTop = Math.round(tile.getBoundingClientRect().top)
        const tops = rows.get(rowTop) ?? []
        tops.push(value.getBoundingClientRect().top)
        rows.set(rowTop, tops)
      }
      for (const tops of rows.values()) {
        if (tops.length > 1) spreads.push(Math.max(...tops) - Math.min(...tops))
      }
    }
    return spreads
  })
}

for (const width of [375, 768, 1280] as const) {
  for (const route of ROUTES) {
    test(`${route.name} KPI figures share a baseline at ${width}`, async ({
      page,
    }) => {
      test.setTimeout(180_000)
      await page.setViewportSize({ width, height: 900 })
      await page.goto(route.url, { waitUntil: 'networkidle', timeout: 120_000 })
      await page.locator(route.ready).first().waitFor({ timeout: 90_000 })
      await page.evaluate(() => document.fonts.ready)
      const spreads = await rowSpreads(page)
      expect(spreads.length).toBeGreaterThan(0)
      for (const s of spreads) expect(s).toBeLessThanOrEqual(1)
    })
  }
}

/* A row reserves label height only when one of its labels wraps (#2649).
 * In a row where every label is one line, each label box is no taller than
 * its text (within 2px). Returns the extra height per label of such rows. */
async function oneLineLabelSlack(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const slack: number[] = []
    const strips = document.querySelectorAll<HTMLElement>('ul[class$="-kpis"]')
    for (const strip of strips) {
      const rows = new Map<
        number,
        { box: number; text: number; lines: number }[]
      >()
      for (const tile of Array.from(strip.children)) {
        const label = tile.querySelector<HTMLElement>('[class*="-kpi__label"]')
        if (!label) continue
        const range = document.createRange()
        range.selectNodeContents(label)
        const rects = Array.from(range.getClientRects())
        const lines = new Set(rects.map(r => Math.round(r.top))).size
        const text = Math.max(...rects.map(r => r.height))
        const rowTop = Math.round(tile.getBoundingClientRect().top)
        const row = rows.get(rowTop) ?? []
        row.push({ box: label.getBoundingClientRect().height, text, lines })
        rows.set(rowTop, row)
      }
      for (const row of rows.values()) {
        if (row.every(l => l.lines === 1)) {
          for (const l of row) slack.push(l.box - l.text)
        }
      }
    }
    return slack
  })
}

for (const width of [375, 768, 1280] as const) {
  for (const route of ROUTES) {
    test(`${route.name} one-line label rows reserve no extra height at ${width}`, async ({
      page,
    }) => {
      test.setTimeout(180_000)
      await page.setViewportSize({ width, height: 900 })
      await page.goto(route.url, { waitUntil: 'networkidle', timeout: 120_000 })
      await page.locator(route.ready).first().waitFor({ timeout: 90_000 })
      await page.evaluate(() => document.fonts.ready)
      const slack = await oneLineLabelSlack(page)
      // Education wraps in every row below 1280; it has no one-line row there.
      if (width === 1280 || route.name !== 'education') {
        expect(slack.length).toBeGreaterThan(0)
      }
      for (const s of slack) expect(s).toBeLessThanOrEqual(2)
    })
  }
}
