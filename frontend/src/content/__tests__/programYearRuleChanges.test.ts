/* Program-year rule-change log — data contract (#1400).

   The log is the reader-facing answer to "were these two program years
   measured by the same rules?". Its value collapses the moment an entry
   stops naming the metric or the comparability impact, so the shape is
   pinned here rather than left to prose review. */

import { describe, it, expect } from 'vitest'
import {
  PROGRAM_YEAR_RULE_CHANGES,
  ruleChangesByProgramYear,
  ruleChangeAnchorIds,
} from '../programYearRuleChanges'

const startYearOf = (programYear: string) =>
  Number.parseInt(programYear.slice(0, 4), 10)

describe('programYearRuleChanges — entry shape (#1400)', () => {
  it('every entry carries a stable anchor id, year, metric and impact', () => {
    expect(PROGRAM_YEAR_RULE_CHANGES.length).toBeGreaterThan(0)
    for (const change of PROGRAM_YEAR_RULE_CHANGES) {
      expect(change.id).toMatch(/^py-\d{4}-\d{4}-[a-z0-9-]+$/)
      expect(change.programYear).toMatch(/^\d{4}-\d{4}$/)
      // The anchor id must be prefixed by its own program year, so a shared
      // link is self-describing and can never drift onto another year.
      expect(change.id.startsWith(`py-${change.programYear}-`)).toBe(true)
      expect(change.title.length).toBeGreaterThan(10)
      expect(change.affects.length).toBeGreaterThan(5)
      expect(change.whatChanged.length).toBeGreaterThan(40)
      // The whole point of the log: a reader-facing comparability sentence.
      expect(change.comparability.length).toBeGreaterThan(40)
      expect(change.issues.length).toBeGreaterThan(0)
      expect(change.sources.length).toBeGreaterThan(0)
    }
  })

  it('ids are unique', () => {
    const ids = PROGRAM_YEAR_RULE_CHANGES.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('is ordered newest program year first', () => {
    const years = PROGRAM_YEAR_RULE_CHANGES.map(c => startYearOf(c.programYear))
    const descending = [...years].sort((a, b) => b - a)
    expect(years).toEqual(descending)
  })

  it('exposes every anchor id for the page deep-link whitelist', () => {
    expect([...ruleChangeAnchorIds()].sort()).toEqual(
      PROGRAM_YEAR_RULE_CHANGES.map(c => c.id).sort()
    )
  })
})

describe('programYearRuleChanges — grouping (#1400)', () => {
  it('groups by program year, newest first, preserving entry order', () => {
    const groups = ruleChangesByProgramYear()
    const years = groups.map(g => startYearOf(g.programYear))
    expect(years).toEqual([...years].sort((a, b) => b - a))
    expect(new Set(years).size).toBe(years.length)
    expect(groups.flatMap(g => g.changes)).toEqual([
      ...PROGRAM_YEAR_RULE_CHANGES,
    ])
  })
})

describe('programYearRuleChanges — the verified inventory (#1400)', () => {
  const byId = (id: string) => PROGRAM_YEAR_RULE_CHANGES.find(c => c.id === id)

  it.each([
    ['py-2026-2027-district-club-growth-achievement', '2026-2027'],
    ['py-2026-2027-dcp-goals-2-3-eom', '2026-2027'],
    ['py-2026-2027-region-advisor-prerequisite-retired', '2026-2027'],
    ['py-2025-2026-district-tier-thresholds-raised', '2025-2026'],
    ['py-2025-2026-district-prerequisites-expanded', '2025-2026'],
    ['py-2025-2026-club-success-plan-required', '2025-2026'],
    ['py-2025-2026-smedley-distinguished-club', '2025-2026'],
    ['py-2022-2023-district-club-growth-decoupled', '2022-2023'],
    ['py-2018-2019-district-smedley-added', '2018-2019'],
  ])('logs %s under PY %s', (id, programYear) => {
    const change = byId(id)
    expect(change).toBeDefined()
    expect(change?.programYear).toBe(programYear)
  })

  it('names the Online Meeting Mastery route, not just the column rename', () => {
    const change = byId('py-2026-2027-dcp-goals-2-3-eom')
    expect(change?.whatChanged).toMatch(/online meeting mastery/i)
    expect(change?.comparability).toMatch(/like-for-like|comparable/i)
  })

  it('claims the Club Growth Achievement predicate and says the blank years are a rules artefact', () => {
    const change = byId('py-2026-2027-district-club-growth-achievement')
    // The `sources` claim is what pacifies the drift guard — a PY-gated file
    // with no entry claiming it fails the build (#1400).
    expect(change?.sources).toContain(
      'frontend/src/utils/clubGrowthAchievement.ts'
    )
    expect(change?.whatChanged).toMatch(/september 30/i)
    expect(change?.whatChanged).toMatch(/march 31/i)
    expect(change?.comparability).toMatch(/did not exist before/i)
  })

  it('says the pre-2025-26 CSP default is "assume submitted", not "failed"', () => {
    const change = byId('py-2025-2026-club-success-plan-required')
    expect(change?.comparability).toMatch(/submitted/i)
    expect(change?.affects).toMatch(/distinguished|thriving/i)
  })
})
