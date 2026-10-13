/**
 * Map filters (#1788): visit round, online-capable, division and area, as
 * URL state that composes with the colour mode and the legend facets.
 *
 * Fixture rows are the real CDN shape: `snapshots/2026-10-11/district_61.json`
 * is a `{districtId, …, data: {divisionPerformance: [...]}}` envelope whose
 * rows key the club as a zero-padded `Club` ('00003045') while the analytics
 * `allClubs[].clubId` is '3045', and visit awards are the strings '1' / '0'.
 */
import { describe, expect, it } from 'vitest'
import type { ClubTrend } from '../../../hooks/useDistrictAnalytics'
import {
  MAP_FILTER_PARAMS,
  activeMapFilterCount,
  applyMapFilters,
  buildVisitIndex,
  clearMapFilters,
  mapFilterFacets,
  needsVisitData,
  setMapFilter,
} from '../mapFilters'

const club = (o: Partial<ClubTrend>): ClubTrend =>
  ({
    clubId: '0',
    clubName: 'Club',
    divisionId: 'A',
    divisionName: 'Division A',
    areaId: '01',
    areaName: 'Area 01',
    membershipTrend: [],
    dcpGoalsTrend: [],
    currentStatus: 'thriving',
    riskFactors: [],
    distinguishedLevel: 'NotDistinguished',
    ...o,
  }) as ClubTrend

const SNAPSHOT = {
  districtId: '61',
  districtName: 'District 61',
  collectedAt: '2026-10-11T09:00:00Z',
  status: 'success',
  data: {
    snapshotDate: '2026-10-11',
    divisionPerformance: [
      {
        Division: 'A',
        Area: '01',
        Club: '00003045',
        'Club Name': 'Limestone City Club',
        'Nov Visit award': '1',
        'May Visit award': '0',
      },
      {
        Division: 'A',
        Area: '01',
        Club: '00001111',
        'Club Name': 'Visited Twice',
        'Nov Visit award': '1',
        // The lowercase spelling the CDN sometimes emits (bug #268).
        'May visit award': '1',
      },
      {
        Division: 'B',
        Area: '12',
        Club: '00002222',
        'Club Name': 'Not Yet Visited',
        'Nov Visit award': '0',
        'May Visit award': '0',
      },
    ],
  },
}

const CLUBS = [
  club({ clubId: '3045', allowsVirtualAttendance: true }),
  club({ clubId: '1111', allowsVirtualAttendance: false }),
  club({
    clubId: '2222',
    divisionId: 'B',
    divisionName: 'Division B',
    areaId: '12',
    areaName: 'Area 12',
  }),
  // In the analytics but missing from divisionPerformance: visit unknown.
  club({ clubId: '4444', allowsVirtualAttendance: true }),
]

const ids = (clubs: ClubTrend[]) => clubs.map(c => c.clubId)
const p = (q: string) => new URLSearchParams(q)

describe('buildVisitIndex', () => {
  it('reads both rounds from the snapshot envelope, keyed by normalised club id', () => {
    const index = buildVisitIndex(SNAPSHOT)
    expect(index.get('3045')).toEqual({ r1: true, r2: false })
    expect(index.get('1111')).toEqual({ r1: true, r2: true })
    expect(index.get('2222')).toEqual({ r1: false, r2: false })
    expect(index.has('4444')).toBe(false)
  })

  it('also accepts an already-unwrapped payload, and nothing from junk', () => {
    expect(buildVisitIndex(SNAPSHOT.data).get('3045')).toEqual({
      r1: true,
      r2: false,
    })
    expect(buildVisitIndex(null).size).toBe(0)
    expect(buildVisitIndex({ data: { divisionPerformance: 'x' } }).size).toBe(0)
  })
})

describe('applyMapFilters', () => {
  const visits = buildVisitIndex(SNAPSHOT)

  it('passes every club through when no map filter is set', () => {
    expect(ids(applyMapFilters(CLUBS, p(''), visits))).toEqual(ids(CLUBS))
  })

  it('?visit=r1 keeps clubs whose round 1 visit is not reported', () => {
    expect(ids(applyMapFilters(CLUBS, p('visit=r1'), visits))).toEqual(['2222'])
  })

  it('?visit=r2 and r1,r2 (OR within the facet)', () => {
    expect(ids(applyMapFilters(CLUBS, p('visit=r2'), visits))).toEqual([
      '3045',
      '2222',
    ])
    expect(ids(applyMapFilters(CLUBS, p('visit=r1,r2'), visits))).toEqual([
      '3045',
      '2222',
    ])
  })

  it('an unknown visit is never "needs a visit" (absent is not 0)', () => {
    expect(ids(applyMapFilters(CLUBS, p('visit=r1'), visits))).not.toContain(
      '4444'
    )
    // No visit data for the date at all: nothing can be claimed to need one.
    expect(applyMapFilters(CLUBS, p('visit=r1'), null)).toEqual([])
  })

  it('whitelists ?visit= values at the parse', () => {
    expect(ids(applyMapFilters(CLUBS, p('visit=bogus'), visits))).toEqual(
      ids(CLUBS)
    )
    expect(needsVisitData(p('visit=bogus'))).toBe(false)
    expect(needsVisitData(p('visit=r2'))).toBe(true)
  })

  it('?online=yes keeps clubs that allow online attendance — true only', () => {
    expect(ids(applyMapFilters(CLUBS, p('online=yes'), visits))).toEqual([
      '3045',
      '4444',
    ])
    // Any other value is no filter.
    expect(ids(applyMapFilters(CLUBS, p('online=maybe'), visits))).toEqual(
      ids(CLUBS)
    )
  })

  it('composes visit and online with AND', () => {
    expect(
      ids(applyMapFilters(CLUBS, p('visit=r2&online=yes'), visits))
    ).toEqual(['3045'])
  })
})

describe('URL writes', () => {
  it('setMapFilter writes one param and keeps every other key', () => {
    const next = setMapFilter(p('color=tier&status=intervention'), 'visit', [
      'r1',
    ])
    expect(next.get('visit')).toBe('r1')
    expect(next.get('color')).toBe('tier')
    expect(next.get('status')).toBe('intervention')
    expect(setMapFilter(next, 'visit', []).has('visit')).toBe(false)
  })

  it('clearMapFilters drops the four filter keys in one write, nothing else', () => {
    const next = clearMapFilters(
      p(
        'color=area&status=thriving&view=list&visit=r1&online=yes&divisions=Division A&areas=Area 01'
      )
    )
    for (const k of MAP_FILTER_PARAMS) expect(next.has(k)).toBe(false)
    expect(next.get('color')).toBe('area')
    expect(next.get('status')).toBe('thriving')
    expect(next.get('view')).toBe('list')
  })

  it('counts active filter facets', () => {
    expect(activeMapFilterCount(p('color=tier&status=thriving'))).toBe(0)
    expect(
      activeMapFilterCount(p('visit=r1,r2&divisions=Division A&online=yes'))
    ).toBe(3)
  })
})

describe('mapFilterFacets', () => {
  const noop = () => {}

  it('offers visit round, online, division and area facets with their selections', () => {
    const facets = mapFilterFacets(
      CLUBS,
      p('visit=r1&online=yes&divisions=Division B'),
      noop
    )
    expect(facets.map(f => f.id)).toEqual([
      'visit',
      'online',
      'divisions',
      'areas',
    ])
    const [visit, online, divisions, areas] = facets
    expect(visit!.options.map(o => o.value)).toEqual(['r1', 'r2'])
    expect(visit!.selected).toEqual(['r1'])
    expect(online!.options).toEqual([
      { value: 'yes', label: 'Online attendance possible' },
    ])
    expect(online!.selected).toEqual(['yes'])
    expect(divisions!.options.map(o => o.value)).toEqual([
      'Division A',
      'Division B',
    ])
    // Areas narrow to the selected divisions.
    expect(areas!.options.map(o => o.value)).toEqual(['Area 12'])
  })

  it('keeps a selected area offered even outside the selected divisions, so it can be cleared', () => {
    const [, , , areas] = mapFilterFacets(
      CLUBS,
      p('divisions=Division B&areas=Area 01'),
      noop
    )
    expect(areas!.options.map(o => o.value)).toEqual(['Area 01', 'Area 12'])
  })

  it('each facet change is one write of that facet', () => {
    const writes: Array<[string, string[]]> = []
    const facets = mapFilterFacets(CLUBS, p(''), (param, values) =>
      writes.push([param, values])
    )
    facets[0]!.onChange(['r2'])
    facets[3]!.onChange(['Area 12'])
    expect(writes).toEqual([
      ['visit', ['r2']],
      ['areas', ['Area 12']],
    ])
  })
})
