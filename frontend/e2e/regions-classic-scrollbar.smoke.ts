import { test, expect } from './fixtures/test'

/* The regions leaderboard fits with a classic Windows scrollbar (#3266).
 *
 * Headless Chromium hides scrollbars, and macOS, iOS and Android overlay
 * theirs, so regions-training.smoke.ts never sees the 17px a Windows visitor
 * loses. Here Chromium runs without --hide-scrollbars and the page styles a
 * 17px scrollbar, which takes real width. At 768, 1024 and 1280 the table
 * must fit its container and no cell's text may spill past its own content
 * box (a narrow column overruns its neighbour instead of wrapping).
 * launchOptions is per worker, so this lives in its own file. */

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

const CLASSIC_SCROLLBAR_PX = 17
const THEMES = ['light', 'dark'] as const

for (const theme of THEMES) {
  for (const width of [768, 1024, 1280]) {
    test(`regions leaderboard fits with a classic scrollbar at ${width}px (${theme})`, async ({
      page,
      browserName,
    }) => {
      test.skip(
        browserName !== 'chromium',
        '::-webkit-scrollbar width and --hide-scrollbars are Chromium-only'
      )
      test.setTimeout(90_000)
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/regions', { waitUntil: 'networkidle', timeout: 60_000 })
      await page.addStyleTag({
        content: `html { overflow-y: scroll }
          ::-webkit-scrollbar { width: ${CLASSIC_SCROLLBAR_PX}px; height: ${CLASSIC_SCROLLBAR_PX}px }
          ::-webkit-scrollbar-thumb { background: #888 }`,
      })
      const table = page.locator('table[aria-label="Region rankings"]').first()
      await table.waitFor({ state: 'visible', timeout: 30_000 })
      await page.evaluate(() => document.fonts.ready)

      // The emulation took: the page is 17px narrower than the viewport.
      expect(
        await page.evaluate(() => document.documentElement.clientWidth)
      ).toBe(width - CLASSIC_SCROLLBAR_PX)

      // The table's layout follows the resize a frame later.
      await expect
        .poll(() =>
          table.evaluate(t => t.scrollWidth <= t.parentElement!.clientWidth)
        )
        .toBe(true)

      const m = await table.evaluate(t => {
        const scroller = t.parentElement as HTMLElement
        const heads = [...t.querySelectorAll('thead th')]
        const rows = [...t.querySelectorAll('tbody tr')]
        const spills: string[] = []
        // A header's sort button has its own padding, and the th has none,
        // so header text and icons are held to the button's content box.
        const contentBox = (el: Element) => {
          const box = el.getBoundingClientRect()
          const cs = getComputedStyle(el)
          return {
            left:
              box.left +
              parseFloat(cs.borderLeftWidth) +
              parseFloat(cs.paddingLeft),
            right:
              box.right -
              parseFloat(cs.borderRightWidth) -
              parseFloat(cs.paddingRight),
          }
        }
        heads.forEach((th, i) => {
          const name = (th.textContent ?? '').trim()
          for (const cell of [th, ...rows.map(tr => tr.children[i])]) {
            if (!(cell instanceof HTMLElement)) continue
            const boxOf = (el: Element) => {
              const button = el.closest('button')
              return contentBox(button && cell.contains(button) ? button : cell)
            }
            const check = (
              el: Element,
              rects: Iterable<DOMRect>,
              what: string
            ) => {
              const { left, right } = boxOf(el)
              for (const r of rects) {
                if (
                  r.width > 0 &&
                  (r.right > right + 0.5 || r.left < left - 0.5)
                )
                  spills.push(`${name}: ${what}`)
              }
            }
            const walk = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
            for (let n = walk.nextNode(); n; n = walk.nextNode()) {
              const parent = n.parentElement
              if (!parent || parent.closest('.sr-only')) continue
              if (!(n.textContent ?? '').trim()) continue
              const range = document.createRange()
              range.selectNodeContents(n)
              check(
                parent,
                range.getClientRects(),
                `"${n.textContent!.trim()}"`
              )
            }
            for (const icon of cell.querySelectorAll('svg')) {
              if (icon.closest('.sr-only')) continue
              check(icon, [icon.getBoundingClientRect()], 'icon')
            }
          }
        })
        return {
          tableWidth: t.scrollWidth,
          containerWidth: scroller.clientWidth,
          spills: [...new Set(spills)],
        }
      })
      const ctx = JSON.stringify(m)
      expect(m.tableWidth, ctx).toBeLessThanOrEqual(m.containerWidth)
      expect(m.spills, ctx).toEqual([])
      await expect(
        page.locator('.dt-scroll-wrap[data-scrollable-end="true"]')
      ).toHaveCount(0)
    })
  }
}
