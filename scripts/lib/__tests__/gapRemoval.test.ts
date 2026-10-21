/**
 * Gap-district removal plan (#2232).
 *
 * A #1671 gap district gets no files from the transform, but uploads only
 * add, so its objects from an earlier build survive. The plan decides,
 * for one bucket and one date, which of those objects go. It is the one
 * predicate shared by the rebuild's staging step (process-dates.sh) and
 * by scoped promotion's prod step, and it is derived from state every
 * time, so a held date, a failed copy, a re-run or a proof run followed
 * by a promote all converge.
 *
 * Pinned:
 *  - only the date's OWN #1671 gaps (sourceGapDistricts), never any other
 *    failed district (M2);
 *  - only what transform + compute write: `district_<id>.json` and
 *    `analytics/district_<id>_*.json`; never the reports sidecar, a
 *    separate TI dataset the rebuild cannot regenerate (H1);
 *  - only while that bucket's `district_<id>.json` is the 0-club junk:
 *    real clubs, an unreadable file or none keep everything, so no gate
 *    override can turn this into deleting real data;
 *  - never an object the caller must keep (what this run wrote; for prod,
 *    what staging still holds);
 *  - analytics first, the district file last.
 */

import { describe, it, expect } from 'vitest'
import {
  MAX_GAP_DISTRICTS_PER_DATE,
  isGapRemovable,
  planGapRemovals,
  type GapRemovalInput,
} from '../gapRemoval.js'

const gapMetadata = (...ids: string[]) => ({
  successfulDistricts: ['61'],
  failedDistricts: ids,
  errors: ids.map(
    id => `${id}: Skipped: club-performance.csv is not a CSV (#1671)`
  ),
})

const U_OBJECTS = [
  'analytics/district_U_analytics.json',
  'analytics/district_U_membership.json',
  'district_U.json',
  'district_U_reports.json',
]

const input = (over: Partial<GapRemovalInput> = {}): GapRemovalInput => ({
  metadata: gapMetadata('U'),
  names: [
    ...U_OBJECTS,
    'district_61.json',
    'analytics/district_61_analytics.json',
    'metadata.json',
  ],
  districtClubs: { U: 0 },
  keep: new Set(),
  ...over,
})

describe('isGapRemovable', () => {
  it.each([
    ['district_U.json', true],
    ['analytics/district_U_analytics.json', true],
    ['analytics/district_U_year-over-year.json', true],
    ['district_U_reports.json', false],
    ['district_UX.json', false],
    ['analytics/district_UX_analytics.json', false],
    ['clubs-by-region/district_U.json', false],
    ['metadata.json', false],
  ])('%s → %s', (name, want) => {
    expect(isGapRemovable(name, 'U')).toBe(want)
  })
})

describe('planGapRemovals', () => {
  it("removes a 0-club gap district's transform objects, analytics first, district file last", () => {
    const plan = planGapRemovals(input())
    expect(plan.remove).toEqual([
      'analytics/district_U_analytics.json',
      'analytics/district_U_membership.json',
      'district_U.json',
    ])
  })

  it('never removes the reports sidecar: a separate TI dataset rebuild cannot regenerate (H1)', () => {
    expect(planGapRemovals(input()).remove).not.toContain(
      'district_U_reports.json'
    )
  })

  it('removes nothing for a failed district without the #1671 gap reason (M2)', () => {
    const plan = planGapRemovals(
      input({
        metadata: {
          successfulDistricts: ['61'],
          failedDistricts: ['U'],
          errors: ['U: transform failed: ECONNRESET'],
        },
      })
    )
    expect(plan.remove).toEqual([])
  })

  it('keeps everything when the district file has real clubs: never real data, whatever a gate allowed', () => {
    const plan = planGapRemovals(input({ districtClubs: { U: 140 } }))
    expect(plan.remove).toEqual([])
    expect(plan.kept.map(k => k.path)).toEqual([
      'analytics/district_U_analytics.json',
      'analytics/district_U_membership.json',
      'district_U.json',
    ])
    expect(plan.kept[0]!.reason).toMatch(/140 club/)
  })

  it('keeps everything when the district file is unreadable', () => {
    const plan = planGapRemovals(input({ districtClubs: { U: null } }))
    expect(plan.remove).toEqual([])
    expect(plan.kept[0]!.reason).toMatch(/not a district snapshot|unreadable/)
  })

  it('keeps leftover analytics when the district file is gone: nothing proves them junk', () => {
    const plan = planGapRemovals(
      input({
        names: ['analytics/district_U_analytics.json'],
        districtClubs: {},
      })
    )
    expect(plan.remove).toEqual([])
    expect(plan.kept).toHaveLength(1)
  })

  it('never removes an object the caller keeps; a kept district file keeps the district whole', () => {
    expect(
      planGapRemovals(
        input({ keep: new Set(['analytics/district_U_analytics.json']) })
      ).remove
    ).toEqual(['analytics/district_U_membership.json', 'district_U.json'])
    expect(
      planGapRemovals(input({ keep: new Set(['district_U.json']) })).remove
    ).toEqual([])
  })

  it('plans nothing when the metadata records no gap, or is unreadable', () => {
    expect(planGapRemovals(input({ metadata: gapMetadata() })).remove).toEqual(
      []
    )
    expect(planGapRemovals(input({ metadata: null })).remove).toEqual([])
  })

  it(`refuses a date recording more than ${MAX_GAP_DISTRICTS_PER_DATE} gaps`, () => {
    const ids = Array.from(
      { length: MAX_GAP_DISTRICTS_PER_DATE + 1 },
      (_, i) => `${i + 1}`
    )
    const plan = planGapRemovals(
      input({
        metadata: gapMetadata(...ids),
        names: ids.map(id => `district_${id}.json`),
        districtClubs: Object.fromEntries(ids.map(id => [id, 0])),
      })
    )
    expect(plan.remove).toEqual([])
    expect(plan.refused).toMatch(/gaps/)
  })

  it('handles several gap districts, each in its own order', () => {
    const plan = planGapRemovals(
      input({
        metadata: gapMetadata('U', '102'),
        names: [
          'district_102.json',
          'analytics/district_102_analytics.json',
          ...U_OBJECTS,
        ],
        districtClubs: { U: 0, '102': 0 },
      })
    )
    expect(plan.remove).toEqual([
      'analytics/district_102_analytics.json',
      'analytics/district_U_analytics.json',
      'analytics/district_U_membership.json',
      'district_102.json',
      'district_U.json',
    ])
  })
})
