import { test, expect, type Page } from './fixtures/test'

/* The "Privacy & cookies" button must sit in its row like the links beside it
 * (#2891, follow-up to #2889 and #2890).
 *
 * base.css gives every <button> a 44px minimum height. The footer links around
 * it are inline <a>, where min-height does nothing (18px), so on a mouse the
 * button became a 44px box with its text centred, about 13px lower than its
 * neighbours. Headless checks that compared item tops saw nothing wrong
 * because every item top was equal; only the text moved.
 *
 * So this measures rendered geometry, not CSS rules: the button's box height,
 * and where its text starts below the top of its own footer item, against a
 * sibling link ("Red Taverns", same list, same row). Items share a top, so the
 * text offset within the item is the visible misalignment.
 *
 * Pointer: Playwright's desktop contexts have no touch, so
 * (pointer: fine) matches in both engines. The 44px box under a coarse
 * pointer is deliberate and is covered by touch-targets.smoke.ts.
 *
 * Where it applies:
 *  - the footer at 1280px (the #2890 fix);
 *  - the About menu (AppMeta inside .app-shell-nav-about__content) at 375px
 *    and 700px, which a narrow desktop window with a mouse reaches.
 *
 * Checked against the #2889 bug: with the footer's (pointer: fine) rule
 * disabled in consent.css, the 1280px test fails in Chromium and WebKit
 * ("button is 44px tall, link 17px"). With the rule in place it passes.
 */

const TOLERANCE_PX = 2
const THEMES = ['light', 'dark'] as const

interface Metrics {
  boxH: number
  /** Top of the rendered text, relative to the top of its footer item. */
  textOffset: number
}

async function measure(
  page: Page,
  scope: string
): Promise<{
  button: Metrics
  link: Metrics
}> {
  return page.evaluate(sel => {
    const root = document.querySelector(sel)
    if (!root) throw new Error(`no ${sel}`)
    const one = (el: Element | null): Metrics => {
      if (!el) throw new Error('missing element')
      const item = el.closest('.app-shell-footer__item')
      if (!item) throw new Error('no footer item')
      const range = document.createRange()
      range.selectNodeContents(el)
      return {
        boxH: el.getBoundingClientRect().height,
        textOffset:
          range.getBoundingClientRect().top - item.getBoundingClientRect().top,
      }
    }
    return {
      button: one(root.querySelector('button.consent-reopen')),
      link: one(
        Array.from(root.querySelectorAll('a')).find(
          a => a.textContent?.trim() === 'Red Taverns'
        ) ?? null
      ),
    }
  }, scope)
}

function expectAligned(
  m: { button: Metrics; link: Metrics },
  where: string
): void {
  const dh = Math.abs(m.button.boxH - m.link.boxH)
  const dt = Math.abs(m.button.textOffset - m.link.textOffset)
  expect(
    dh,
    `${where}: button is ${m.button.boxH}px tall, link ${m.link.boxH}px`
  ).toBeLessThanOrEqual(TOLERANCE_PX)
  expect(
    dt,
    `${where}: button text starts ${m.button.textOffset.toFixed(1)}px below ` +
      `its item top, link text ${m.link.textOffset.toFixed(1)}px`
  ).toBeLessThanOrEqual(TOLERANCE_PX)
}

async function load(page: Page, theme: string): Promise<void> {
  await page.addInitScript(t => {
    window.localStorage.setItem('theme', t)
  }, theme)
  await page.goto('/', { waitUntil: 'load', timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready)
  expect(await page.getAttribute('html', 'data-theme')).toBe(theme)
}

for (const theme of THEMES) {
  for (const width of [768, 1280]) {
    test(`footer privacy button lines up with the links — ${width}px ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await load(page, theme)
      await expect(
        page.locator('.app-shell-footer button.consent-reopen')
      ).toBeVisible({ timeout: 20_000 })
      expect(
        await page.evaluate(() => matchMedia('(pointer: fine)').matches),
        'this test needs a fine pointer'
      ).toBe(true)
      expectAligned(
        await measure(page, '.app-shell-footer'),
        `${width}/${theme}`
      )
    })
  }

  for (const width of [375, 700]) {
    test(`About menu privacy button lines up with the links — ${width}px ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await load(page, theme)
      expect(
        await page.evaluate(() => matchMedia('(pointer: fine)').matches),
        'this test needs a fine pointer'
      ).toBe(true)
      await page.getByRole('button', { name: 'Open menu' }).click()
      await page.locator('summary.app-shell-nav-about__summary').click()
      await expect(
        page.locator('.app-shell-nav-about__content button.consent-reopen')
      ).toBeVisible()
      expectAligned(
        await measure(page, '.app-shell-nav-about__content'),
        `About ${width}/${theme}`
      )
    })
  }
}
