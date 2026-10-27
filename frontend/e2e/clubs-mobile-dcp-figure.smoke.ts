import { test, expect, type Page } from './fixtures/test'

/* The DCP figure on phone Clubs rows is whole at 320 px (#2340).
 *
 * Line 2 of a Clubs row (`ClubsTable` → MobileRowList, `chipPlacement="meta"`)
 * is the status pill and then "N/10 DCP". The "✕ Intervention" pill is wider
 * than "✓ Thriving" or "⚠ Vulnerable", and at 320 px it left the meta too
 * little room: "2/10 DCP" ellipsized to "2/10 …". 375 px and up fit.
 *
 * Measured on the deployed build (BASE_URL) by bounding box (Lesson 134), in
 * whatever font the runner has (CI's Linux fallback is wider than system-ui
 * on macOS), for one status per load (`?status=` flattens the list): the meta
 * shows all of its text (no ellipsis, inside line 2), the pill is whole, and
 * the #2331/#2338 row heights hold (one line 56–64 px, a wrapped name ≤ 82
 * px). The page never scrolls sideways with the `overflow-x:hidden` mask
 * off. */

const CLUBS = '/district/86/clubs'
const FLAT = 'ul[aria-label="Clubs"]'
const ROW = '[data-testid="mobile-row"]'

/** 2 title lines (2 × 22) + meta (20) + gap (2) + padding (16) — #2331. */
const WRAPPED_ROW_MAX = 82

async function load(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready)
}

interface RowGeometry {
  title: string
  meta: string
  metaClipped: boolean
  metaRight: number
  chipClipped: boolean
  chipRight: number
  line2Right: number
  lines: number
  height: number
  right: number
}

async function measure(page: Page) {
  await page.addStyleTag({
    content: 'html,body{overflow-x:visible !important}',
  })
  return page.evaluate(sel => {
    const rows: RowGeometry[] = Array.from(document.querySelectorAll(sel))
      .filter(el => el.getBoundingClientRect().height > 0)
      .map(row => {
        const t = row.querySelector('.mobile-row__title') as HTMLElement
        const meta = row.querySelector('.mobile-row__meta') as HTMLElement
        const chip = row.querySelector('.mobile-row__chip') as HTMLElement
        const line2 = row.querySelector('.mobile-row__line2') as HTMLElement
        const lh = parseFloat(getComputedStyle(t).lineHeight)
        return {
          title: t.textContent ?? '',
          meta: meta.textContent ?? '',
          metaClipped: meta.scrollWidth > meta.clientWidth + 0.5,
          metaRight: meta.getBoundingClientRect().right,
          chipClipped: chip.scrollWidth > chip.clientWidth + 0.5,
          chipRight: chip.getBoundingClientRect().right,
          line2Right: line2.getBoundingClientRect().right,
          lines: Math.round(t.getBoundingClientRect().height / lh),
          height: Math.round(row.getBoundingClientRect().height),
          right: Math.round(row.getBoundingClientRect().right),
        }
      })
    return {
      width: window.innerWidth,
      docOverflow: document.documentElement.scrollWidth - window.innerWidth,
      theme: document.documentElement.getAttribute('data-theme'),
      rows,
    }
  }, ROW)
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [320, 375]) {
    for (const status of ['thriving', 'vulnerable', 'intervention']) {
      test(`${status} rows show the whole DCP figure at ${width}px (${theme})`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme: theme })
        await page.setViewportSize({ width, height: 844 })
        await load(page, `${CLUBS}?status=${status}`)
        await expect(page.locator(FLAT)).toBeVisible()
        const g = await measure(page)
        const ctx = JSON.stringify({ ...g, rows: g.rows.length })
        expect(g.theme, ctx).toBe(theme)
        expect(g.docOverflow, ctx).toBeLessThanOrEqual(0)
        expect(g.rows.length, ctx).toBeGreaterThan(0)
        for (const r of g.rows) {
          const rc = JSON.stringify(r)
          expect(r.meta, rc).toMatch(/^\d+\/10 DCP$/)
          expect(r.metaClipped, rc).toBe(false)
          expect(r.metaRight, rc).toBeLessThanOrEqual(r.line2Right + 0.5)
          expect(r.chipClipped, rc).toBe(false)
          expect(r.chipRight, rc).toBeLessThanOrEqual(r.line2Right + 0.5)
          expect(r.height, rc).toBeGreaterThanOrEqual(56)
          expect(r.height, rc).toBeLessThanOrEqual(
            r.lines > 1 ? WRAPPED_ROW_MAX : 64
          )
          expect(r.right, rc).toBeLessThanOrEqual(g.width)
        }
      })
    }
  }
}
