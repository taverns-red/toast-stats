/**
 * Static guard for the landing rankings table on the shared DataTable (#2689,
 * #2676, spec §14 M1). Replaces the #1358 column-priority ladder guard: the
 * ladder is gone, and the rules below are what now keeps it gone.
 *
 * Reads CSS and source as TEXT (not a page mount): jsdom has no layout engine,
 * and a mount is the contention cost Lesson 51 warns about.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = (rel: string): string =>
  readFileSync(join(__dirname, '..', rel), 'utf-8')

const TABLE_FILE = 'components/DistrictRankingsTable.tsx'

describe('landing rankings table: no CSS-hidden columns (Ron, 2026-11-12)', () => {
  it('lives in its own component on the DataTable foundation', () => {
    expect(existsSync(join(__dirname, '..', TABLE_FILE))).toBe(true)
    expect(src(TABLE_FILE)).toMatch(/<DataTable\b/)
  })

  it('has no __col--compact/tablet/desktop rule in any stylesheet', () => {
    for (const css of [
      'styles/components/app-shell.css',
      'styles/components/priority-columns.css',
      'styles/dark-mode.css',
    ]) {
      expect(src(css), css).not.toMatch(/districts-rankings-table__col--/)
    }
  })

  it('has no __col--* class in the page or the table component', () => {
    expect(src('pages/DistrictsPage.tsx')).not.toMatch(/__col--/)
    if (existsSync(join(__dirname, '..', TABLE_FILE))) {
      expect(src(TABLE_FILE)).not.toMatch(/__col--/)
    }
  })
})

describe('landing rankings table: legacy palette and the 14px floor', () => {
  const table = (): string => src(TABLE_FILE)

  it('uses no raw yellow or amber utility (rank badges, star, my-district)', () => {
    expect(table()).not.toMatch(/\b(?:bg|text|border)-(?:yellow|amber)-\d/)
  })

  it('sets no sub-14px text size on the table cells', () => {
    expect(table()).not.toMatch(/\btext-(?:xs|\[(?:9|10|11|12|13)px\])\b/)
  })

  it('marks my district with a left bar token and visible text, not a tint', () => {
    expect(table()).toMatch(/Your district/)
    expect(table()).not.toMatch(/data-row-tint/)
  })
})
