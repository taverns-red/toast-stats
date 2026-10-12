import { test, expect, type Page } from '@playwright/test'

/* Priority-column comparison tables (#1834, mobile epic #1827 Phase 1,
 * review §5.2).
 *
 * Below 768 a compare-across-rows table shows identity + 2 chosen metrics
 * and must FIT: no hidden columns, no document overflow (measured with the
 * `body{overflow-x:hidden}` mask disabled), one-line headers, 44px targets,
 * ≥14px text, and every tier chip inside its cell by bounding box
 * (Lesson 134). "Full table" opens a full-screen sheet with a focusable
 * labelled scroll region. ≥768 keeps the full table unchanged.
 *
 * Runs against BASE_URL (the PR preview, or a local dev server). Set
 * SHOTS_DIR to also save a screenshot per route/width/theme. */

interface Route {
  path: string
  /** Accessible name of the priority table. */
  table: string | RegExp
  /** Accessible name of the full table at ≥768, when it differs. */
  wideTable?: string | RegExp
  /** Or: the name of the full table's scroll region at ≥768. */
  wideRegion?: RegExp
  /** The chip to end on (the screenshot state); default: the last chip. */
  swapChip?: string
  /** Rewrite the live competitive-awards.json so every district holds a
   *  tier (cycling all four). Early in a program year no district has one,
   *  so real data alone would never put a chip in the cell to measure. */
  forceTiers?: boolean
}

const ROUTES: readonly Route[] = [
  {
    path: '/region/05',
    table: 'Region 05 district rankings',
    swapChip: 'Tier',
    forceTiers: true,
  },
  {
    // The review's clipped-chip page ("President's Disting…", Lesson 134).
    path: '/district/61/club/7238597/history',
    table: /program-year history/,
    wideTable: /performance by program year/,
    swapChip: 'Members',
  },
  {
    // Metrics x program years: the priority columns are years.
    path: '/history',
    table: 'Worldwide scoreboard by program year',
    wideTable: /Worldwide totals/,
  },
  {
    path: '/district/61/division/A',
    table: /Division A area performance/,
    wideRegion: /area performance — scroll/,
  },
  {
    path: '/district/61/division/A/area/01',
    table: 'Area performance',
    wideRegion: /Area performance — scroll/,
  },
  {
    path: '/regions',
    table: 'Region rankings',
    swapChip: 'Dist. clubs',
  },
]

const TIERS = ['Distinguished', 'Select', 'Presidents', 'Smedley']

const forceTiers = (page: Page) =>
  page.route('**/competitive-awards.json', async route => {
    const res = await route.fetch()
    const body = await res.json()
    Object.values(
      (body.distinguishedDistrict ?? {}) as Record<
        string,
        { currentTier: string }
      >
    ).forEach((d, i) => {
      d.currentTier = TIERS[i % TIERS.length]!
    })
    await route.fulfill({
      status: res.status(),
      json: body,
      headers: { 'access-control-allow-origin': '*' },
    })
  })
const PHONES = [375, 390]
const WIDE = [768, 1280]
const THEMES = ['light', 'dark'] as const

const prep = async (page: Page, theme: string, width: number) => {
  await page.addInitScript(t => {
    try {
      localStorage.setItem('theme', t)
    } catch {
      // storage blocked: falls back to prefers-color-scheme
    }
  }, theme)
  // A local build (vite preview) can't read the CDN cross-origin: relay it
  // through Playwright with a permissive CORS header. Deployed previews
  // are on the CDN's allow-list and skip this.
  if (/localhost|127\.0\.0\.1/.test(process.env['BASE_URL'] ?? ''))
    await page.route('https://cdn.taverns.red/**', async route => {
      const res = await route.fetch()
      await route.fulfill({
        response: res,
        headers: { ...res.headers(), 'access-control-allow-origin': '*' },
      })
    })
  await page.emulateMedia({ colorScheme: theme as 'light' | 'dark' })
  await page.setViewportSize({ width, height: width < 768 ? 812 : 900 })
}

const unmask = (page: Page) =>
  page.addStyleTag({
    content: 'html,body{overflow-x:visible !important}',
  })

// Every priority table on the page (the Divisions page has one per
// division, all driven by the same ?cols=), aggregated.
const measure = (page: Page) =>
  page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const tables = [
      ...document.querySelectorAll('table.priority-columns__table'),
    ] as HTMLTableElement[]
    if (tables.length === 0) return null
    const rect = (el: Element) => el.getBoundingClientRect()
    const fs = (el: Element) => parseFloat(getComputedStyle(el).fontSize)
    const all = (sel: string) =>
      tables.flatMap(t => [...t.querySelectorAll(sel)])
    const ths = all('thead th')
    const targets = [
      ...document.querySelectorAll(
        '.priority-columns__chip, .priority-columns__full, .priority-columns__identity a, .priority-columns__table th button'
      ),
    ]
    const small = all('td, td *, th button').filter(
      el => el.textContent?.trim() && fs(el) < 14
    )
    const chipEls = all('.priority-columns__tier, .priority-columns__badge')
    const chipClips = chipEls.filter(chip => {
      const c = rect(chip)
      const td = rect(chip.closest('td')!)
      return c.right > td.right + 0.5 || c.left < td.left - 0.5
    })
    // Line count of each header's text: distinct line-box tops of a Range
    // over the label (cell height says nothing — cells are 44px tall).
    const lineCount = (el: Element) => {
      const range = document.createRange()
      range.selectNodeContents(el)
      const tops = new Set(
        [...range.getClientRects()]
          .filter(r => r.width > 0)
          .map(r => Math.round(r.top))
      )
      return tops.size
    }
    const headerLines = ths.map(th => ({
      text: th.textContent?.trim(),
      lines: lineCount(th.querySelector('.sortable-header__label') ?? th),
    }))
    return {
      docOverflow: document.documentElement.scrollWidth - vw,
      tableRight: Math.max(...tables.map(t => rect(t).right - vw)),
      tableHidden: Math.max(
        ...tables.map(t => Math.max(0, t.scrollWidth - t.clientWidth))
      ),
      columns: [
        ...new Set(tables.map(t => t.querySelectorAll('thead th').length)),
      ],
      multiLineHeaders: headerLines.filter(h => h.lines > 1),
      // One line is not enough: an ellipsized label hides the metric name.
      truncatedHeaders: ths
        .map(th => th.querySelector('.sortable-header__label') ?? th)
        .filter(el => el.scrollWidth > el.clientWidth + 1)
        .map(el => el.textContent?.trim()),
      tinyTargets: targets
        .map(t => ({ t: t.textContent?.trim(), ...rect(t).toJSON() }))
        .filter(r => r.height < 44 - 0.5),
      smallText: small.map(
        el => `${el.className} "${el.textContent?.trim()}" ${fs(el)}px`
      ),
      chipClips: chipClips.length,
      chips: all('.priority-columns__tier').length,
      // Data is never hidden: a metric cell's content must fit its box.
      clippedCells: all('td.priority-columns__metric')
        .filter(td => td.scrollWidth > td.clientWidth + 1)
        .map(td => td.textContent?.trim()),
    }
  })

for (const theme of THEMES) {
  for (const width of PHONES) {
    test(`priority columns fit at ${width}px (${theme})`, async ({ page }) => {
      test.setTimeout(120_000)
      await prep(page, theme, width)
      for (const r of ROUTES) {
        if (r.forceTiers) await forceTiers(page)
        await page.goto(r.path, { waitUntil: 'networkidle', timeout: 60_000 })
        const table = page.getByRole('table', { name: r.table }).first()
        await table.waitFor({ state: 'visible' })
        await unmask(page)
        await page.waitForTimeout(500)

        // Every metric must fit as a column: the default pair, then each
        // chip in turn, ending on `swapChip` (the screenshot state).
        const chips = (
          await page.locator('.priority-columns__chip').allTextContents()
        ).filter((c, i, arr) => c !== r.swapChip && arr.indexOf(c) === i)
        for (const step of [
          'default',
          ...chips,
          ...(r.swapChip ? [r.swapChip] : []),
        ]) {
          if (step !== 'default')
            await page
              .getByRole('button', { name: step, exact: true })
              .first()
              .click()
          // Awards resolve separately from rankings; wait for the chips.
          if (step === 'Tier' && r.forceTiers)
            await page.locator('.priority-columns__tier').first().waitFor()
          const m = await measure(page)
          expect(m, `${r.path} ${step}`).not.toBeNull()
          expect(m!.columns, `${r.path} ${step} columns`).toEqual([3])
          expect(
            m!.docOverflow,
            `${r.path} ${step} doc overflow`
          ).toBeLessThanOrEqual(0)
          expect(
            m!.tableRight,
            `${r.path} ${step} table past edge`
          ).toBeLessThanOrEqual(0.5)
          expect(m!.tableHidden, `${r.path} ${step} hidden table px`).toBe(0)
          expect(
            m!.multiLineHeaders,
            `${r.path} ${step} wrapped headers`
          ).toEqual([])
          expect(m!.tinyTargets, `${r.path} ${step} <44px targets`).toEqual([])
          expect(m!.smallText, `${r.path} ${step} <14px text`).toEqual([])
          expect(m!.chipClips, `${r.path} ${step} clipped chips`).toBe(0)
          expect(m!.clippedCells, `${r.path} ${step} clipped cells`).toEqual([])
          expect(
            m!.truncatedHeaders,
            `${r.path} ${step} ellipsized headers`
          ).toEqual([])
          if (step === 'Tier' && r.forceTiers)
            expect(m!.chips, `${r.path} tier chips measured`).toBeGreaterThan(0)
        }
        if (process.env['SHOTS_DIR'])
          await page
            .locator('.priority-columns')
            .first()
            .screenshot({
              path: `${process.env['SHOTS_DIR']}/${r.path.replace(/\//g, '_')}-${width}-${theme}.png`,
            })

        // Full table: a full-screen sheet holding a focusable labelled region.
        await page
          .getByRole('button', { name: /full table/i })
          .first()
          .click()
        const dialog = page.getByRole('dialog')
        await dialog.waitFor({ state: 'visible' })
        const box = (await dialog.boundingBox())!
        expect(Math.round(box.height)).toBeGreaterThanOrEqual(811)
        const region = dialog.getByRole('region')
        await expect(region).toHaveAttribute('tabindex', '0')
        await expect(region).toHaveAttribute('aria-label', /.+/)
        if (process.env['SHOTS_DIR']) {
          await page.waitForTimeout(400) // let the slide-up finish
          await page.screenshot({
            path: `${process.env['SHOTS_DIR']}/${r.path.replace(/\//g, '_')}-${width}-${theme}-sheet.png`,
          })
        }
        await dialog.getByRole('button', { name: /close/i }).click()
      }
    })
  }

  for (const width of WIDE) {
    test(`full table unchanged at ${width}px (${theme})`, async ({ page }) => {
      test.setTimeout(120_000)
      await prep(page, theme, width)
      for (const r of ROUTES) {
        await page.goto(r.path, { waitUntil: 'networkidle', timeout: 60_000 })
        await page
          .getByRole(r.wideRegion ? 'region' : 'table', {
            name: r.wideRegion ?? r.wideTable ?? r.table,
          })
          .first()
          .waitFor({ state: 'visible' })
        expect(await page.locator('.priority-columns__table').count()).toBe(0)
        expect(await page.locator('.priority-columns__chip').count()).toBe(0)
        if (process.env['SHOTS_DIR']) {
          await page
            .getByRole(r.wideRegion ? 'region' : 'table', {
              name: r.wideRegion ?? r.wideTable ?? r.table,
            })
            .first()
            .scrollIntoViewIfNeeded()
          await page.screenshot({
            path: `${process.env['SHOTS_DIR']}/${r.path.replace(/\//g, '_')}-${width}-${theme}.png`,
          })
        }
      }
    })
  }
}
