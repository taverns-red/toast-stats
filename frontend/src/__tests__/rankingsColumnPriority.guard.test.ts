/**
 * Static guard for the rankings table's responsive column ladder (#1358).
 *
 * Reads the CSS and the page source as TEXT rather than mounting
 * DistrictsPage: jsdom has no layout engine, so a mount could not prove a
 * media query anyway, and mounting this page is the exact contention cost
 * Lesson 51 warns about. Reading by `fs` also keeps this out of R22's
 * page-mount check, which keys on importing `pages/*Page`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(
  join(__dirname, '../styles/components/app-shell.css'),
  'utf-8'
)
const page = readFileSync(
  join(__dirname, '../pages/DistrictsPage.tsx'),
  'utf-8'
)

describe('rankings column priority ladder (#1358)', () => {
  // The dead zone: a 360x640 phone in LANDSCAPE is 640px — 70% wider than the
  // 375px design target, yet below the 768px tablet breakpoint, so it was
  // served the bare District/Rank/Score set with no orientation or zoom that
  // could reveal a metric.
  it('reveals the compact columns at 600px, closing the 640px landscape gap', () => {
    expect(css).toMatch(
      /@media\s*\(min-width:\s*600px\)\s*\{\s*\.districts-rankings-table__col--compact\s*\{\s*display:\s*table-cell/
    )
  })

  it('keeps compact columns hidden by default (mobile-first)', () => {
    expect(css).toMatch(
      /\.districts-rankings-table__col--compact[\s\S]{0,120}?display:\s*none/
    )
  })

  it('leaves the existing 768 / 1280 rungs intact', () => {
    expect(css).toMatch(
      /@media\s*\(min-width:\s*768px\)\s*\{\s*\.districts-rankings-table__col--tablet/
    )
    expect(css).toMatch(
      /@media\s*\(min-width:\s*1280px\)\s*\{\s*\.districts-rankings-table__col--desktop/
    )
  })

  // Paid Clubs and Total Payments dominate the Borda score, so they are the
  // two worth surfacing first on a narrow screen. Distinguished stays at 768.
  // Counts MARKUP only — the ` px-` suffix is the utility-class run that
  // follows in a real class attribute, which keeps prose mentions of these
  // class names in the surrounding code comments from inflating the count.
  it('promotes Paid Clubs and Total Payments to the compact tier', () => {
    const compactCells = page.match(
      /districts-rankings-table__col--compact px-/g
    )
    // 2 headers + 2 body cells
    expect(compactCells?.length).toBe(4)
  })

  it('leaves Distinguished on the tablet tier', () => {
    const tabletCells = page.match(/districts-rankings-table__col--tablet px-/g)
    // 1 header + 1 body cell
    expect(tabletCells?.length).toBe(2)
  })
})
