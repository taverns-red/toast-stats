import type { Page } from '../fixtures/test'

/* Scroll to the end of the page and keep going until it stops growing or
 * shrinking, leaving the page at its real end (#2576).
 *
 * The district trophy case and growth card hold their reads, and show a still
 * placeholder, until they near the viewport (#2513). Scrolling instantly to
 * the end brings them near, they load, and the page height changes after the
 * scroll: the browser then clamps the scroll position, and a measurement taken
 * straight after the first scroll sees a page that has since moved by a few
 * pixels. A reader's scroll would settle; so does this. `html` has
 * scroll-behavior: smooth (index.css), so scroll with `instant`.
 */
export async function scrollUntilStable(page: Page): Promise<void> {
  let last = -1
  for (let i = 0; i < 10; i++) {
    const height = await page.evaluate(() => {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: 'instant',
      })
      return document.documentElement.scrollHeight
    })
    await page.waitForTimeout(700)
    if (height === last) break
    last = height
  }
  // One last scroll: the height held still, but the position may not have
  // followed the final change.
  await page.evaluate(() =>
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: 'instant',
    })
  )
}
