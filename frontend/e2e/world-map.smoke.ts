import { test, expect, type Page } from './fixtures/test'

/* World club explorer (#1809) at /regions/map on the deployed preview
 * (BASE_URL): the real staging clubs-by-region files and the real basemap.
 *
 *  - every width and theme: the summary, the top-50 list, no sideways
 *    scroll, rows ≥ 44 px, the theme applied;
 *  - 375: the list renders from world.json alone — no region shard is
 *    requested before the first 50 rows (#1809: ≤ 150 KB of data before them);
 *    the Map button opens the full-screen map, which then loads the shards;
 *  - 768 / 1280: the map loads every shard in parallel and draws the world
 *    (the status line counts > 10k clubs), with no CSP / worker / WebGL error;
 *  - online-only clubs (#2174): every region shard is intercepted, the real
 *    `meetsOnline` flags (written since #2175 / #2201) are stripped and three
 *    rows of one shard flagged, so the legend shows "3 online clubs" whatever
 *    the live data holds.
 */

const WORLD = '/regions/map'
const SHARD_RE = /\/clubs-by-region\/(?!world)[\w-]+\.json$/

async function open(
  page: Page,
  url: string,
  theme: 'light' | 'dark',
  width: number
): Promise<{ errors: string[]; shards: string[]; bytes: () => number }> {
  const errors: string[] = []
  const ours = /pmtiles|maplibre|worker|Content Security Policy|WebGL/i
  page.on('console', msg => {
    if (msg.type() === 'error' && ours.test(msg.text())) errors.push(msg.text())
  })
  page.on('pageerror', err => {
    if (ours.test(`${err.message} ${err.stack ?? ''}`)) errors.push(err.message)
  })
  const shards: string[] = []
  let wire = 0
  page.on('request', r => {
    if (SHARD_RE.test(new URL(r.url()).pathname)) shards.push(r.url())
  })
  // Data wire only (the CDN's snapshots / v1 / config files): the app's
  // own JS and fonts are the Lighthouse budget's, not this page's.
  page.on('requestfinished', async r => {
    if (!/\/(snapshots|v1|config)\//.test(new URL(r.url()).pathname)) return
    const s = await r.sizes().catch(() => null)
    if (s) wire += s.responseBodySize + s.responseHeadersSize
  })
  await page.emulateMedia({ colorScheme: theme })
  await page.addInitScript(t => {
    try {
      window.localStorage.setItem('theme', t)
    } catch {
      // storage blocked: the page falls back to the system theme
    }
  }, theme)
  await page.setViewportSize({ width, height: width < 768 ? 812 : 900 })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  return { errors, shards, bytes: () => wire }
}

const rows = (page: Page) =>
  page
    .getByRole('list', { name: /^Top clubs by members/ })
    .getByTestId('mobile-row')

const layout = (page: Page) =>
  page.evaluate(() => {
    const rs = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="mobile-row"]')
    ).map(e => e.getBoundingClientRect())
    return {
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      smallRows: rs.filter(r => r.height < 44).length,
      bg: getComputedStyle(document.body).backgroundColor,
    }
  })

const lum = (rgb: string) => {
  const [r, g, b] = (rgb.match(/\d+/g) ?? ['0', '0', '0']).map(Number)
  return (r! + g! + b!) / 3
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [375, 768, 1280] as const) {
    test(`world map at ${width} (${theme}): summary, top 50, map`, async ({
      page,
    }) => {
      test.setTimeout(120_000)
      const { errors, shards, bytes } = await open(page, WORLD, theme, width)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expect(page.getByTestId('world-map-summary')).toBeVisible({
        timeout: 30_000,
      })
      await expect(rows(page)).toHaveCount(50, { timeout: 30_000 })

      if (width < 768) {
        // The phone's list never needed a shard.
        expect(shards).toEqual([])
        expect(bytes()).toBeLessThan(150 * 1024)
      }

      const m = await layout(page)
      expect(m.overflow).toBeLessThanOrEqual(0)
      expect(m.smallRows).toBe(0)
      if (theme === 'dark') expect(lum(m.bg)).toBeLessThan(80)
      else expect(lum(m.bg)).toBeGreaterThan(180)

      if (width < 768)
        await page.getByRole('link', { name: 'Map', exact: true }).click()
      const map = page.getByRole('region', {
        name: 'World club map, coloured by club health',
      })
      await expect(map.locator('canvas.maplibregl-canvas')).toBeVisible({
        timeout: 30_000,
      })
      // Every shard settled and the world is on the map.
      await expect(
        page.locator('.region-map__canvas:not([aria-busy])')
      ).toBeVisible({ timeout: 60_000 })
      expect(shards.length).toBeGreaterThanOrEqual(14)
      const status = await page
        .getByRole('status')
        .filter({
          hasText: /^Showing \d+ of \d+ clubs$/,
        })
        .textContent()
      const shown = Number(/^Showing (\d+)/.exec(status ?? '')?.[1] ?? 0)
      expect(shown).toBeGreaterThan(10_000)
      await expect(map.locator('.maplibregl-ctrl-attrib')).toBeVisible()
      expect(errors).toEqual([])
    })
  }
}

test('world map: ?region= loads only that shard', async ({ page }) => {
  test.setTimeout(90_000)
  const { shards } = await open(page, `${WORLD}?region=05`, 'light', 1280)
  await expect(
    page.locator('.region-map__canvas:not([aria-busy])')
  ).toBeVisible({ timeout: 60_000 })
  expect(shards.map(u => new URL(u).pathname.split('/').pop())).toEqual([
    '05.json',
  ])
})

test('world map: online-only clubs get the online clubs chip', async ({
  page,
}) => {
  test.setTimeout(90_000)
  // The count is fully the test's: every shard loses its live flags, and
  // shard 05's first three rows are flagged (#2175 writes real ones).
  const routed: string[] = []
  await page.route(
    url => SHARD_RE.test(url.pathname),
    async route => {
      const res = await route.fetch()
      const body = (await res.json()) as { clubs: Record<string, unknown>[] }
      const flag = new URL(route.request().url()).pathname.endsWith('/05.json')
      body.clubs = body.clubs.map((c, i) => {
        const { meetsOnline: _live, ...rest } = c
        return flag && i < 3 ? { ...rest, meetsOnline: true } : rest
      })
      routed.push(route.request().url())
      await route.fulfill({ response: res, json: body })
    }
  )
  const { shards } = await open(page, WORLD, 'light', 1280)
  await expect(
    page.locator('.region-map__canvas:not([aria-busy])')
  ).toBeVisible({ timeout: 60_000 })
  // Every shard the page read went through the route above.
  expect(shards.length).toBeGreaterThanOrEqual(14)
  expect(routed.length).toBe(shards.length)
  await expect(
    page.getByRole('button', { name: /^3 online clubs$/ })
  ).toBeVisible({ timeout: 60_000 })
})
