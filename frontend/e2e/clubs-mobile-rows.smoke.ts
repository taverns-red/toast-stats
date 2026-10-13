import { test, expect, type Page } from './fixtures/test'

/* Phone clubs list as compact rows (#1833, mobile epic #1827 Phase 1,
 * review §4.1 "Clubs list", §7 "clubs page height").
 *
 * Below 768 the 125–140 px ClubCard stack is a MobileRowList: the default
 * view groups clubs by division, collapsed, with counts; any search, filter,
 * preset or non-default sort turns it into one flat list capped at 50 rows
 * with "Show 25 more". Filter and sort live in the shared FilterSheet
 * (#1836) and, like the open divisions (`?open=`), in the URL — so a reload
 * or a shared link restores the same view.
 *
 * Measured on the deployed preview (BASE_URL) by bounding box (Lesson 134):
 * every visible row 56–64 px and inside the viewport, its status chip inside
 * the row and never ellipsized, row text ≥14 px, and zero document overflow
 * with the `body{overflow-x:hidden}` mask disabled. Rows never carry contact
 * details (privacy rule). 768 and 1280 keep the desktop table.
 *
 * The page height at 375 is attached to each test as an annotation
 * (`page-height`) so a PR can quote before/after from the report. */

const CLUBS = '/district/61/clubs'
const GROUPED = '[role="group"][aria-label="Clubs by division"]'
const FLAT = 'ul[aria-label="Clubs"]'
const ROW = '[data-testid="mobile-row"]:visible'

/** Review §7 targets for ~160 clubs at 375. */
const GROUPED_HEIGHT_MAX = 2_500
const FLAT_HEIGHT_MAX = 8_000

async function load(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready)
}

const unmask = (page: Page) =>
  page.addStyleTag({
    content: 'html,body{overflow-x:visible !important}',
  })

interface RowGeometry {
  width: number
  docHeight: number
  docOverflow: number
  theme: string | null
  rows: {
    text: string
    left: number
    right: number
    height: number
    titlePx: number
    metaPx: number
    chipInside: boolean
    chipClipped: boolean
    /** The #1792 trend sparkline: 60×16 and wholly inside the row. */
    trendW: number
    trendH: number
    trendInside: boolean
    /** Line 2 (chip + DCP) must not ellipsize beside the trend. */
    metaClipped: boolean
  }[]
}

/** Geometry of every visible phone row, with the overflow mask off. */
async function measure(page: Page): Promise<RowGeometry> {
  await unmask(page)
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }
    const px = (el: Element | null) =>
      el ? parseFloat(getComputedStyle(el).fontSize) : 0
    const rows = Array.from(
      document.querySelectorAll('[data-testid="mobile-row"]')
    )
      .filter(visible)
      .map(row => {
        const r = row.getBoundingClientRect()
        const chip = row.querySelector('.mobile-row__chip')
        const c = chip?.getBoundingClientRect()
        const spark = row.querySelector('.mobile-row__trailing svg')
        const meta = row.querySelector('.mobile-row__meta')
        const t = spark?.getBoundingClientRect()
        return {
          text: (row.textContent ?? '') + ' ' + row.getAttribute('aria-label'),
          left: Math.round(r.left),
          right: Math.round(r.right),
          height: Math.round(r.height),
          titlePx: px(row.querySelector('.mobile-row__title')),
          metaPx: px(row.querySelector('.mobile-row__meta')),
          chipInside: c
            ? c.left >= r.left - 0.5 &&
              c.right <= r.right + 0.5 &&
              c.top >= r.top - 0.5 &&
              c.bottom <= r.bottom + 0.5
            : false,
          chipClipped: chip
            ? Array.from(chip.querySelectorAll('*'))
                .concat(chip)
                .some(el => el.scrollWidth > el.clientWidth + 0.5)
            : true,
          metaClipped: meta ? meta.scrollWidth > meta.clientWidth + 0.5 : false,
          trendW: Math.round(t?.width ?? 0),
          trendH: Math.round(t?.height ?? 0),
          trendInside: t
            ? t.left >= r.left - 0.5 &&
              t.right <= r.right + 0.5 &&
              t.top >= r.top - 0.5 &&
              t.bottom <= r.bottom + 0.5
            : false,
        }
      })
    return {
      width: window.innerWidth,
      docHeight: document.documentElement.scrollHeight,
      docOverflow: document.documentElement.scrollWidth - window.innerWidth,
      theme: document.documentElement.getAttribute('data-theme'),
      rows,
    }
  })
}

/** Row contract (#1833): 56–64 px, on screen, chip whole, ≥14 px, private. */
function expectRows(g: RowGeometry, min = 1): void {
  const ctx = JSON.stringify({ ...g, rows: g.rows.slice(0, 5) })
  expect(g.docOverflow, ctx).toBeLessThanOrEqual(0)
  expect(g.rows.length, ctx).toBeGreaterThanOrEqual(min)
  for (const r of g.rows) {
    const rc = `${JSON.stringify(r)}`
    expect(r.height, rc).toBeGreaterThanOrEqual(56)
    expect(r.height, rc).toBeLessThanOrEqual(64)
    expect(r.left, rc).toBeGreaterThanOrEqual(0)
    expect(r.right, rc).toBeLessThanOrEqual(g.width)
    expect(r.chipInside, rc).toBe(true)
    expect(r.chipClipped, rc).toBe(false)
    // Trend sparkline (#1792): on at 375, 60×16, unclipped by the row.
    expect([r.trendW, r.trendH], rc).toEqual([60, 16])
    expect(r.trendInside, rc).toBe(true)
    expect(r.metaClipped, rc).toBe(false)
    expect(r.titlePx, rc).toBeGreaterThanOrEqual(14)
    expect(r.metaPx, rc).toBeGreaterThanOrEqual(14)
    // Privacy: no email, URL/meeting link or phone number in a row.
    expect(r.text, rc).not.toMatch(/@|https?:|zoom\.us|\+?\d[\d ().-]{8,}\d/)
  }
}

function record(height: number, label: string): void {
  test.info().annotations.push({
    type: 'page-height',
    description: `${label}: ${height}px`,
  })
}

const membersOf = (text: string) =>
  Number(/(\d+) members?\b/.exec(text)?.[1] ?? NaN)

for (const theme of ['light', 'dark'] as const) {
  test.describe(`clubs rows at 375 (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize({ width: 375, height: 812 })
    })

    test('default view: collapsed divisions with counts, open state in ?open=', async ({
      page,
    }) => {
      await load(page, CLUBS)
      const grouped = page.locator(GROUPED)
      await expect(grouped).toBeVisible()
      const toggles = grouped.locator('button[aria-expanded]')
      const n = await toggles.count()
      expect(n).toBeGreaterThan(1)
      for (let i = 0; i < n; i++) {
        await expect(toggles.nth(i)).toHaveAttribute('aria-expanded', 'false')
        await expect(
          toggles.nth(i).locator('.mobile-row-group__count')
        ).toHaveText(/^\d+ clubs$/)
        const box = await toggles.nth(i).boundingBox()
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
      }
      await expect(page.locator(ROW)).toHaveCount(0)

      const collapsed = await measure(page)
      expect(collapsed.theme).toBe(theme)
      expect(collapsed.docOverflow).toBeLessThanOrEqual(0)
      expect(collapsed.docHeight).toBeLessThanOrEqual(GROUPED_HEIGHT_MAX)
      record(collapsed.docHeight, `${theme} grouped, collapsed`)

      // Open the first division: its rows appear and the URL carries it.
      const first = toggles.first()
      await first.click()
      await expect(first).toHaveAttribute('aria-expanded', 'true')
      await expect(page).toHaveURL(/[?&]open=[^&]+/)
      const open = new URL(page.url()).searchParams.get('open')
      expectRows(await measure(page))

      // Round trip: a reload restores the open division from the URL.
      await load(page, page.url())
      await expect(page.locator(GROUPED)).toBeVisible()
      expect(new URL(page.url()).searchParams.get('open')).toBe(open)
      await expect(
        page.locator(GROUPED).locator('button[aria-expanded]').first()
      ).toHaveAttribute('aria-expanded', 'true')
      expectRows(await measure(page))
    })

    test('Filter & sort sheet writes the URL and a reload restores it', async ({
      page,
    }) => {
      await load(page, CLUBS)
      await expect(page.locator(GROUPED)).toBeVisible()

      await page.getByRole('button', { name: /^Filter & sort/ }).click()
      const sheet = page.getByRole('dialog')
      await expect(sheet).toBeVisible()
      await sheet.getByLabel('Sort by').selectOption('membership')
      await sheet
        .getByRole('group', { name: 'Sort direction' })
        .getByRole('button')
        .last()
        .click()
      const thriving = sheet.getByRole('button', {
        name: 'Thriving',
        exact: true,
      })
      await thriving.click()
      await expect(thriving).toHaveAttribute('aria-pressed', 'true')
      await sheet.getByRole('button', { name: /^Show \d+ clubs?$/ }).click()
      await expect(sheet).toBeHidden()

      const params = () => new URL(page.url()).searchParams
      await expect(page).toHaveURL(/[?&]status=thriving/)
      expect(params().get('sort')).toBe('membership')
      expect(params().get('dir')).toBe('desc')

      // Narrowed or re-sorted → one flat list in the pipeline's order.
      await expect(page.locator(FLAT)).toBeVisible()
      await expect(page.locator(GROUPED)).toHaveCount(0)
      const before = await measure(page)
      expectRows(before)
      const members = before.rows.map(r => membersOf(r.text))
      expect(members.every(Number.isFinite)).toBe(true)
      expect([...members].sort((a, b) => b - a)).toEqual(members)

      // Round trip: reload the URL — same list, same sheet state.
      await load(page, page.url())
      await expect(page.locator(FLAT)).toBeVisible()
      const after = await measure(page)
      expectRows(after)
      expect(after.rows.map(r => r.text)).toEqual(before.rows.map(r => r.text))

      const trigger = page.getByRole('button', { name: /^Filter & sort/ })
      await expect(trigger).toHaveAccessibleName(/Filter & sort, 1 active/)
      await trigger.click()
      await expect(sheet.getByLabel('Sort by')).toHaveValue('membership')
      await expect(
        sheet.getByRole('button', { name: 'Thriving', exact: true })
      ).toHaveAttribute('aria-pressed', 'true')

      // Clear all returns to the grouped browse view and a clean URL.
      await sheet.getByRole('button', { name: 'Clear all' }).click()
      await expect(page).not.toHaveURL(/[?&]status=/)
    })

    test('search writes ?search= and a reload restores it', async ({
      page,
    }) => {
      await load(page, CLUBS)
      await expect(page.locator(GROUPED)).toBeVisible()
      const box = () =>
        page
          .getByRole('searchbox', { name: 'Search clubs by name' })
          .filter({ visible: true })
      await box().fill('toast')
      await expect(page).toHaveURL(/[?&]search=toast/)
      await expect(page.locator(FLAT)).toBeVisible()
      expectRows(await measure(page))

      await load(page, page.url())
      await expect(box()).toHaveValue('toast')
      await expect(page.locator(FLAT)).toBeVisible()
      expectRows(await measure(page))
    })

    test('flat list shows 50 rows, then 25 more, within the height budget', async ({
      page,
    }) => {
      // A non-default sort alone flattens the list without narrowing it.
      await load(page, `${CLUBS}?sort=membership&dir=desc`)
      await expect(page.locator(FLAT)).toBeVisible()
      const total = Number(
        /(\d+) hidden/.exec(
          (await page
            .getByRole('button', { name: /^Show \d+ more clubs/ })
            .textContent()) ?? ''
        )?.[1] ?? 0
      )
      expect(total).toBeGreaterThan(0)
      await expect(page.locator(ROW)).toHaveCount(50)

      const flat = await measure(page)
      expectRows(flat, 50)
      expect(flat.docHeight).toBeLessThanOrEqual(FLAT_HEIGHT_MAX)
      record(flat.docHeight, `${theme} flat, 50 rows`)

      await page.getByRole('button', { name: /^Show \d+ more clubs/ }).click()
      await expect(page.locator(ROW)).toHaveCount(50 + Math.min(25, total))
    })
  })
}

for (const width of [768, 1280]) {
  test(`clubs at ${width}px keep the desktop table`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await load(page, CLUBS)
    await expect(
      page.getByRole('region', { name: 'All clubs table' })
    ).toBeVisible()
    await expect(page.locator(ROW)).toHaveCount(0)
    await expect(page.locator(GROUPED)).toHaveCount(0)
    // Trend column (#1792) at every width: a header, and a named sparkline.
    await expect(
      page.getByRole('button', { name: /^Sort by Trend/ })
    ).toBeVisible()
    await expect(
      page
        .locator('#clubs-table tbody tr')
        .first()
        .getByRole('img', { name: /^Membership / })
    ).toBeVisible()
  })
}
