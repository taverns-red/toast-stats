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

/* Bring every held card to its real state, then settle (#2578).
 *
 * `scrollUntilStable` jumps to the end of the page, and on the hub the
 * trophy case sits well above the end: it never comes within the 600px
 * margin, so it stays a held placeholder (taller than the card it stands for,
 * 640px against 533px for D61) and the measured page is longer than any
 * reader's. A reader scrolls through the page; this does too: each held slot
 * is scrolled to in turn until its placeholder is gone, then the page is
 * scrolled to its settled end. Measure after this, not after
 * `scrollUntilStable` alone, when the page height is the question.
 */
export async function loadHeldCards(page: Page): Promise<void> {
  for (const slot of ['trophy-case-slot', 'growth-slot']) {
    const held = page.locator(`[data-testid="${slot}"] [data-testid$="-held"]`)
    for (let i = 0; i < 10 && (await held.count()) > 0; i++) {
      await page.evaluate(id => {
        document
          .querySelector(`[data-testid="${id}"]`)
          ?.scrollIntoView({ behavior: 'instant', block: 'center' })
      }, slot)
      await page.waitForTimeout(700)
    }
    // Still held after ten tries: the cap would be measured on a partial
    // page, which is the bug this guards.
    if ((await held.count()) > 0) {
      throw new Error(
        `${slot} is still a held placeholder after scrolling to it`
      )
    }
  }
  await scrollUntilStable(page)
}
