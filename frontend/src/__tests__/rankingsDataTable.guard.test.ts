/**
 * Static guard for the landing rankings table on the shared DataTable (#2689,
 * #2676, spec §14 M1). Replaces the #1358 column-priority ladder guard: the
 * ladder is gone, and the rules below are what now keeps it gone.
 *
 * Reads CSS and source as TEXT (not a page mount): jsdom has no layout engine,
 * and a mount is the contention cost Lesson 51 warns about.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = (rel: string): string =>
  readFileSync(join(__dirname, '..', rel), 'utf-8')

const TABLE_FILE = 'components/DistrictRankingsTable.tsx'
/** Everything that renders a cell of the rankings table. */
const TABLE_SOURCES = [
  TABLE_FILE,
  'components/rankingsColumns.tsx',
  'components/rankingsCells.tsx',
]

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

// #2689: DistrictsPage is in the entry chunk (the landing route is eager). A
// static import of the table pulls TanStack Table and the DataTable into that
// chunk, so every route (the club page's Lighthouse budget failed by 2.1 KB)
// pays for a table only the landing page shows. It loads on its own chunk.
describe('landing rankings table: only the landing route pays for its code', () => {
  it('DistrictsPage reaches the table through the lazy wrapper, not a static import', () => {
    const page = src('pages/DistrictsPage.tsx')
    expect(page).not.toMatch(
      /^import\s+(?!type\b)[^;]*from\s+'\.\.\/components\/DistrictRankingsTable'/m
    )
    expect(page).toMatch(/LazyDistrictRankingsTable/)
  })

  it('the lazy wrapper imports the table dynamically', () => {
    expect(src('components/lazy/districtRankingsTableChunk.ts')).toMatch(
      /import\(\s*'\.\.\/DistrictRankingsTable'\s*\)/
    )
  })
})

// A test that mounts DistrictsPage waits on the table's chunk, and the first
// dynamic import of it costs a module transform: 1155 ms in CI under load,
// against findBy's 1000 ms (run 43328115244). Warming it at import time puts
// that cost in collection, which has its own budget, so no test timeout moves.
describe('landing rankings table: page tests warm the lazy chunk', () => {
  const dir = join(__dirname, '..', 'pages', '__tests__')
  const mounts = readdirSync(dir).filter(
    f =>
      /\.test\.tsx$/.test(f) &&
      /from '\.\.\/DistrictsPage'/.test(readFileSync(join(dir, f), 'utf-8'))
  )

  it('finds the DistrictsPage mounting tests', () => {
    expect(mounts.length).toBeGreaterThan(15)
  })

  it('each imports the preload helper', () => {
    const missing = mounts.filter(
      f =>
        !/from '\.\.\/\.\.\/__tests__\/preloadRankingsTable'|import '\.\.\/\.\.\/__tests__\/preloadRankingsTable'/.test(
          readFileSync(join(dir, f), 'utf-8')
        )
    )
    expect(missing).toEqual([])
  })
})

describe('landing rankings table: legacy palette and the 14px floor', () => {
  const table = (): string => TABLE_SOURCES.map(src).join('\n')

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

  // #1361: award chips WERE icon-only below the compact breakpoint, with the
  // label sr-only; all three carried the same trophy, so two wins were
  // indistinguishable on a phone. Badges are self-describing at every width.
  it('does not hide award badge labels on narrow screens', () => {
    for (const rel of ['pages/DistrictsPage.tsx', ...TABLE_SOURCES]) {
      expect(
        src(rel).match(/className="sr-only sm:not-sr-only[^"]*"/g)
      ).toBeNull()
    }
  })

  // The sticky District column on the phone sheet is subtracted from the
  // viewport before a metric renders: it must not be wider than the design's
  // column size (a fixed, small size), never content-sized.
  it('sizes the District column from the column meta, not its content', () => {
    expect(src('components/rankingsColumnMeta.ts')).toMatch(
      /DISTRICT_MIN_SIZE = 180/
    )
  })
})
