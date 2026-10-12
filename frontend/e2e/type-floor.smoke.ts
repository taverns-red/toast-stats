import { test, expect, type Page } from '@playwright/test'

/* Phone type floor at 375 (#1840, epic #1827).
 *
 * The 2026-10-11 mobile review found 40–90% of visible characters under 14px
 * on 15 of 25 routes: the 16px ≤640 body rule is undercut by `text-xs`,
 * `text-[11px]`, ~80 component rules at 10–13px and 10px chart ticks. The
 * target (review §7) is ≤15% of visible characters under 14px on every route,
 * with 12px reserved for uppercase eyebrows/labels — so nothing visible may
 * render under 12px at all.
 *
 * Method mirrors the review's `summarize.mjs text`: every non-empty text node
 * whose parent is rendered, counted by character at the parent's computed
 * font-size. Visually hidden text (sr-only: a ≤1px box) is not "visible
 * characters" and is skipped. Font size does not depend on theme, so one
 * theme; both engines (the `smoke`/`webkit` projects).
 */

const VIEWPORT = { width: 375, height: 812 }
const MAX_SHARE_UNDER_14 = 0.15
const HARD_FLOOR_PX = 12

// Every route the review and the 2.48.0 prod sweep measured.
const ROUTES = [
  '/',
  '/district/61',
  '/district/61/clubs',
  '/district/61/divisions',
  '/district/61/rankings',
  '/district/61/trends',
  '/district/61/analytics',
  '/district/61/changes',
  '/district/61/grid',
  '/district/61/action-list',
  '/district/61/division/A',
  '/district/61/division/A/area/01',
  '/district/61/club/1009147',
  '/district/61/club/7238597/history',
  '/district/80',
  '/regions',
  '/region/05',
  '/history',
  '/methodology',
  '/awards',
  '/clubs',
  '/clubs/race/distinguished',
  '/mcp',
]

interface TextStats {
  total: number
  under14: number
  offenders: string[] // grouped "<px>px <el> ×n "sample"" for < 14px
  belowFloor: string[] // same, for < HARD_FLOOR_PX
}

async function measureText(page: Page, floor: number): Promise<TextStats> {
  return page.evaluate(floorPx => {
    const groups = new Map<string, { n: number; chars: number; ex: string }>()
    const below = new Map<string, number>()
    let total = 0
    let under14 = 0
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    )
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent || '').trim()
      if (!text) continue
      const el = n.parentElement
      if (!el) continue
      const cs = getComputedStyle(el)
      if (
        cs.display === 'none' ||
        cs.visibility === 'hidden' ||
        cs.opacity === '0'
      )
        continue
      const r = el.getBoundingClientRect()
      if (r.width <= 1 || r.height <= 1) continue // sr-only / collapsed
      const px = parseFloat(cs.fontSize)
      total += text.length
      if (px >= 14) continue
      under14 += text.length
      const cls = (el.getAttribute('class') || '')
        .split(/\s+/)
        .slice(0, 2)
        .join('.')
      const key = `${Math.round(px * 10) / 10}px ${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`
      const g = groups.get(key) || { n: 0, chars: 0, ex: text.slice(0, 24) }
      g.n++
      g.chars += text.length
      groups.set(key, g)
      if (px < floorPx) below.set(key, (below.get(key) || 0) + 1)
    }
    const fmt = ([k, g]: [string, { n: number; chars: number; ex: string }]) =>
      `${k} ×${g.n} (${g.chars}c) "${g.ex}"`
    const sorted = [...groups.entries()].sort((a, b) => b[1].chars - a[1].chars)
    return {
      total,
      under14,
      offenders: sorted.slice(0, 12).map(fmt),
      belowFloor: sorted.filter(([k]) => below.has(k)).map(fmt),
    }
  }, floor)
}

for (const path of ROUTES) {
  test(`≤15% of text under 14px, none under 12px, at 375 — ${path}`, async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await page.setViewportSize(VIEWPORT)
    await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
    await page.evaluate(() => document.fonts.ready)
    // Content-ready + non-vacuity: chrome alone is ~100 characters, so wait
    // for the route's data to render before measuring.
    await expect
      .poll(async () => (await measureText(page, HARD_FLOOR_PX)).total, {
        timeout: 30_000,
      })
      .toBeGreaterThan(300)
    await page.waitForTimeout(500)

    const s = await measureText(page, HARD_FLOOR_PX)
    const share = s.under14 / s.total
    expect(
      s.belowFloor,
      `${path}: text under ${HARD_FLOOR_PX}px: ${s.belowFloor.join('; ')}`
    ).toEqual([])
    expect(
      share,
      `${path}: ${(share * 100).toFixed(1)}% of ${s.total} visible characters ` +
        `are under 14px (max ${MAX_SHARE_UNDER_14 * 100}%). Largest: ` +
        s.offenders.join('; ')
    ).toBeLessThanOrEqual(MAX_SHARE_UNDER_14)
  })
}
