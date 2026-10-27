import { test, expect, type Page } from './fixtures/test'

/* Club names in the Education leaderboards (#2361).
 *
 * The two leaderboards on /district/:id/education are fixed-layout tables:
 * Rank (48 px), Club, "Awards / base" (88 px) and Rate (72 px). On a phone
 * the fixed columns left the Club column 26 px wide at 320 and 81 px at 375,
 * and `break-words` split names mid-word ("Toastmaste / rs"). Below 768 the
 * count now sits under the rate in one column, so the name gets the width.
 *
 * Measured on the deployed build (BASE_URL) by bounding box (Lesson 134),
 * with both leaderboards expanded (every ranked and not-eligible club), in
 * light and dark: every word of every club name sits on one line (a word
 * split across lines is a mid-word break; a hyphenated name may wrap after
 * its hyphen), the name stays inside its cell,
 * every row still shows its "n / d" count and its rate, and the page never
 * scrolls sideways with the `overflow-x:hidden` mask off. */

const EDUCATION = '/district/86/education'
const BOARD = '[data-testid="education-awards-leaderboard"]'

async function load(page: Page): Promise<void> {
  await page.goto(EDUCATION, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.locator(`${BOARD} tbody a`).first().waitFor({ timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready)
}

async function expandAll(page: Page): Promise<void> {
  const more = page.locator(BOARD).getByRole('button', { name: /^Show all/ })
  // Each click turns its button into "Show fewer", so take the first left.
  for (let n = await more.count(); n > 0; n--) {
    await more.first().click()
    await expect(more).toHaveCount(n - 1)
  }
}

interface Geometry {
  width: number
  docOverflow: number
  theme: string | null
  rows: {
    name: string
    /** Words whose box spans more than one line: broken mid-word. */
    brokenWords: string[]
    nameInCell: boolean
    /** The row's rendered text (innerText skips display:none). */
    text: string
  }[]
}

async function measure(page: Page): Promise<Geometry> {
  await page.addStyleTag({
    content: 'html,body{overflow-x:visible !important}',
  })
  return page.evaluate(sel => {
    const rows = Array.from(document.querySelectorAll(`${sel} tbody tr`))
      .filter(tr => tr.getBoundingClientRect().height > 0)
      .map(tr => {
        const a = tr.querySelector('a') as HTMLAnchorElement
        const td = a.closest('td') as HTMLElement
        const textNode = a.firstChild as Text
        const text = textNode.data
        const brokenWords: string[] = []
        // A word, or one part of a hyphenated word: "Kitchener-Waterloo" may
        // wrap after its hyphen, a legitimate break opportunity.
        for (const m of text.matchAll(/[^\s-]+-?/g)) {
          const range = document.createRange()
          range.setStart(textNode, m.index)
          range.setEnd(textNode, m.index + m[0].length)
          const tops = new Set(
            Array.from(range.getClientRects())
              .filter(r => r.width > 0)
              .map(r => Math.round(r.top))
          )
          if (tops.size > 1) brokenWords.push(m[0])
        }
        const cell = td.getBoundingClientRect()
        const name = a.getBoundingClientRect()
        return {
          name: text,
          brokenWords,
          nameInCell:
            name.left >= cell.left - 0.5 && name.right <= cell.right + 0.5,
          text: (tr as HTMLElement).innerText,
        }
      })
    return {
      width: window.innerWidth,
      docOverflow: document.documentElement.scrollWidth - window.innerWidth,
      theme: document.documentElement.getAttribute('data-theme'),
      rows,
    }
  }, BOARD)
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [320, 375, 390, 768, 1280]) {
    test(`education leaderboard names at ${width}px (${theme}) wrap at word boundaries`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.setViewportSize({ width, height: 844 })
      await load(page)
      await expandAll(page)
      const g = await measure(page)
      const ctx = JSON.stringify({ ...g, rows: g.rows.length })
      expect(g.theme, ctx).toBe(theme)
      expect(g.docOverflow, ctx).toBeLessThanOrEqual(0)
      expect(g.rows.length, ctx).toBeGreaterThan(20)
      for (const r of g.rows) {
        const rc = JSON.stringify(r)
        expect(r.brokenWords, rc).toEqual([])
        expect(r.nameInCell, rc).toBe(true)
        expect(r.text, rc).toMatch(/\d+ \/ \d+/)
        expect(r.text, rc).toMatch(/\d+\.\d%/)
      }
    })
  }
}
