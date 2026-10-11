import { test, expect, type Page } from '@playwright/test'

/* Phone context bar (#1831, mobile epic #1827 Phase 1, review §5.1).
 *
 * Below 768 one sticky 44px row (‹ District 61 · PY 26–27 · Oct 10 ▾)
 * replaces the district header stack: eyebrow, title, lede, data chips, "⋯"
 * and the one-crumb breadcrumb. Before it, page content started at y≈465–540
 * of 812 on every district route.
 *
 * Measured on the deployed preview (BASE_URL), by bounding box (Lesson 134)
 * — jsdom has no layout. The bar is mounted once and hidden ≥768 by CSS, so
 * every locator is `:visible`-scoped (Lesson 149).
 *
 * Budget: top bar 56 + bar 44 + gap ends by 110px, so the first
 * page-specific row starts there. Since #1832 the phone's section nav is the
 * bottom bar (fixed, out of flow), so that row is the page content itself:
 * the element after the section-bar nav in the DOM.
 */

const ROUTES = [
  '/district/61',
  '/district/61/changes',
  '/district/61/clubs',
  '/district/61/divisions',
  '/district/61/grid',
  '/district/61/trends',
  '/district/61/analytics',
  '/district/61/rankings',
  '/district/61/action-list',
] as const

const FIRST_ROW_TOP_MAX = 110

async function load(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready)
}

for (const width of [375, 390]) {
  for (const path of ROUTES) {
    test(`context bar replaces the header stack on ${path} at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 812 })
      await load(page, path)

      const m = await page.evaluate(() => {
        const box = (sel: string) => {
          const el = document.querySelector(sel)
          if (!el) return null
          const r = el.getBoundingClientRect()
          const cs = getComputedStyle(el)
          return {
            top: Math.round(r.top),
            bottom: Math.round(r.bottom),
            left: Math.round(r.left),
            right: Math.round(r.right),
            width: Math.round(r.width),
            height: Math.round(r.height),
            display: cs.display,
            position: cs.position,
          }
        }
        return {
          bar: box('[data-testid="context-bar"]'),
          back: box('[data-testid="context-bar-back"]'),
          chip: box('[data-testid="context-bar-chip"]'),
          h1: box('h1'),
          h1Text: document.querySelector('h1')?.textContent ?? '',
          lede: box('[data-testid="district-detail-lede"]'),
          toolbar: box('[role="toolbar"][aria-label="Data controls"]'),
          crumb: box('[data-testid="subpage-breadcrumb"]'),
          firstRow: (() => {
            const next = document.querySelector(
              '[data-testid="district-section-bar"]'
            )?.nextElementSibling
            if (!next) return null
            return { top: Math.round(next.getBoundingClientRect().top) }
          })(),
          docOverflow: document.documentElement.scrollWidth - window.innerWidth,
        }
      })
      const ctx = JSON.stringify(m)

      // The bar: one 44px sticky row directly under the 56px top bar.
      expect(m.bar?.display, ctx).not.toBe('none')
      expect(m.bar?.position, ctx).toBe('sticky')
      expect(m.bar?.height, ctx).toBe(44)
      expect(m.bar?.top, ctx).toBe(56)

      // Chip never clipped; both controls are 44px tap targets.
      expect(m.chip?.right ?? 999, ctx).toBeLessThanOrEqual(width)
      expect(m.chip?.left ?? -1, ctx).toBeGreaterThanOrEqual(0)
      expect(m.chip?.height ?? 0, ctx).toBeGreaterThanOrEqual(44)
      if (m.back) expect(m.back.width, ctx).toBeGreaterThanOrEqual(44)

      // The old stack is gone from view; the H1 stays in the DOM (visually
      // hidden) for a11y/SEO.
      expect(m.h1Text, ctx).toMatch(/District 61/)
      expect(m.h1?.height ?? 99, ctx).toBeLessThanOrEqual(1)
      expect(m.lede?.height ?? 0, ctx).toBe(0)
      expect(m.toolbar?.height ?? 0, ctx).toBe(0)
      expect(m.crumb?.height ?? 0, ctx).toBe(0)

      // First page-specific row starts within the budget.
      expect(m.firstRow?.top ?? 999, ctx).toBeLessThanOrEqual(FIRST_ROW_TOP_MAX)

      expect(m.docOverflow, ctx).toBeLessThanOrEqual(0)
    })
  }
}

/* Entity pages (#1831 rollout). No section nav: page content follows the
 * collapsed header directly, so the first content row itself must start
 * within the budget. `back` is the one-level-up target. Each rollout PR adds
 * its page here. */
const ENTITY_ROUTES: { path: string; name: RegExp; back: string }[] = [
  { path: '/district/61/division/A', name: /Division A/, back: '/district/61' },
]
const ENTITY_CONTENT_TOP_MAX = 120

for (const width of [375, 390]) {
  for (const { path, name, back } of ENTITY_ROUTES) {
    test(`context bar replaces the entity header on ${path} at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 812 })
      await load(page, path)
      const bar = page.locator('[data-testid="context-bar"]')
      await expect(bar).toBeVisible()

      const m = await page.evaluate(() => {
        const r = (el: Element | null) => {
          if (!el) return null
          const b = el.getBoundingClientRect()
          return { top: Math.round(b.top), height: Math.round(b.height) }
        }
        const header = document.querySelector(
          '.context-bar ~ header, .context-bar ~ * header'
        )
        // First visible element after the (collapsed) header.
        let next = header?.nextElementSibling ?? null
        while (next && next.getBoundingClientRect().height === 0)
          next = next.nextElementSibling
        return {
          bar: r(document.querySelector('[data-testid="context-bar"]')),
          barPos: getComputedStyle(
            document.querySelector('[data-testid="context-bar"]')!
          ).position,
          h1: r(document.querySelector('h1')),
          h1Text: document.querySelector('h1')?.textContent ?? '',
          crumb: r(document.querySelector('.subpage-breadcrumb')),
          toolbar: r(
            document.querySelector(
              '[role="toolbar"][aria-label="Data controls"]'
            )
          ),
          contentTop: next
            ? Math.round(next.getBoundingClientRect().top)
            : null,
          docOverflow: document.documentElement.scrollWidth - window.innerWidth,
        }
      })
      const ctx = JSON.stringify(m)
      expect(m.barPos, ctx).toBe('sticky')
      expect(m.bar, ctx).toEqual({ top: 56, height: 44 })
      expect(m.h1Text, ctx).toMatch(name)
      expect(m.h1?.height ?? 99, ctx).toBeLessThanOrEqual(1)
      expect(m.crumb?.height ?? 0, ctx).toBe(0)
      expect(m.toolbar?.height ?? 0, ctx).toBe(0)
      expect(m.contentTop ?? 999, ctx).toBeLessThanOrEqual(
        ENTITY_CONTENT_TOP_MAX
      )
      expect(m.docOverflow, ctx).toBeLessThanOrEqual(0)
      await expect(
        bar.locator('[data-testid="context-bar-back"]')
      ).toHaveAttribute('href', back)
    })
  }
}

test('chip opens an accessible bottom sheet with 16px selects; Escape closes it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await load(page, '/district/61/clubs')
  const chip = page.locator('[data-testid="context-bar-chip"]:visible')
  await chip.click()
  const sheet = page.getByRole('dialog', { name: 'District 61' })
  await expect(sheet).toBeVisible()
  // Measure after the slide-in settles (the transform moves the box).
  await sheet.evaluate(el =>
    Promise.all(el.getAnimations().map(a => a.finished))
  )

  const fonts = await sheet
    .locator('select')
    .evaluateAll(els => els.map(e => parseFloat(getComputedStyle(e).fontSize)))
  expect(fonts.length).toBe(2)
  for (const f of fonts) expect(f).toBeGreaterThanOrEqual(16)

  // The sheet sits inside the viewport (bottom-anchored).
  const box = await sheet.boundingBox()
  expect(box).not.toBeNull()
  expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBeLessThanOrEqual(
    812
  )

  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(chip).toBeFocused()
})

test('changing the program year in the sheet round-trips through ?py=', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await load(page, '/district/61/clubs')
  await page.locator('[data-testid="context-bar-chip"]:visible').click()
  const py = page.getByRole('dialog').getByLabel('Program year')
  const options = await py
    .locator('option')
    .evaluateAll(os => os.map(o => (o as HTMLOptionElement).value))
  // Pick the oldest year so the URL must carry an explicit ?py=.
  const target = options[options.length - 1]
  test.skip(!target || options.length < 2, 'district has one program year')
  await py.selectOption(target!)
  await expect(page).toHaveURL(new RegExp(`[?&]py=${target}\\b`))
  await page.keyboard.press('Escape')
  await expect(
    page.locator('[data-testid="context-bar-chip"]:visible')
  ).toContainText(`PY ${target!.slice(-2)}–`)
})

for (const width of [768, 1280]) {
  test(`desktop header unchanged and no context bar at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await load(page, '/district/61/clubs')
    await expect(page.locator('[data-testid="context-bar"]')).toBeHidden()
    await expect(
      page.locator('[data-testid="district-detail-lede"]')
    ).toBeVisible()
    await expect(
      page.getByRole('toolbar', { name: 'Data controls' })
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="subpage-breadcrumb"]')
    ).toBeVisible()
  })
}
