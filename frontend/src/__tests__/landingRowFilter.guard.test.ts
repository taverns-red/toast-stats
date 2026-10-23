/**
 * Landing row filter (#2249, review B2): the "Filter districts" input is a
 * touch target and must be ≥ 44px tall (WCAG 2.5.5; the preview tripwire
 * `touch-targets.smoke.ts` measured 42px). jsdom has no layout (Lesson
 * 66), so this pins the CSS contract; the smoke proves the geometry live.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(
  resolve(here, '../styles/components/landing-search.css'),
  'utf8'
)

describe('landing row filter touch target (#2249 B2)', () => {
  it('floors the filter input at 44px', () => {
    expect(css).toMatch(
      /\.districts-toolbar__row--filter\s+\.districts-toolbar__search-input\s*\{[^}]*min-height:\s*44px/
    )
  })
})

/* Landing H1 at tablet widths (#2249, preview smoke
   landing-header-tablet.smoke.ts): measured on the preview, the intro column
   is 394px at 1024 (the actions share the row) while "Find a district, club
   or region" needs 419px at 28px, so it wrapped. At 25px (374px) the Linux
   Chromium smoke still wrapped: its classic ~15px scrollbar narrows the
   column to ~379px and rasterisation eats the rest; 23px (~344px) leaves
   ~35px of slack. Landing-only (.districts-page-root), 900–1099px. */
describe('landing H1 fits beside the actions at 1024 (#2249)', () => {
  it('sizes the landing title down in the 900–1099px band', () => {
    expect(css).toMatch(
      /@media\s*\(min-width:\s*900px\)\s*and\s*\(max-width:\s*1099px\)\s*\{[^}]*\.districts-page-root\s+\.districts-page-header__title\s*\{[^}]*font-size:\s*23px/
    )
  })
})
