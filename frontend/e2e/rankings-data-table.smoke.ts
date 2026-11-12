import { test, expect, type Page } from './fixtures/test'

/* Landing rankings on the shared DataTable (#2689, #2676 M1, spec §12 tests
 * 10, 11, 12 and 14 applied to the landing table).
 *
 *  - At 768, 1024 and 1280 (1280 also with a 17px classic scrollbar) the
 *    default columns fit: no page-level horizontal scroll, the wrapper is not
 *    in overflow mode, every default header sits inside the viewport, and no
 *    column is hidden by CSS (every header is rendered AND visible).
 *  - The header sticks to the page at --table-sticky-top once the page has
 *    scrolled, and nothing around the table is a vertical scroller.
 *  - With every column on at 768 the wrapper goes into overflow mode: a
 *    labelled, focusable region; the page still has no horizontal scroll.
 *  - No text under 14px in the table, light and dark.
 *  - "My district" is a left bar plus the words "Your district".
 *
 * Runs against the deployed preview (or prod, or vite preview) in both
 * engines. Never waits on a timer: html has `scroll-behavior: smooth`, so
 * scrolling jumps instantly and waits on the position itself. */

const TABLE = '#district-rankings-table'

const TIERS = [
  {
    width: 768,
    headers: ['District', 'Rank', 'Paid clubs', 'Total payments', 'Score'],
  },
  {
    width: 1024,
    headers: [
      'District',
      'Rank',
      'Paid clubs',
      'Total payments',
      'Distinguished',
      'Score',
    ],
  },
  {
    width: 1280,
    headers: [
      'District',
      'Rank',
      'Paid clubs',
      'Total payments',
      'Distinguished',
      'Score',
    ],
  },
] as const

async function openLanding(page: Page, width: number, height = 900) {
  // A local build (vite preview) can't read the CDN cross-origin: relay it
  // through Playwright with a permissive CORS header. Deployed previews are on
  // the CDN's allow-list and skip this.
  if (/localhost|127\.0\.0\.1/.test(process.env['BASE_URL'] ?? ''))
    await page.route('https://cdn.taverns.red/**', async route => {
      const res = await route.fetch()
      await route.fulfill({
        response: res,
        headers: { ...res.headers(), 'access-control-allow-origin': '*' },
      })
    })
  await page.setViewportSize({ width, height })
  await page.goto('/', { waitUntil: 'networkidle', timeout: 60_000 })
  await page.locator(`${TABLE} tbody tr`).first().waitFor({ timeout: 30_000 })
}

for (const theme of ['light', 'dark'] as const) {
  for (const { width, headers } of TIERS) {
    test(`default columns fit at ${width} (${theme})`, async ({ page }) => {
      test.setTimeout(90_000)
      await page.emulateMedia({ colorScheme: theme })
      if (width === 1280) {
        await page.addInitScript(() => {
          const style = document.createElement('style')
          style.textContent =
            'html{overflow-y:scroll}::-webkit-scrollbar{width:17px}'
          document.addEventListener('DOMContentLoaded', () =>
            document.head.appendChild(style)
          )
        })
      }
      await openLanding(page, width)

      const m = await page.evaluate(sel => {
        const vw = document.documentElement.clientWidth
        const heads = Array.from(
          document.querySelectorAll<HTMLElement>(`${sel} thead th`)
        ).map(th => {
          const r = th.getBoundingClientRect()
          const cs = getComputedStyle(th)
          return {
            text: th.textContent?.trim() ?? '',
            left: Math.round(r.left),
            right: Math.round(r.right),
            hidden: cs.display === 'none' || r.width === 0,
          }
        })
        return {
          vw,
          scrollWidth: document.documentElement.scrollWidth,
          heads,
          overflow: document
            .querySelector('.dt-scroll')
            ?.getAttribute('data-overflow'),
        }
      }, TABLE)
      const ctx = JSON.stringify(m)
      expect(m.scrollWidth, ctx).toBeLessThanOrEqual(m.vw)
      expect(m.overflow, ctx).not.toBe('true')
      expect(
        m.heads.map(h => h.text),
        ctx
      ).toEqual([...headers])
      for (const h of m.heads) {
        expect(h.hidden, ctx).toBe(false)
        expect(h.left, ctx).toBeGreaterThanOrEqual(0)
        expect(h.right, ctx).toBeLessThanOrEqual(m.vw + 0.5)
      }
      await expect(
        page.getByRole('button', { name: /^Columns, \d+ of \d+ shown/ })
      ).toContainText(`Columns · ${headers.length} of 6`)
    })
  }
}

test('the header sticks to the page and nothing around the table scrolls', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await openLanding(page, 1280)
  const dy = await page.evaluate(sel => {
    const t = document.querySelector(sel) as HTMLElement
    return Math.floor(t.getBoundingClientRect().top + window.scrollY + 800)
  }, TABLE)
  await page.evaluate(
    y => window.scrollTo({ top: y, left: 0, behavior: 'instant' }),
    dy
  )
  await page.waitForFunction(y => Math.abs(window.scrollY - y) < 1, dy)
  const m = await page.evaluate(sel => {
    const th = document.querySelector<HTMLElement>(
      `${sel} thead th`
    ) as HTMLElement
    const r = th.getBoundingClientRect()
    const topBar = document.querySelector<HTMLElement>('.app-shell-top-bar')
    const scrollers: string[] = []
    for (
      let el: HTMLElement | null = document.querySelector(sel);
      el && el !== document.body;
      el = el.parentElement
    ) {
      const cs = getComputedStyle(el)
      if (/(auto|scroll|hidden)/.test(cs.overflowY)) {
        scrollers.push(`${el.tagName.toLowerCase()}.${el.className}`)
      }
    }
    return {
      top: r.top,
      barBottom: topBar ? topBar.getBoundingClientRect().bottom : NaN,
      inViewport: r.bottom > 0 && r.top < window.innerHeight,
      scrollers,
    }
  }, TABLE)
  const ctx = JSON.stringify(m)
  expect(m.inViewport, ctx).toBe(true)
  expect(Number.isFinite(m.barBottom), ctx).toBe(true)
  expect(Math.abs(m.top - m.barBottom), ctx).toBeLessThanOrEqual(1)
  expect(m.scrollers, ctx).toEqual([])
})

test('Show all at 768 puts the table in a labelled, scrollable region', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await openLanding(page, 768)
  await page.getByRole('button', { name: /^Columns, \d+ of \d+ shown/ }).click()
  await page.getByRole('button', { name: 'Show all' }).click()
  await page.keyboard.press('Escape')

  const wrap = page.locator('.dt-scroll')
  await expect(wrap).toHaveAttribute('data-overflow', 'true')
  await expect(wrap).toHaveAttribute('role', 'region')
  await expect(wrap).toHaveAttribute('tabindex', '0')
  await expect(wrap).toHaveAttribute(
    'aria-label',
    /district rankings, scrolls sideways/i
  )
  const m = await page.evaluate(() => ({
    vw: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(m.scrollWidth, JSON.stringify(m)).toBeLessThanOrEqual(m.vw)
  await expect(
    page.locator(`${TABLE} thead th`).filter({ hasText: 'Distinguished' })
  ).toBeVisible()
})

for (const theme of ['light', 'dark'] as const) {
  test(`no table text under 14px at 768 (${theme})`, async ({ page }) => {
    test.setTimeout(90_000)
    await page.emulateMedia({ colorScheme: theme })
    await openLanding(page, 768)
    const small = await page.evaluate(sel => {
      const out: string[] = []
      const walker = document.createTreeWalker(
        document.querySelector(sel)!,
        NodeFilter.SHOW_TEXT
      )
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = (n.textContent ?? '').trim()
        const el = n.parentElement
        if (!text || !el) continue
        const px = parseFloat(getComputedStyle(el).fontSize)
        if (px < 14) out.push(`${text.slice(0, 20)} ${px}px`)
      }
      return out.slice(0, 5)
    }, TABLE)
    expect(small).toEqual([])
  })
}

test('my district is a left bar plus the words "Your district"', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.addInitScript(() => {
    localStorage.setItem('toast-stats:v1:my-district-id', JSON.stringify('61'))
  })
  await openLanding(page, 1280)
  const row = page.locator(`${TABLE} tbody tr[data-mine="true"]`)
  await expect(row).toHaveCount(1)
  await expect(row.getByText('Your district')).toBeVisible()
  const bar = await row
    .locator('th')
    .evaluate(th => getComputedStyle(th).boxShadow)
  // A loyal-blue inset bar on the left edge, not a background tint.
  expect(bar).toMatch(/inset/)
  expect(
    await row.evaluate(r => getComputedStyle(r).backgroundColor)
  ).not.toMatch(/254, 252, 232/)
})
