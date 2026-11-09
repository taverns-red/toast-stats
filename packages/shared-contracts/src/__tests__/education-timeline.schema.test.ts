/**
 * Education timeline (#2591, epic #2590): per program year, one object per
 * ENTITY (the world, each region, each district), so a district page
 * downloads its own series and nothing else:
 *
 *   derived/education-timeline/<PY>/world.json
 *   derived/education-timeline/<PY>/region-<n>.json
 *   derived/education-timeline/<PY>/district-<id>.json
 *
 * Each holds that entity's cumulative points plus its own prior-year ghost.
 * The contract pins what the Education page chart (#2592) relies on:
 *
 * - counts only (strict objects: no club, member or per-row field, L153);
 * - points strictly ascending by date, `asOf` the last one;
 * - world and region points carry the `districts` coverage count, district
 *   points do not;
 * - a point's byPath sums to its levels (Pathways only);
 * - the ghost names its grain, and its `at` keys match that grain;
 * - the file name an entity lives under is derivable from the entity;
 * - the rollup index names a timeline by its PY prefix, additively (ADR 0019).
 */

import { describe, it, expect } from 'vitest'
import {
  EducationRollupIndexSchema,
  EducationTimelineEntitySchema,
  EDUCATION_TIMELINE_PREFIX,
  EDUCATION_TIMELINE_VERSION,
  educationTimelineEntityPath,
  educationTimelinePrefix,
  parseEducationTimelinePath,
  type EducationTimelineEntity,
} from '../index.js'

const base = (date: string) => ({
  date,
  levels: [3, 1, 0, 0, 0] as [number, number, number, number, number],
  dtm: 1,
  legacy: 2,
  other: 0,
  byPath: { PM: 3, IP: 1 },
})

const entity = (over: Record<string, unknown> = {}): EducationTimelineEntity =>
  ({
    _format: {
      version: EDUCATION_TIMELINE_VERSION,
      type: 'education-timeline-entity',
    },
    programYear: '2026-2027',
    entity: { kind: 'district', id: '49' },
    asOf: '2026-10-12',
    points: [base('2026-10-11'), base('2026-10-12')],
    prior: {
      programYear: '2025-2026',
      source: 'timeline',
      grain: 'day',
      points: [{ at: '2025-10-12', total: 2 }],
    },
    ...over,
  }) as EducationTimelineEntity

const ok = (v: unknown) => EducationTimelineEntitySchema.safeParse(v).success

describe('EducationTimelineEntitySchema', () => {
  it('accepts a district file', () => {
    expect(ok(entity())).toBe(true)
  })

  it('accepts the world and a region with coverage counts', () => {
    const pts = [
      { ...base('2026-10-11'), districts: 2 },
      { ...base('2026-10-12'), districts: 3 },
    ]
    expect(
      ok(entity({ entity: { kind: 'world', id: null }, points: pts }))
    ).toBe(true)
    expect(
      ok(entity({ entity: { kind: 'region', id: '01' }, points: pts }))
    ).toBe(true)
  })

  it('requires coverage on world and region points, and forbids it on a district', () => {
    expect(ok(entity({ entity: { kind: 'world', id: null } }))).toBe(false)
    expect(
      ok(
        entity({
          points: [{ ...base('2026-10-12'), districts: 3 }],
        })
      )
    ).toBe(false)
  })

  it('a world has no id, a region and a district have one', () => {
    const pts = [{ ...base('2026-10-12'), districts: 1 }]
    expect(
      ok(entity({ entity: { kind: 'world', id: '1' }, points: pts }))
    ).toBe(false)
    expect(
      ok(entity({ entity: { kind: 'region', id: null }, points: pts }))
    ).toBe(false)
    expect(ok(entity({ entity: { kind: 'district', id: null } }))).toBe(false)
  })

  it('accepts a file with no prior year', () => {
    expect(ok(entity({ prior: null }))).toBe(true)
  })

  it('is strict: a club or member field cannot ride along', () => {
    expect(
      ok(entity({ points: [{ ...base('2026-10-12'), club: '1038715' }] }))
    ).toBe(false)
    expect(ok({ ...entity(), clubs: [] })).toBe(false)
  })

  it('requires exactly five levels', () => {
    expect(
      ok(entity({ points: [{ ...base('2026-10-12'), levels: [1, 2, 3] }] }))
    ).toBe(false)
  })

  it('rejects a point whose byPath does not sum to its levels', () => {
    expect(
      ok(entity({ points: [{ ...base('2026-10-12'), byPath: { PM: 9 } }] }))
    ).toBe(false)
  })

  it('rejects points that are not strictly ascending by date', () => {
    expect(
      ok(entity({ points: [base('2026-10-12'), base('2026-10-11')] }))
    ).toBe(false)
    expect(
      ok(entity({ points: [base('2026-10-12'), base('2026-10-12')] }))
    ).toBe(false)
  })

  it('requires at least one point, and asOf to be the last date', () => {
    expect(ok(entity({ points: [] }))).toBe(false)
    expect(ok(entity({ asOf: '2026-10-11' }))).toBe(false)
  })

  it('requires the ghost keys to match its grain', () => {
    const prior = entity().prior
    if (!prior) throw new Error('fixture has a prior')
    expect(
      ok(entity({ prior: { ...prior, points: [{ at: '2025-10', total: 5 }] } }))
    ).toBe(false)
    expect(
      ok(
        entity({
          prior: {
            ...prior,
            source: 'ledger-history',
            grain: 'month',
            points: [
              { at: '2025-09', total: 1 },
              { at: '2025-10', total: 5 },
            ],
          },
        })
      )
    ).toBe(true)
    expect(
      ok(
        entity({
          prior: {
            ...prior,
            points: [
              { at: '2025-10-12', total: 5 },
              { at: '2025-10-11', total: 4 },
            ],
          },
        })
      )
    ).toBe(false)
  })

  it('rejects a prior year that is not the year before', () => {
    const prior = entity().prior
    if (!prior) throw new Error('fixture has a prior')
    expect(ok(entity({ prior: { ...prior, programYear: '2024-2025' } }))).toBe(
      false
    )
  })
})

describe('entity paths', () => {
  it('builds the prefix and the three name patterns', () => {
    expect(educationTimelinePrefix('2026-2027')).toBe(
      `${EDUCATION_TIMELINE_PREFIX}/2026-2027`
    )
    expect(educationTimelineEntityPath('2026-2027', 'world', null)).toBe(
      'derived/education-timeline/2026-2027/world.json'
    )
    expect(educationTimelineEntityPath('2026-2027', 'region', '01')).toBe(
      'derived/education-timeline/2026-2027/region-01.json'
    )
    expect(educationTimelineEntityPath('2026-2027', 'district', '49')).toBe(
      'derived/education-timeline/2026-2027/district-49.json'
    )
  })

  it('refuses a malformed year or id', () => {
    expect(() => educationTimelineEntityPath('../x', 'world', null)).toThrow()
    expect(() =>
      educationTimelineEntityPath('2026-2027', 'district', '../49')
    ).toThrow()
    expect(() =>
      educationTimelineEntityPath('2026-2027', 'district', null)
    ).toThrow()
    expect(() =>
      educationTimelineEntityPath('2026-2027', 'world', '1')
    ).toThrow()
  })

  it('parses a path back, and refuses everything else under the prefix', () => {
    const p = (s: string) => parseEducationTimelinePath(s)
    expect(p('derived/education-timeline/2026-2027/world.json')).toEqual({
      programYear: '2026-2027',
      kind: 'world',
      id: null,
    })
    expect(p('derived/education-timeline/2026-2027/region-14.json')).toEqual({
      programYear: '2026-2027',
      kind: 'region',
      id: '14',
    })
    expect(p('derived/education-timeline/2026-2027/district-F.json')).toEqual({
      programYear: '2026-2027',
      kind: 'district',
      id: 'F',
    })
    for (const bad of [
      'derived/education-timeline/2026-2027.json',
      'derived/education-timeline/2026-2027/scratch.json',
      'derived/education-timeline/2026-2027/district-.json',
      'derived/education-timeline/2026-2027/district-1/2.json',
      'derived/education-timeline/2026-2027/world.json.bak',
      'derived/education-timeline/2026-2028/world.json',
      'derived/education-timeline/x/world.json',
      'derived/education-rollup/2026-2027/world.json',
    ]) {
      expect(p(bad), bad).toBeNull()
    }
  })
})

describe('the rollup index names timelines by prefix, additively (ADR 0019)', () => {
  const idx = {
    _format: { version: '1.0.0', type: 'education-rollup-index' },
    asOf: null,
    programYears: [],
    omittedProgramYears: [],
    trend: { districts: {}, regions: {} },
  }
  it('still parses an index with no timelines (the previous release)', () => {
    expect(EducationRollupIndexSchema.safeParse(idx).success).toBe(true)
  })
  it('parses an index that names one', () => {
    const row = {
      programYear: '2026-2027',
      prefix: 'derived/education-timeline/2026-2027',
      asOf: '2026-10-12',
      dates: 2,
      priorGrain: 'day',
    }
    expect(
      EducationRollupIndexSchema.safeParse({ ...idx, timelines: [row] }).success
    ).toBe(true)
  })
  it('refuses a row with a single path (the dropped combined file)', () => {
    const row = {
      programYear: '2026-2027',
      path: 'derived/education-timeline/2026-2027.json',
      asOf: '2026-10-12',
      dates: 2,
      priorGrain: null,
    }
    expect(
      EducationRollupIndexSchema.safeParse({ ...idx, timelines: [row] }).success
    ).toBe(false)
  })
})
