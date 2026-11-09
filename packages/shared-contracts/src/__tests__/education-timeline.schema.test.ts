/**
 * Education timeline (#2591, epic #2590): per program year, one cumulative
 * education-awards point per snapshot date for each district, each region
 * and the world, plus a prior-year ghost. The contract pins what the
 * Education page chart (#2592) relies on:
 *
 * - counts only (strict objects: no club, member or per-row field, L153);
 * - points are strictly ascending by date, one per date, each date listed;
 * - a point's byPath sums to its levels (Pathways only);
 * - the ghost names its grain, and its `at` keys match that grain;
 * - the rollup index may name timelines, additively (ADR 0019).
 */

import { describe, it, expect } from 'vitest'
import {
  EducationRollupIndexSchema,
  EducationTimelineSchema,
  educationTimelineObjectPath,
  EDUCATION_TIMELINE_PREFIX,
  EDUCATION_TIMELINE_VERSION,
  type EducationTimeline,
  type EducationTimelinePoint,
} from '../index.js'

const point = (
  date: string,
  over: Partial<EducationTimelinePoint> = {}
): EducationTimelinePoint => ({
  date,
  levels: [3, 1, 0, 0, 0],
  dtm: 1,
  legacy: 2,
  other: 0,
  byPath: { PM: 3, IP: 1 },
  ...over,
})

const timeline = (
  over: Partial<EducationTimeline> = {}
): EducationTimeline => ({
  _format: { version: EDUCATION_TIMELINE_VERSION, type: 'education-timeline' },
  programYear: '2026-2027',
  asOf: '2026-10-12',
  dates: ['2026-10-11', '2026-10-12'],
  world: [
    { ...point('2026-10-11'), districts: 2 },
    { ...point('2026-10-12'), districts: 2 },
  ],
  regions: { '01': [{ ...point('2026-10-12'), districts: 1 }] },
  districts: { '49': [point('2026-10-11'), point('2026-10-12')] },
  prior: {
    programYear: '2025-2026',
    source: 'timeline',
    grain: 'day',
    world: [{ at: '2025-10-12', total: 5 }],
    regions: { '01': [{ at: '2025-10-12', total: 2 }] },
    districts: { '49': [{ at: '2025-10-12', total: 2 }] },
  },
  ...over,
})

describe('EducationTimelineSchema', () => {
  it('accepts a well-formed timeline', () => {
    expect(EducationTimelineSchema.safeParse(timeline()).success).toBe(true)
  })

  it('accepts a timeline with no prior year and no regions', () => {
    expect(
      EducationTimelineSchema.safeParse(
        timeline({ prior: null, regions: null })
      ).success
    ).toBe(true)
  })

  it('is strict: a club or member field cannot ride along', () => {
    const t = timeline()
    const dirty = {
      ...t,
      districts: { '49': [{ ...point('2026-10-12'), club: '1038715' }] },
    }
    expect(EducationTimelineSchema.safeParse(dirty).success).toBe(false)
  })

  it('requires exactly five levels', () => {
    const bad = timeline({
      districts: {
        '49': [{ ...point('2026-10-12'), levels: [1, 2, 3] as never }],
      },
    })
    expect(EducationTimelineSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a point whose byPath does not sum to its levels', () => {
    const bad = timeline({
      districts: { '49': [point('2026-10-12', { byPath: { PM: 9 } })] },
    })
    expect(EducationTimelineSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects points that are not strictly ascending by date', () => {
    const bad = timeline({
      districts: { '49': [point('2026-10-12'), point('2026-10-11')] },
    })
    expect(EducationTimelineSchema.safeParse(bad).success).toBe(false)
    const dup = timeline({
      districts: { '49': [point('2026-10-12'), point('2026-10-12')] },
    })
    expect(EducationTimelineSchema.safeParse(dup).success).toBe(false)
  })

  it('rejects a point on a date the timeline does not list', () => {
    const bad = timeline({
      districts: { '49': [point('2026-10-13')] },
    })
    expect(EducationTimelineSchema.safeParse(bad).success).toBe(false)
  })

  it('requires asOf to be the last listed date', () => {
    expect(
      EducationTimelineSchema.safeParse(timeline({ asOf: '2026-10-11' }))
        .success
    ).toBe(false)
  })

  it('requires the ghost keys to match its grain', () => {
    const prior = timeline().prior
    if (!prior) throw new Error('fixture has a prior')
    const monthKeyed = timeline({
      prior: { ...prior, world: [{ at: '2025-10', total: 5 }] },
    })
    expect(EducationTimelineSchema.safeParse(monthKeyed).success).toBe(false)
    const monthOk = timeline({
      prior: {
        ...prior,
        source: 'ledger-history',
        grain: 'month',
        world: [{ at: '2025-10', total: 5 }],
        regions: null,
        districts: { '49': [{ at: '2025-10', total: 2 }] },
      },
    })
    expect(EducationTimelineSchema.safeParse(monthOk).success).toBe(true)
  })

  it('rejects a prior year that is not the year before', () => {
    const prior = timeline().prior
    if (!prior) throw new Error('fixture has a prior')
    expect(
      EducationTimelineSchema.safeParse(
        timeline({ prior: { ...prior, programYear: '2024-2025' } })
      ).success
    ).toBe(false)
  })
})

describe('educationTimelineObjectPath', () => {
  it('builds the path and refuses a malformed year', () => {
    expect(educationTimelineObjectPath('2026-2027')).toBe(
      `${EDUCATION_TIMELINE_PREFIX}/2026-2027.json`
    )
    expect(() => educationTimelineObjectPath('../x')).toThrow()
  })
})

describe('the rollup index names timelines additively (ADR 0019)', () => {
  const base = {
    _format: { version: '1.0.0', type: 'education-rollup-index' },
    asOf: null,
    programYears: [],
    omittedProgramYears: [],
    trend: { districts: {}, regions: {} },
  }
  it('still parses an index with no timelines (the previous release)', () => {
    expect(EducationRollupIndexSchema.safeParse(base).success).toBe(true)
  })
  it('parses an index that names one', () => {
    const row = {
      programYear: '2026-2027',
      path: 'derived/education-timeline/2026-2027.json',
      asOf: '2026-10-12',
      dates: 2,
      priorGrain: 'day',
    }
    const r = EducationRollupIndexSchema.safeParse({
      ...base,
      timelines: [row],
    })
    expect(r.success).toBe(true)
  })
})
