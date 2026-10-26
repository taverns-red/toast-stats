import { test, expect, type Page } from './fixtures/test'

/* Long club names in the phone Clubs list (#2335, follow-up to #2329).
 *
 * The Clubs list rows (`ClubsTable` → MobileRowList) ellipsized the name, so
 * "Confidently Speaking Toastmasters Club" read "Confidently Speaking
 * Toastm…" at 320–390 px. #2331 added the opt-in `wrapTitle` mode for the
 * Action List; the Clubs list now uses it too.
 *
 * Measured on the deployed build (BASE_URL) by bounding box (Lesson 134), on
 * a flat list (a non-default sort flattens the grouped view: 50 rows) and on
 * a search for the long name: the long name shows its whole text, and in the
 * flat list no title ellipsizes on one line and none that fits two lines is
 * cut by the 2-line clamp,
 * titles stay 16 px on ≤ 2 lines, one-line rows stay 56–64 px and only a
 * wrapped row may grow, to ≤ 82 px. Rows sit inside the viewport and the page
 * never scrolls sideways with the `overflow-x:hidden` mask off. */

const CLUBS = '/district/86/clubs'
const LONG = 'Confidently Speaking Toastmasters Club'
const FLAT = 'ul[aria-label="Clubs"]'
const ROW = '[data-testid="mobile-row"]'

/** 2 title lines (2 × 22) + meta (20) + gap (2) + padding (16). */
const WRAPPED_ROW_MAX = 82

async function load(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready)
}

interface Geometry {
  width: number
  docOverflow: number
  theme: string | null
  rows: {
    title: string
    clipX: boolean
    clipY: boolean
    /** The name fits two lines of this box (best word split, exact width). */
    fitsTwoLines: boolean
    titlePx: number
    lines: number
    height: number
    left: number
    right: number
  }[]
}

async function measure(page: Page): Promise<Geometry> {
  await page.addStyleTag({
    content: 'html,body{overflow-x:visible !important}',
  })
  return page.evaluate(sel => {
    const rows = Array.from(document.querySelectorAll(sel))
      .filter(el => el.getBoundingClientRect().height > 0)
      .map(row => {
        const t = row.querySelector('.mobile-row__title') as HTMLElement
        const r = row.getBoundingClientRect()
        const cs = getComputedStyle(t)
        const ctx = document.createElement('canvas').getContext('2d')!
        ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
        const words = (t.textContent ?? '').trim().split(/\s+/)
        const w = (from: number, to: number) =>
          ctx.measureText(words.slice(from, to).join(' ')).width
        // Greedy line breaking fills two lines whenever some word split does.
        let best = Infinity
        for (let k = 1; k <= words.length; k++) {
          best = Math.min(best, Math.max(w(0, k), w(k, words.length)))
        }
        return {
          title: t.textContent ?? '',
          clipX: t.scrollWidth > t.clientWidth + 0.5,
          clipY: t.scrollHeight > t.clientHeight + 0.5,
          fitsTwoLines: best <= t.getBoundingClientRect().width,
          titlePx: parseFloat(cs.fontSize),
          lines: Math.round(
            t.getBoundingClientRect().height / parseFloat(cs.lineHeight)
          ),
          height: Math.round(r.height),
          left: Math.round(r.left),
          right: Math.round(r.right),
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

/** Row contract with wrapTitle: never an ellipsis on one line, ≤ 2 lines,
 * 56–64 px unless wrapped (≤ 82 px). `strict` — every name must be whole;
 * otherwise only a name too long for two lines may end in the clamp's
 * ellipsis (about 1 in 100 at 375, e.g. "Speak With Spark PMI Lakeshore,
 * Ontario Toastmasters Club"; more at 320). */
function expectWhole(g: Geometry, theme: string, strict: boolean): void {
  const ctx = JSON.stringify({ ...g, rows: g.rows.length })
  expect(g.theme, ctx).toBe(theme)
  expect(g.docOverflow, ctx).toBeLessThanOrEqual(0)
  expect(g.rows.length, ctx).toBeGreaterThan(0)
  for (const r of g.rows) {
    const rc = JSON.stringify(r)
    expect(r.clipX, rc).toBe(false)
    if (strict) expect(r.fitsTwoLines, rc).toBe(true)
    if (r.fitsTwoLines) expect(r.clipY, rc).toBe(false)
    expect(r.titlePx, rc).toBeGreaterThanOrEqual(16)
    expect(r.lines, rc).toBeLessThanOrEqual(2)
    expect(r.height, rc).toBeGreaterThanOrEqual(56)
    expect(r.height, rc).toBeLessThanOrEqual(r.lines > 1 ? WRAPPED_ROW_MAX : 64)
    expect(r.left, rc).toBeGreaterThanOrEqual(0)
    expect(r.right, rc).toBeLessThanOrEqual(g.width)
  }
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [320, 375, 390]) {
    test.describe(`clubs list names at ${width}px (${theme})`, () => {
      test.beforeEach(async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme })
        await page.setViewportSize({ width, height: 844 })
      })

      test('the long name reads in full', async ({ page }) => {
        await load(page, `${CLUBS}?search=${encodeURIComponent(LONG)}`)
        await expect(page.locator(FLAT)).toBeVisible()
        const g = await measure(page)
        expect(g.rows.map(r => r.title)).toContain(LONG)
        // Whole at 375/390 in any font. At 320 the name box is 166 px: the
        // name fits two lines in macOS/iOS system-ui (163 px) but not in the
        // wider Linux fallback on CI, so 320 holds the general rule (no
        // one-line ellipsis; the clamp only when two lines can't hold it).
        expectWhole(g, theme, width >= 375)
      })

      test('every name that fits two lines reads in full', async ({ page }) => {
        await load(page, `${CLUBS}?sort=membership&dir=desc`)
        await expect(page.locator(FLAT)).toBeVisible()
        await expect(page.locator(`${ROW}:visible`)).toHaveCount(50)
        expectWhole(await measure(page), theme, false)
      })
    })
  }
}
