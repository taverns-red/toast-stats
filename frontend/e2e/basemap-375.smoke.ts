import { test, expect, type Page, type Route } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/* Self-hosted basemap at 375 px (#1786, ADR-016).
 *
 * The district club map (/district/61/map, #1784) draws the Protomaps
 * basemap through MapLibre + the pmtiles protocol. Until Ron uploads the real archive
 * (operator step in the PR), every `*.pmtiles` request is answered from the
 * committed z0 fixture by a handler that honours HTTP Range exactly as GCS
 * and Cloud CDN do (206 + Content-Range, Accept-Ranges, a strong ETag). Set
 * BASEMAP_LIVE=1 after the upload to drive the real object instead; then the
 * same assertions check the bucket's CORS and the CDN's range responses.
 *
 * Checked in light and dark: the map canvas renders inside the 375 viewport
 * with no horizontal page scroll, the archive is read with range requests
 * (header, then tile bytes), the ODbL credit is visible and expanded, and
 * no console error is raised (a CSP or CORS block surfaces there).
 */

const FIXTURE = readFileSync(
  resolve(process.cwd(), 'e2e/fixtures/basemap-z0.pmtiles')
)
const LIVE = process.env['BASEMAP_LIVE'] === '1'

interface Seen {
  ranges: string[]
  statuses: number[]
}

async function serveFixture(route: Route, seen: Seen): Promise<void> {
  const req = route.request()
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'range, if-match',
    'access-control-expose-headers':
      'content-range, content-length, etag, accept-ranges',
  }
  if (req.method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: cors })
    return
  }
  const range = req.headers()['range']
  const etag = '"fixture-basemap-z0"'
  const base = {
    ...cors,
    'accept-ranges': 'bytes',
    'content-type': 'application/octet-stream',
    etag,
  }
  const m = range ? /^bytes=(\d+)-(\d*)$/.exec(range) : null
  if (!m) {
    seen.statuses.push(200)
    await route.fulfill({ status: 200, headers: base, body: FIXTURE })
    return
  }
  seen.ranges.push(range!)
  const start = Number(m[1])
  const end = Math.min(
    m[2] ? Number(m[2]) : FIXTURE.length - 1,
    FIXTURE.length - 1
  )
  seen.statuses.push(206)
  await route.fulfill({
    status: 206,
    headers: {
      ...base,
      'content-range': `bytes ${start}-${end}/${FIXTURE.length}`,
    },
    body: FIXTURE.subarray(start, end + 1),
  })
}

async function openBasemap(
  page: Page,
  theme: 'light' | 'dark'
): Promise<{ seen: Seen; errors: string[] }> {
  const seen: Seen = { ranges: [], statuses: [] }
  const errors: string[] = []
  // Only the basemap's own failures count: a data fetch the app shell makes
  // (e.g. v1/dates.json, CORS-blocked when this runs from localhost) is not
  // this test's subject. A CSP block names the directive in its message.
  const ours = /pmtiles|maplibre|worker|Content Security Policy/i
  page.on('console', msg => {
    if (msg.type() === 'error' && ours.test(msg.text())) errors.push(msg.text())
  })
  page.on('requestfailed', req => {
    if (ours.test(req.url()))
      errors.push(`${req.url()} ${req.failure()?.errorText}`)
  })
  page.on('pageerror', err => {
    if (ours.test(`${err.message} ${err.stack ?? ''}`)) errors.push(err.message)
  })
  if (LIVE) {
    page.on('response', res => {
      if (!res.url().endsWith('.pmtiles')) return
      const range = res.request().headers()['range']
      if (range) seen.ranges.push(range)
      seen.statuses.push(res.status())
    })
  } else {
    await page.route('**/*.pmtiles', route => serveFixture(route, seen))
  }
  await page.addInitScript(t => {
    try {
      window.localStorage.setItem('theme', t)
    } catch {
      // storage blocked: the page falls back to the system theme
    }
  }, theme)
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/district/61/map')
  return { seen, errors }
}

for (const theme of ['light', 'dark'] as const) {
  test(`basemap renders at 375 in ${theme} from range requests`, async ({
    page,
  }) => {
    const { seen, errors } = await openBasemap(page, theme)

    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    const region = page.getByRole('region', {
      name: 'Club map, coloured by club health',
    })
    await expect(region).toBeVisible()
    const canvas = region.locator('canvas.maplibregl-canvas')
    await expect(canvas).toBeVisible({ timeout: 15_000 })

    // Header first, then at least one tile read: both ranged, both 206.
    await expect
      .poll(() => seen.ranges.length, { timeout: 15_000 })
      .toBeGreaterThanOrEqual(2)
    expect(seen.ranges[0]).toMatch(/^bytes=0-\d+$/)
    expect(seen.statuses.every(s => s === 206)).toBe(true)

    // Inside the phone viewport, no sideways page scroll.
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(375)
    expect(box!.height).toBeGreaterThanOrEqual(300)
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)

    // ODbL: the credit is on screen and expanded (not the compact "i").
    const attrib = region.locator('.maplibregl-ctrl-attrib')
    await expect(attrib).toBeVisible()
    await expect(attrib).not.toHaveClass(/maplibregl-compact/)
    await expect(
      attrib.getByRole('link', { name: 'OpenStreetMap' })
    ).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright')
    const attribBox = await attrib.boundingBox()
    expect(attribBox!.x + attribBox!.width).toBeLessThanOrEqual(375)

    expect(errors).toEqual([])
  })
}
