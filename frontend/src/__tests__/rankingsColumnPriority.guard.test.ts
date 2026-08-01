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
  // Counts MARKUP only — matched inside a class attribute so prose mentions
  // of these class names in surrounding code comments can't inflate the
  // count. (Deliberately not keyed on a trailing utility class: the padding
  // utilities were removed in the density pass, #1358.)
  const cellsWith = (cls: string) =>
    page.match(
      new RegExp(`(?:className|thClassName)="[^"]*${cls}(?:[ "])`, 'g')
    ) ?? []

  it('promotes Paid Clubs and Total Payments to the compact tier', () => {
    // 2 headers + 2 body cells
    expect(cellsWith('districts-rankings-table__col--compact').length).toBe(4)
  })

  it('leaves Distinguished on the tablet tier', () => {
    // 1 header + 1 body cell
    expect(cellsWith('districts-rankings-table__col--tablet').length).toBe(2)
  })
})

describe('rankings table density (#1358 follow-up)', () => {
  // Layer order in index.css is `base, brand, utilities` — utilities LAST, so
  // Tailwind's px-*/py-* beat the `.districts-rankings-table td` rule in the
  // brand layer regardless of specificity. Cells carrying padding utilities
  // therefore silently override the table's own density, and the two sources
  // drift. CSS is the single source of truth; markup carries none.
  it('leaves cell padding to CSS — no padding utilities on table cells', () => {
    const padded = page.match(
      /(?:className|thClassName)="[^"]*districts-rankings-table__(?:col--|sticky-col)[^"]*p[xy]-\d/g
    )
    expect(padded).toBeNull()
  })

  // The sticky identity column is subtracted from EVERY viewport before a
  // metric renders, so an award-decorated district must not set the width for
  // the whole table on a phone.
  it('caps the sticky District column on small screens', () => {
    expect(css).toMatch(
      /\.districts-rankings-table__sticky-col[\s\S]{0,200}?max-width/
    )
  })

  // Award chips were icon + text label. Below the compact breakpoint the label
  // is visually hidden but kept for assistive tech (sr-only, not display:none)
  // — a trophy alone is meaningless to a screen reader.
  it('renders award chip labels icon-only on narrow screens', () => {
    const srOnlyLabels = page.match(/className="sr-only sm:not-sr-only[^"]*"/g)
    // Extension, 20-Plus, Retention
    expect(srOnlyLabels?.length).toBe(3)
  })

  // The td said `whitespace-nowrap` while its inner flex said `flex-wrap` —
  // contradictory. The chips are meant to wrap rather than widen the column.
  it('does not force the District cell to a single line', () => {
    const stickyCell = page.match(
      /className="[^"]*districts-rankings-table__sticky-col[^"]*"/g
    )
    expect(stickyCell?.some(c => c.includes('whitespace-nowrap'))).toBe(false)
  })
})
