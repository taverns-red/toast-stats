import { test, expect, type Page } from './fixtures/test'

/* Clubs table layout (#2676, spec §12 tests 10, 11, 12, 14 and 15; PR 3).
 *
 *  - 10: at 768, 1024 and 1280 (1280 also with a 17px classic scrollbar) the
 *    default columns fit: no page-level horizontal scroll, the wrapper is not
 *    in overflow mode, every default header sits inside the viewport and the
 *    Columns trigger reads the tier's count.
 *  - 11: the header sticks to the page at --table-sticky-top once the page has
 *    scrolled, and nothing around the table is a vertical scroller.
 *  - 12: with every column on at 768 the wrapper goes into overflow mode: a
 *    labelled, focusable region with an end cue; the page still has no
 *    horizontal scroll and the Club column stays pinned when it scrolls.
 *  - 14: no text under 14px; under touch emulation the club link is >= 44px.
 *  - 15: re-sorting under a 4x CPU throttle is timed and logged, not gated.
 *
 * Runs against the deployed preview (or prod, or vite preview) in both
 * engines, light and dark where colour matters. */

const CLUBS = '/district/61/clubs'

const TIERS = [
  { width: 768, shown: 5 },
  { width: 1024, shown: 9 },
  { width: 1280, shown: 11 },
] as const

async function openClubs(page: Page, width: number, height = 900) {
  await page.setViewportSize({ width, height })
  await page.goto(CLUBS, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.locator('#clubs-table tbody tr').first().waitFor({
    timeout: 30_000,
  })
}

for (const theme of ['light', 'dark'] as const) {
  for (const { width, shown } of TIERS) {
    test(`default columns fit at ${width} (${theme})`, async ({ page }) => {
      test.setTimeout(90_000)
      await page.emulateMedia({ colorScheme: theme })
      if (width === 1280) {
        // A classic 17px scrollbar, as on Windows: the 1280 budget has 17px
        // less than the viewport, and headless engines may use overlay bars.
        await page.addInitScript(() => {
          const style = document.createElement('style')
          style.textContent =
            'html{overflow-y:scroll}::-webkit-scrollbar{width:17px}'
          document.addEventListener('DOMContentLoaded', () =>
            document.head.appendChild(style)
          )
        })
      }
      await openClubs(page, width)

      const m = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth
        const heads = Array.from(
          document.querySelectorAll<HTMLElement>('#clubs-table thead th')
        ).map(th => {
          const r = th.getBoundingClientRect()
          return {
            text: th.textContent?.trim() ?? '',
            left: Math.round(r.left),
            right: Math.round(r.right),
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
      })
      const ctx = JSON.stringify(m)
      expect(m.scrollWidth, ctx).toBeLessThanOrEqual(m.vw)
      expect(m.overflow, ctx).not.toBe('true')
      expect(m.heads.length, ctx).toBe(shown)
      for (const h of m.heads) {
        expect(h.left, ctx).toBeGreaterThanOrEqual(0)
        expect(h.right, ctx).toBeLessThanOrEqual(m.vw + 0.5)
      }
      await expect(
        page.getByRole('button', { name: /^Columns, \d+ of \d+ shown/ })
      ).toContainText(`Columns · ${shown} of`)
    })
  }
}

test('the header sticks to the page and nothing around the table scrolls', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await openClubs(page, 1280)
  const tableHeight = await page
    .locator('#clubs-table')
    .evaluate(t => t.getBoundingClientRect().height)
  const dy = Math.min(2000, Math.floor(tableHeight / 2))
  await page.evaluate(y => window.scrollTo(0, y), dy)
  await page.waitForTimeout(300)
  const m = await page.evaluate(() => {
    const th = document.querySelector<HTMLElement>(
      '#clubs-table thead th'
    ) as HTMLElement
    const r = th.getBoundingClientRect()
    const scrollers: string[] = []
    for (
      let el: HTMLElement | null = document.getElementById('clubs-table');
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
      stickyTop: parseFloat(getComputedStyle(th).top),
      inViewport: r.bottom > 0 && r.top < window.innerHeight,
      scrollers,
    }
  })
  const ctx = JSON.stringify(m)
  expect(m.inViewport, ctx).toBe(true)
  expect(Math.abs(m.top - m.stickyTop), ctx).toBeLessThanOrEqual(1)
  expect(m.scrollers, ctx).toEqual([])
})

test('Show all at 768 puts the table in a labelled, scrollable region', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await openClubs(page, 768)
  await page.getByRole('button', { name: /^Columns, \d+ of \d+ shown/ }).click()
  await page.getByRole('button', { name: 'Show all' }).click()
  await page.keyboard.press('Escape')

  const wrap = page.locator('.dt-scroll')
  await expect(wrap).toHaveAttribute('data-overflow', 'true')
  await expect(wrap).toHaveAttribute('role', 'region')
  await expect(wrap).toHaveAttribute('tabindex', '0')
  await expect(wrap).toHaveAttribute(
    'aria-label',
    /all clubs table, scrolls sideways/i
  )
  await expect(page.locator('.dt-scroll__cue--end')).toHaveCSS('opacity', '1')

  const m = await page.evaluate(() => {
    const el = document.querySelector('.dt-scroll') as HTMLElement
    el.scrollLeft = 240
    const wrapLeft = el.getBoundingClientRect().left
    const pinned = document.querySelector<HTMLElement>(
      '#clubs-table tbody tr:first-child th'
    ) as HTMLElement
    return {
      vw: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      scrollLeft: el.scrollLeft,
      pinnedOffset: pinned.getBoundingClientRect().left - wrapLeft,
    }
  })
  const ctx = JSON.stringify(m)
  expect(m.scrollWidth, ctx).toBeLessThanOrEqual(m.vw)
  expect(m.scrollLeft, ctx).toBeGreaterThan(0)
  expect(Math.abs(m.pinnedOffset), ctx).toBeLessThanOrEqual(1)
  await expect(page.locator('.dt-scroll__cue--start')).toHaveCSS('opacity', '1')
})

for (const theme of ['light', 'dark'] as const) {
  test(`no table text under 14px at 768 (${theme})`, async ({ page }) => {
    test.setTimeout(90_000)
    await page.emulateMedia({ colorScheme: theme })
    await openClubs(page, 768)
    const small = await page.evaluate(() => {
      const out: string[] = []
      const walker = document.createTreeWalker(
        document.getElementById('clubs-table')!,
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
    })
    expect(small).toEqual([])
  })
}

test.describe('touch targets', () => {
  test.use({ hasTouch: true, isMobile: true })

  test('the club link is at least 44px tall at 768 under a coarse pointer', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await openClubs(page, 768, 1024)
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches)
    ).toBe(true)
    const heights = await page
      .locator('#clubs-table tbody tr .clubs-name-link')
      .evaluateAll(links =>
        links.slice(0, 20).map(a => a.getBoundingClientRect().height)
      )
    expect(heights.length).toBeGreaterThan(0)
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(44)
  })
})

test('re-sorting is timed under a 4x CPU throttle (logged, not gated)', async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(browserName !== 'chromium', 'CDP CPU throttling is Chromium-only')
  test.setTimeout(120_000)
  await openClubs(page, 1280)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await page.evaluate(() => {
    ;(window as unknown as { __sortMs: number[] }).__sortMs = []
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        if (e.name === 'click') {
          ;(window as unknown as { __sortMs: number[] }).__sortMs.push(
            e.duration
          )
        }
      }
    }).observe({ type: 'event', durationThreshold: 16, buffered: false })
  })
  const members = page.getByRole('button', { name: 'Members' })
  await members.click()
  await page.waitForTimeout(500)
  await members.click()
  await page.waitForTimeout(500)
  const ms = await page.evaluate(
    () => (window as unknown as { __sortMs: number[] }).__sortMs
  )
  testInfo.annotations.push({
    type: 'sort-interaction-ms (4x CPU)',
    description: JSON.stringify(ms),
  })
  console.log(`clubs re-sort event durations (4x CPU): ${JSON.stringify(ms)}`)
})
