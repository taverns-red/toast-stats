/**
 * Static guard for the M6 tables on the shared DataTable (#2733, #2676,
 * spec §14 M6): club history, the region/world health breakdown and the region
 * training table. Reads source as TEXT (not a page mount), as the M1 and M3
 * guards do.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = (rel: string): string =>
  readFileSync(join(__dirname, '..', rel), 'utf-8')

const TABLES: Record<string, string> = {
  'club history': 'components/ClubHistoryTable.tsx',
  'health breakdown': 'components/rollups/RollupBreakdownTable.tsx',
  'region training': 'components/RegionTrainingTable.tsx',
}

describe.each(Object.entries(TABLES))('%s: on the DataTable', (_n, file) => {
  it('renders through DataTable and hand-rolls no <table>', () => {
    const text = src(file)
    expect(text).toMatch(/<DataTable\b/)
    expect(text).not.toMatch(/<table\b/)
  })

  it('has no Columns menu (sort only)', () => {
    expect(src(file)).not.toMatch(/ColumnsMenu/)
  })

  it('sets no sub-14px text size', () => {
    expect(src(file)).not.toMatch(/\btext-(?:xs|\[(?:9|10|11|12|13)px\])/)
  })
})

describe('the retired hand-rolled table styles are gone', () => {
  it('club-history.css has no table, header, cell or tier-pill rules', () => {
    const css = src('styles/components/club-history.css')
    for (const cls of [
      'club-history-table',
      'club-history-th',
      'club-history-td',
      'club-history-sort',
      'club-history-scroll',
    ])
      expect(css, cls).not.toMatch(new RegExp(`\\.${cls}\\b`))
  })

  it('rollups.css has no breakdown table rules (only the shared N/A and sub text)', () => {
    const css = src('components/rollups/rollups.css')
    for (const cls of [
      'rollup-breakdown__scroll',
      'rollup-breakdown__th',
      'rollup-breakdown__name',
      'rollup-breakdown__num',
    ])
      expect(css, cls).not.toMatch(new RegExp(`\\.${cls}\\b`))
  })

  it('training.css has no region-training table header or cell rules', () => {
    const css = src('styles/components/training.css')
    expect(css).not.toMatch(/\.region-training-table\b/)
  })
})
