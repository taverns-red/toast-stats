/**
 * Education timeline bands and prior-year ghost (#2592, epic #2590).
 *
 * The chart stacks the artifact's cumulative points into bands:
 *   - level mode: L1..L5 and DTM, plus Legacy / Other awards only when a
 *     point carries them, so the stack always equals the KPI tile total;
 *   - path mode: the top 6 paths by FINAL total plus "Other" (the remaining
 *     paths, DTMs and legacy), colour following the path, never its rank.
 * The ghost is last year's cumulative total at the same point in the program
 * year: aligned by day-of-PY (day grain) or month-end (month grain).
 */
import { describe, it, expect } from 'vitest'
import type { EducationTimelineAggregatePoint } from '@taverns-red/shared-contracts'
import {
  alignToPriorYear,
  deriveTimeline,
  priorGhostAt,
  type TimelinePrior,
  type TimelineSourcePoint,
} from '../educationTimelineBands'
import {
  DISTRICT_61_TIMELINE,
  MONTH_GRAIN_TIMELINE,
} from '../../__tests__/fixtures/educationTimelineFixtures'

const point = (
  date: string,
  levels: [number, number, number, number, number],
  byPath: Record<string, number>,
  extra: { dtm?: number; legacy?: number; other?: number } = {}
): TimelineSourcePoint => ({
  date,
  levels,
  dtm: extra.dtm ?? 0,
  legacy: extra.legacy ?? 0,
  other: extra.other ?? 0,
  byPath,
})

const dayPrior = (pts: [string, number][]): NonNullable<TimelinePrior> => ({
  programYear: '2025-2026',
  source: 'timeline',
  grain: 'day',
  points: pts.map(([at, total]) => ({ at, total })),
})

const monthPrior = (pts: [string, number][]): NonNullable<TimelinePrior> => ({
  programYear: '2025-2026',
  source: 'ledger-history',
  grain: 'month',
  points: pts.map(([at, total]) => ({ at, total })),
})

describe('level bands', () => {
  const { bands, rows } = deriveTimeline({
    points: DISTRICT_61_TIMELINE.points,
    mode: 'level',
    prior: null,
  })

  it('are L1..L5 and DTM, plus Legacy when a point carries it', () => {
    expect(bands.map(b => b.label)).toEqual([
      'Level 1',
      'Level 2',
      'Level 3',
      'Level 4',
      'Level 5',
      'DTM',
      'Legacy',
    ])
  })

  it('leave out Legacy and Other awards when they are zero everywhere', () => {
    const r = deriveTimeline({
      points: [point('2026-10-04', [1, 0, 0, 0, 0], { PM: 1 }, { dtm: 1 })],
      mode: 'level',
      prior: null,
    })
    expect(r.bands.map(b => b.key)).toEqual([
      'L1',
      'L2',
      'L3',
      'L4',
      'L5',
      'DTM',
    ])
  })

  it('has one row per point: steps, nothing between dates', () => {
    expect(rows.map(r => r.date)).toEqual(
      DISTRICT_61_TIMELINE.points.map(p => p.date)
    )
  })

  it('stacks to the cumulative total, equal to the final tile figure', () => {
    for (const r of rows) {
      const stack = bands.reduce((n, b) => n + (r.values[b.key] ?? 0), 0)
      expect(stack).toBe(r.total)
    }
    // 34+16+9+5+2 levels, 3 DTM, 2 legacy
    expect(rows[rows.length - 1]?.total).toBe(71)
    expect(rows[rows.length - 1]?.values).toMatchObject({
      L1: 34,
      L5: 2,
      DTM: 3,
      Legacy: 2,
    })
  })

  it('keeps the same colour hook for a level whatever is selected', () => {
    expect(bands.map(b => b.colour)).toEqual([
      'l1',
      'l2',
      'l3',
      'l4',
      'l5',
      'dtm',
      'legacy',
    ])
  })
})

describe('path bands', () => {
  // PM largest ... TC smallest, final point: 30,20,12,9,8,6,3,2
  const final = { PM: 30, DL: 20, EH: 12, LD: 9, MS: 8, PI: 6, SR: 3, TC: 2 }
  const first = { PM: 10, DL: 5, EH: 2, LD: 1, MS: 1, PI: 1, SR: 0, TC: 0 }
  const sum = (o: Record<string, number>) =>
    Object.values(o).reduce((a, b) => a + b, 0)
  const pts = [
    point('2026-09-06', [sum(first), 0, 0, 0, 0], first, { dtm: 1 }),
    point('2026-10-04', [sum(final), 0, 0, 0, 0], final, {
      dtm: 4,
      legacy: 2,
    }),
  ]

  it('are the top 6 paths by final total, then Other', () => {
    const { bands } = deriveTimeline({ points: pts, mode: 'path', prior: null })
    expect(bands.map(b => b.key)).toEqual([
      'PM',
      'DL',
      'EH',
      'LD',
      'MS',
      'PI',
      'rest',
    ])
    expect(bands.map(b => b.label)).toContain('Presentation Mastery')
    expect(bands[bands.length - 1]?.label).toBe('Other')
  })

  it('fold the remaining paths, DTMs and legacy into Other, so the stack is the tile total', () => {
    const { bands, rows } = deriveTimeline({
      points: pts,
      mode: 'path',
      prior: null,
    })
    const last = rows[rows.length - 1]!
    // SR 3 + TC 2 + DTM 4 + legacy 2
    expect(last.values['rest']).toBe(11)
    expect(last.total).toBe(sum(final) + 4 + 2)
    for (const r of rows) {
      expect(bands.reduce((n, b) => n + (r.values[b.key] ?? 0), 0)).toBe(
        r.total
      )
    }
  })

  it('rank paths by the FINAL total, not the first date', () => {
    // MS leads early but TC overtakes by the end.
    const r = deriveTimeline({
      points: [
        point('2026-09-06', [9, 0, 0, 0, 0], { MS: 9, TC: 0 }),
        point('2026-10-04', [40, 0, 0, 0, 0], {
          MS: 10,
          TC: 30,
          PM: 0,
          DL: 0,
          EH: 0,
          LD: 0,
          PI: 0,
        }),
      ],
      mode: 'path',
      prior: null,
    })
    expect(r.bands[0]?.key).toBe('TC')
  })

  it('colour follows the path, never its rank', () => {
    const colourOf = (
      byPath: Record<string, number>,
      code: string
    ): string | undefined =>
      deriveTimeline({
        points: [point('2026-10-04', [sum(byPath), 0, 0, 0, 0], byPath)],
        mode: 'path',
        prior: null,
      }).bands.find(b => b.key === code)?.colour

    const a = colourOf({ PM: 30, DL: 20, EH: 12, LD: 9, MS: 8, PI: 6 }, 'DL')
    // DL is now rank 1 instead of rank 2, and a different set is selected.
    const b = colourOf({ DL: 50, SR: 20, TC: 12, LD: 9, MS: 8, PI: 6 }, 'DL')
    expect(a).toBeDefined()
    expect(a).toBe(b)
    expect(colourOf({ PM: 1, DL: 1 }, 'PM')).not.toBe(
      colourOf({ PM: 1, DL: 1 }, 'DL')
    )
  })

  it('show no Other band when nothing falls outside the top paths', () => {
    const r = deriveTimeline({
      points: [point('2026-10-04', [3, 0, 0, 0, 0], { PM: 2, DL: 1 })],
      mode: 'path',
      prior: null,
    })
    expect(r.bands.map(b => b.key)).toEqual(['PM', 'DL'])
  })

  it('gives every one of the 11 paths its own colour hook', () => {
    const all = [
      'DL',
      'EC',
      'EH',
      'IP',
      'LD',
      'MS',
      'PI',
      'PM',
      'SR',
      'TC',
      'VC',
    ]
    const hooks = all.map(
      c =>
        deriveTimeline({
          points: [point('2026-10-04', [1, 0, 0, 0, 0], { [c]: 1 })],
          mode: 'path',
          prior: null,
        }).bands[0]?.colour
    )
    expect(new Set(hooks).size).toBe(11)
  })
})

describe('through (the page-selected date)', () => {
  it('drops points after it, so the final point is the tile date', () => {
    const { rows } = deriveTimeline({
      points: DISTRICT_61_TIMELINE.points,
      mode: 'level',
      prior: null,
      through: '2026-09-13',
    })
    expect(rows[rows.length - 1]?.date).toBe('2026-09-13')
  })

  it('keeps every point when it is later than the series or absent', () => {
    expect(
      deriveTimeline({
        points: DISTRICT_61_TIMELINE.points,
        mode: 'level',
        prior: null,
        through: '2027-01-01',
      }).rows
    ).toHaveLength(DISTRICT_61_TIMELINE.points.length)
  })
})

describe('aggregate points (world, region)', () => {
  it('derive the same way; districts coverage does not enter the stack', () => {
    const agg: EducationTimelineAggregatePoint = {
      ...point('2026-10-04', [2, 1, 0, 0, 0], { PM: 3 }, { dtm: 1 }),
      districts: 12,
    }
    const r = deriveTimeline({ points: [agg], mode: 'level', prior: null })
    expect(r.rows[0]?.total).toBe(4)
  })
})

describe('alignToPriorYear (day of the program year)', () => {
  it('maps the same day of the PY one year back', () => {
    expect(alignToPriorYear('2026-07-01', '2025-2026')).toBe('2025-07-01')
    expect(alignToPriorYear('2026-11-09', '2025-2026')).toBe('2025-11-09')
    expect(alignToPriorYear('2027-06-30', '2025-2026')).toBe('2026-06-30')
  })

  it('counts days, not calendar dates, across a leap year', () => {
    // PY 2027-28 holds Feb 29 2028 (day 243); PY 2026-27 has no Feb 29, so
    // day 243 of it is Mar 1 2027.
    expect(alignToPriorYear('2028-02-29', '2026-2027')).toBe('2027-03-01')
    expect(alignToPriorYear('2028-03-01', '2026-2027')).toBe('2027-03-02')
  })
})

describe('priorGhostAt, day grain', () => {
  const prior = dayPrior([
    ['2025-10-05', 36],
    ['2025-10-12', 41],
    ['2025-11-02', 55],
  ])

  it('is the last prior observation on or before the aligned date', () => {
    expect(priorGhostAt(prior, '2026-10-12')).toBe(41)
    expect(priorGhostAt(prior, '2026-10-20')).toBe(41)
    expect(priorGhostAt(prior, '2026-11-02')).toBe(55)
  })

  it('is null before the prior year had any observation (a gap, not zero)', () => {
    expect(priorGhostAt(prior, '2026-10-04')).toBeNull()
  })
})

describe('priorGhostAt, month grain', () => {
  const prior = monthPrior([
    ['2025-08', 14],
    ['2025-09', 27],
    ['2025-10', 41],
  ])

  it('uses the month-end value once that month has ended', () => {
    // aligned 2025-10-31 includes the October month-end
    expect(priorGhostAt(prior, '2026-10-31')).toBe(41)
    // aligned 2025-09-30 includes September but not October
    expect(priorGhostAt(prior, '2026-09-30')).toBe(27)
  })

  it('holds the previous month-end until the month ends', () => {
    expect(priorGhostAt(prior, '2026-10-15')).toBe(27)
  })

  it('is null before the first month-end', () => {
    expect(priorGhostAt(prior, '2026-08-15')).toBeNull()
  })
})

describe('the ghost on each row', () => {
  it('is null on every row when there is no prior year', () => {
    const { rows } = deriveTimeline({
      points: DISTRICT_61_TIMELINE.points,
      mode: 'level',
      prior: null,
    })
    expect(rows.every(r => r.ghost === null)).toBe(true)
  })

  it('is aligned per row for a day-grain prior', () => {
    const { rows } = deriveTimeline({
      points: DISTRICT_61_TIMELINE.points,
      mode: 'level',
      prior: DISTRICT_61_TIMELINE.prior,
    })
    const byDate = Object.fromEntries(rows.map(r => [r.date, r.ghost]))
    // 2026-10-11 -> 2025-10-11 -> last prior on/before = 2025-10-05 (36)
    expect(byDate['2026-10-11']).toBe(36)
    // 2026-07-12 -> 2025-07-12 -> before the first prior point (07-13)
    expect(byDate['2026-07-12']).toBeNull()
    // 2026-07-19 -> 2025-07-19 -> 2025-07-13 (4)
    expect(byDate['2026-07-19']).toBe(4)
  })

  it('is aligned per row for a month-grain prior', () => {
    const { rows } = deriveTimeline({
      points: MONTH_GRAIN_TIMELINE.points,
      mode: 'level',
      prior: MONTH_GRAIN_TIMELINE.prior,
    })
    const byDate = Object.fromEntries(rows.map(r => [r.date, r.ghost]))
    // 2026-10-04 -> 2025-10-04: September month-end is the last known (27)
    expect(byDate['2026-10-04']).toBe(27)
  })
})
