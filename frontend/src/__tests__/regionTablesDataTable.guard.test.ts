/**
 * Static guard for the region tables on the shared DataTable (#2702, #2676,
 * spec §14 M3): the region district rankings and the regions leaderboard.
 *
 * Reads source as TEXT (not a page mount), as the M1 rankings guard does.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const path = (rel: string): string => join(__dirname, '..', rel)
const src = (rel: string): string => readFileSync(path(rel), 'utf-8')

const REGION_TABLE = 'components/RegionDistrictRankingsTable.tsx'
const LEADERBOARD = 'components/RegionsLeaderboard.tsx'
/** Everything that renders a cell of the region district rankings. */
const REGION_SOURCES = [
  REGION_TABLE,
  'components/regionRankingsColumns.tsx',
  'components/regionRankingsCells.tsx',
]

describe('region district rankings: on the DataTable, no whole-row click', () => {
  it('lives in its own component on the DataTable foundation', () => {
    expect(existsSync(path(REGION_TABLE))).toBe(true)
    expect(src(REGION_TABLE)).toMatch(/<DataTable\b/)
  })

  it('RegionPage no longer hand-rolls the table or navigates on a row click', () => {
    const page = src('pages/RegionPage.tsx')
    expect(page).not.toMatch(/<table\b/)
    expect(page).not.toMatch(/cursor-pointer/)
    expect(page).not.toMatch(/districts-rankings-table/)
  })

  it('sets no sub-14px text size in any cell', () => {
    for (const rel of REGION_SOURCES.filter(f => existsSync(path(f)))) {
      expect(src(rel), rel).not.toMatch(/\btext-(?:xs|\[(?:9|10|11|12|13)px\])/)
    }
    expect(existsSync(path(REGION_TABLE))).toBe(true)
  })
})

describe('regions leaderboard: on the DataTable, sort only', () => {
  it('renders through DataTable, not a hand-rolled <table>', () => {
    const text = src(LEADERBOARD)
    expect(text).toMatch(/<DataTable\b/)
    expect(text).not.toMatch(/<table\b/)
  })

  it('has no Columns menu', () => {
    expect(src(LEADERBOARD)).not.toMatch(/ColumnsMenu/)
  })

  it('sets no sub-14px text size', () => {
    expect(src(LEADERBOARD)).not.toMatch(
      /\btext-(?:xs|\[(?:9|10|11|12|13)px\])/
    )
  })
})
