import { test, expect, type Page } from './fixtures/test'

/* Council print packs (#2299): the page count is the acceptance criterion.
 *
 * An area pack is one page and a division pack is two (a one-page summary,
 * then the full club roster on a forced second page), on both A4 and Letter:
 * print.css sets `@page { size: auto }`, so the paper follows the printer and
 * the layout is designed to the box both papers share (698 x 931 CSS px at
 * the print.css margins).
 *
 * Chromium renders a real PDF at each paper size and counts its pages. WebKit
 * has no `page.pdf`, so it lays the pack out in print media at the printable
 * width and checks each printed page's content fits the printable height.
 *
 * Division B is D61's largest (28 clubs over 5 areas), so it is the roster's
 * worst case; every area of it gets an area pack check.
 */

const LARGEST_DIVISION = '/district/61/division/B'
const OTHER_DIVISION = '/district/61/division/A'

/* print.css `@page` margins, passed explicitly so the PDF matches a real
   print dialog regardless of how headless Chromium treats CSS margins. */
const MARGIN = { top: '0.6in', right: '0.5in', bottom: '0.7in', left: '0.5in' }

/* The box A4 and Letter share at those margins, in CSS px (96/in):
   width min(7.5in, 7.27in), height min(9.7in, 10.39in). */
const PRINT_BOX = { width: 698, height: 931 }

async function openPack(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
  await page
    .locator('[data-testid="council-pack"]:not([aria-busy="true"])')
    .waitFor({ state: 'visible', timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
}

/** Page objects in a Chromium (Skia) PDF: `/Type /Page`, not `/Pages`. */
function pdfPageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)\b/g) ?? []).length
}

/** Horizontal overflow of the document in px (> 0: wider than the paper). */
function printOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  )
}

async function areaPackPaths(page: Page): Promise<string[]> {
  await openPack(page, `${LARGEST_DIVISION}/print`)
  const ids = await page
    .locator('[data-testid="council-pack-areas"] [data-area-id]')
    .evaluateAll(rows => rows.map(r => r.getAttribute('data-area-id') ?? ''))
  expect(ids.length).toBeGreaterThan(0)
  return ids.map(id => `${LARGEST_DIVISION}/area/${id}/print`)
}

test.describe('council packs print to their page budget (Chromium PDF)', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'page.pdf is Chromium-only; WebKit runs the height check below'
  )

  for (const division of [LARGEST_DIVISION, OTHER_DIVISION]) {
    test(`division pack ${division} is 2 pages on Letter and A4`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: PRINT_BOX.width, height: 1000 })
      await openPack(page, `${division}/print`)
      await page.emulateMedia({ media: 'print' })
      // Chromium's PDF shrinks an over-wide page to fit, which would hide a
      // roster wider than the paper; measure the width at the printable box.
      expect(
        await printOverflow(page),
        `${division} width`
      ).toBeLessThanOrEqual(0)
      for (const format of ['Letter', 'A4'] as const) {
        const pdf = await page.pdf({ format, margin: MARGIN })
        expect(pdfPageCount(pdf), `${division} on ${format}`).toBe(2)
      }
    })
  }

  test('every area pack of the largest division is 1 page on Letter and A4', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    for (const path of await areaPackPaths(page)) {
      await page.setViewportSize({ width: PRINT_BOX.width, height: 1000 })
      await page.emulateMedia({ media: 'screen' })
      await openPack(page, path)
      await page.emulateMedia({ media: 'print' })
      expect(await printOverflow(page), `${path} width`).toBeLessThanOrEqual(0)
      for (const format of ['Letter', 'A4'] as const) {
        const pdf = await page.pdf({ format, margin: MARGIN })
        expect(pdfPageCount(pdf), `${path} on ${format}`).toBe(1)
      }
    }
  })

  test('the printed pack carries its dates and source, and no app chrome', async ({
    page,
  }) => {
    await openPack(page, `${LARGEST_DIVISION}/print`)
    await page.emulateMedia({ media: 'print' })
    const footer = page.locator('[data-testid="council-pack-footer"]')
    await expect(footer).toContainText('Toastmasters International')
    await expect(footer).toContainText('Data as of')
    await expect(footer).toContainText('Printed')
    for (const chrome of [
      '.app-shell-top-bar',
      '.context-bar',
      '.section-bar',
      '.district-subnav',
      '.council-pack__screen-only',
    ]) {
      const visible = await page
        .locator(chrome)
        .evaluateAll(els =>
          els.some(el => getComputedStyle(el).display !== 'none')
        )
      expect(visible, `${chrome} prints`).toBe(false)
    }
  })
})

test.describe('council packs fit the printable box (WebKit print layout)', () => {
  test.skip(
    ({ browserName }) => browserName !== 'webkit',
    'Chromium measures real PDF pages above'
  )

  async function printedHeights(page: Page, path: string) {
    await page.setViewportSize({ width: PRINT_BOX.width, height: 1000 })
    await page.emulateMedia({ media: 'screen' })
    await openPack(page, path)
    await page.emulateMedia({ media: 'print' })
    return page.evaluate(() => {
      const h = (sel: string) => {
        const el = document.querySelector(sel)
        return el ? el.getBoundingClientRect().height : null
      }
      return {
        pack: h('[data-testid="council-pack"]'),
        page1: h('.council-pack__page'),
        roster: h('.council-pack__roster--own-page'),
        overflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        chromeShown: [
          '.app-shell-top-bar',
          '.context-bar',
          '.council-pack__screen-only',
        ].some(sel =>
          [...document.querySelectorAll(sel)].some(
            el => getComputedStyle(el).display !== 'none'
          )
        ),
      }
    })
  }

  test('division packs: page 1 and the roster page each fit', async ({
    page,
  }) => {
    for (const division of [LARGEST_DIVISION, OTHER_DIVISION]) {
      const m = await printedHeights(page, `${division}/print`)
      expect(m.page1, `${division} page 1`).not.toBeNull()
      expect(m.page1!).toBeLessThanOrEqual(PRINT_BOX.height)
      expect(m.roster, `${division} roster`).not.toBeNull()
      expect(m.roster!).toBeLessThanOrEqual(PRINT_BOX.height)
      expect(m.overflow).toBeLessThanOrEqual(0)
      expect(m.chromeShown).toBe(false)
    }
  })

  test('area packs of the largest division each fit one page', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    for (const path of await areaPackPaths(page)) {
      const m = await printedHeights(page, path)
      expect(m.pack, path).not.toBeNull()
      expect(m.pack!, path).toBeLessThanOrEqual(PRINT_BOX.height)
      expect(m.overflow).toBeLessThanOrEqual(0)
      expect(m.chromeShown).toBe(false)
    }
  })
})
