/**
 * The Clubs column model (#2676, spec §4.1 and test plan 3): every column has a
 * chooser group, a width and per-tier defaults; the default set fits each
 * tier's width budget as a pure sum; and column hiding no longer lives in CSS.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import * as clubsColumnsModule from '../clubsColumns'
import { clubsColumns } from '../clubsColumns'
import { CLUBS_DELTA_COLUMN_IDS } from '../clubsDeltaColumns'
import {
  columnMeta,
  tierDefaults,
  NAME_MIN_SIZE,
  TIER_BUDGET_PX,
  type BreakpointTier,
} from '../clubsColumnMeta'

const here = dirname(fileURLToPath(import.meta.url))
const read = (rel: string) => readFileSync(resolve(here, rel), 'utf8')

const TIERS: BreakpointTier[] = ['tablet', 'laptop', 'desktop', 'wide']
const ALL_IDS = [
  ...clubsColumns.map(c => c.id as string),
  ...CLUBS_DELTA_COLUMN_IDS,
  'sinceLastYear',
]

describe('columnMeta (#2676)', () => {
  it('describes every column the table can render', () => {
    for (const id of ALL_IDS) expect(columnMeta, id).toHaveProperty(id)
    expect(Object.keys(columnMeta).sort()).toEqual([...ALL_IDS].sort())
  })

  it('gives every column a group, label, hint, size and per-tier defaults', () => {
    for (const id of ALL_IDS) {
      const m = columnMeta[id]
      expect(m.group, id).toBeTruthy()
      expect(m.label.length, id).toBeGreaterThan(0)
      expect(m.hint.length, id).toBeGreaterThan(0)
      expect(m.size, id).toBeGreaterThan(0)
      for (const t of TIERS) {
        expect(typeof m.defaultVisible[t], `${id}@${t}`).toBe('boolean')
      }
    }
  })

  it('keeps the Changes columns and "vs last year" off by default at every tier', () => {
    for (const id of [...CLUBS_DELTA_COLUMN_IDS, 'sinceLastYear']) {
      for (const t of TIERS)
        expect(columnMeta[id].defaultVisible[t]).toBe(false)
    }
  })

  it('shows Club at every tier', () => {
    for (const t of TIERS) expect(tierDefaults(t).name).toBe(true)
  })

  it.each(TIERS)(
    'the %s default set plus the Club minimum fits the tier budget',
    tier => {
      const fixed = ALL_IDS.filter(id => id !== 'name')
        .filter(id => tierDefaults(tier)[id])
        .reduce((sum, id) => sum + columnMeta[id].size, 0)
      expect(fixed + NAME_MIN_SIZE).toBeLessThanOrEqual(TIER_BUDGET_PX[tier])
    }
  )

  it('matches the budgets in spec §4.1 (682 / 938 / 1177 / 1514)', () => {
    expect(TIER_BUDGET_PX).toEqual({
      tablet: 682,
      laptop: 938,
      desktop: 1177,
      wide: 1514,
    })
  })
})

describe('CSS no longer hides columns (#2676)', () => {
  it('has no priority helpers or DESKTOP_ONLY_FIELDS in clubsColumns', () => {
    expect(Object.keys(clubsColumnsModule)).not.toContain('clubColumnPriority')
    expect(Object.keys(clubsColumnsModule)).not.toContain(
      'clubColumnPriorityClass'
    )
    expect(read('../clubsColumns.tsx')).not.toMatch(/DESKTOP_ONLY_FIELDS/)
    expect(read('../clubsColumns.tsx')).not.toMatch(/clubColumnPriority/)
  })

  it('has no clubs-table__col--desktop class anywhere in the table sources', () => {
    expect(read('../../styles/components/app-shell.css')).not.toMatch(
      /clubs-table__col--desktop/
    )
    expect(read('../ClubsTable.tsx')).not.toMatch(/clubs-table__col--desktop/)
  })

  it('sets display:none on no clubs-table__col rule', () => {
    const css = read('../../styles/components/app-shell.css').replace(
      /\/\*[\s\S]*?\*\//g,
      ''
    )
    const rules = [
      ...css.matchAll(/([^{}]*clubs-table__col[^{}]*)\{([^}]*)\}/g),
    ]
    for (const [, sel, body] of rules) {
      expect(body, sel.trim()).not.toMatch(/display\s*:\s*none/)
    }
  })

  it('has no 🎯 emoji in the Clubs table source', () => {
    expect(read('../ClubsTable.tsx')).not.toContain('🎯')
  })
})
