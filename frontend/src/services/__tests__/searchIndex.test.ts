import { describe, it, expect, beforeEach } from 'vitest'
import {
  buildSearchIndex,
  searchEntities,
  type SearchIndex,
  type SearchResultGroup,
} from '../searchIndex'

// --- Fixtures (shapes mirror fetchCdnRankings().rankings + fetchCdnClubIndex().clubs) ---

type RankingRow = Parameters<typeof buildSearchIndex>[0][number]

function ranking(
  districtId: string,
  districtName: string,
  region: string
): RankingRow {
  // Only the three fields the index reads matter; the rest are padding so the
  // fixture matches the real CdnRankingsData['rankings'] row shape loosely.
  return { districtId, districtName, region } as RankingRow
}

const RANKINGS: RankingRow[] = [
  ranking('61', 'District 61', '07'),
  ranking('6', 'District 6', '07'),
  ranking('57', 'District 57 Carolinas', '08'),
  ranking('F', 'District F', '01'),
]

const CLUBS: Record<string, { districtId: string; clubName: string }> = {
  '00001234': { districtId: '61', clubName: 'Toast of the Town' },
  '00005678': { districtId: '57', clubName: 'Club 61 Speakers' },
  '00009999': { districtId: '6', clubName: 'Sunrise Communicators' },
}

// Shape mirrors fetchCdnDivisionsAreasIndex().districts (#1134):
// districtId → divisionId → sorted areaIds. AreaIds are NOT district-unique
// (61/C/23 and 57/C/23 coexist); 04/0D is a live pseudo-division shape.
const DIVISIONS_AREAS: Record<string, Record<string, string[]>> = {
  '61': { A: ['1', '12'], C: ['23'] },
  '57': { C: ['23'] },
  '04': { '0D': ['0A'] },
}

// Flatten grouped results into a single ranked list, preserving group order,
// so "above" assertions read naturally.
function flatten(groups: SearchResultGroup[]) {
  return groups.flatMap(g => g.entities)
}

describe('buildSearchIndex', () => {
  let index: SearchIndex
  beforeEach(() => {
    index = buildSearchIndex(RANKINGS, CLUBS, DIVISIONS_AREAS)
  })

  it('creates one district entity per ranking row with the canonical route', () => {
    const d61 = index.entities.find(e => e.type === 'district' && e.id === '61')
    expect(d61).toBeDefined()
    expect(d61!.label).toBe('District 61')
    expect(d61!.route).toBe('/district/61')
  })

  it('derives one region entity per distinct numeric region, deduped', () => {
    const regions = index.entities.filter(e => e.type === 'region')
    // 07 and 08 and 01 → three regions (07 appears twice in rankings)
    expect(regions.map(r => r.id).sort()).toEqual(['01', '07', '08'])
    const r07 = regions.find(r => r.id === '07')!
    expect(r07.label).toBe('Region 7')
    expect(r07.route).toBe('/region/07')
  })

  it('creates a club entity resolving to /district/{districtId}/club/{clubId} with district context', () => {
    const club = index.entities.find(
      e => e.type === 'club' && e.id === '00001234'
    )
    expect(club).toBeDefined()
    expect(club!.label).toBe('Toast of the Town')
    expect(club!.context).toBe('District 61')
    expect(club!.route).toBe('/district/61/club/00001234')
  })

  // --- divisions/areas (#1135, epic #1101 Sprint 2) ---

  it('creates one division entity per (district, division) with the scoped route', () => {
    const divisions = index.entities.filter(e => e.type === 'division')
    expect(divisions).toHaveLength(4) // 61/A, 61/C, 57/C, 04/0D
    const d61c = divisions.find(e => e.id === '61/C')
    expect(d61c).toBeDefined()
    expect(d61c!.label).toBe('Division C')
    expect(d61c!.context).toBe('District 61')
    expect(d61c!.route).toBe('/district/61/division/C')
  })

  it('creates one area entity per (district, division, area) with the nested scoped route', () => {
    const areas = index.entities.filter(e => e.type === 'area')
    expect(areas).toHaveLength(5) // 61: 1, 12, 23 · 57: 23 · 04: 0A
    const a = areas.find(e => e.id === '61/C/23')
    expect(a).toBeDefined()
    expect(a!.label).toBe('Area 23')
    expect(a!.context).toBe('District 61 · Division C')
    expect(a!.route).toBe('/district/61/division/C/area/23')
  })

  it('skips malformed division/area values instead of throwing or indexing junk', () => {
    // A string is iterable — a naive for…of over a junk areaIds value would
    // index phantom one-character areas. Both junk shapes must contribute
    // nothing (review finding on #1135).
    const malformed = buildSearchIndex(RANKINGS, CLUBS, {
      '61': { C: 'junk' as unknown as string[] },
      '57': null as unknown as Record<string, string[]>,
    })
    expect(malformed.entities.some(e => e.type === 'area')).toBe(false)
    expect(
      malformed.entities.some(e => e.type === 'division' && e.id === '61/C')
    ).toBe(true)
    expect(malformed.entities.some(e => e.id.startsWith('57/'))).toBe(false)
  })

  it('indexes pseudo-divisions (e.g. 0D) verbatim — same source the division pages read', () => {
    const div = index.entities.find(
      e => e.type === 'division' && e.id === '04/0D'
    )
    expect(div).toBeDefined()
    expect(div!.label).toBe('Division 0D')
    expect(div!.route).toBe('/district/04/division/0D')
    const area = index.entities.find(
      e => e.type === 'area' && e.id === '04/0D/0A'
    )
    expect(area).toBeDefined()
    expect(area!.route).toBe('/district/04/division/0D/area/0A')
  })
})

describe('searchEntities', () => {
  let index: SearchIndex
  beforeEach(() => {
    index = buildSearchIndex(RANKINGS, CLUBS, DIVISIONS_AREAS)
  })

  it('returns no results for an empty or whitespace query', () => {
    expect(searchEntities('', index)).toEqual([])
    expect(searchEntities('   ', index)).toEqual([])
  })

  it('ranks an exact-id district above a club that merely contains the query', () => {
    const flat = flatten(searchEntities('61', index))
    const ids = flat.map(e => `${e.type}:${e.id}`)
    expect(ids).toContain('district:61')
    expect(ids).toContain('club:00005678') // "Club 61 Speakers"
    expect(ids.indexOf('district:61')).toBeLessThan(
      ids.indexOf('club:00005678')
    )
  })

  it('matches a region by its number (padded or unpadded) and ranks it above clubs', () => {
    const flat = flatten(searchEntities('7', index))
    const ids = flat.map(e => `${e.type}:${e.id}`)
    expect(ids).toContain('region:07')
    // Region must outrank any club that only substring-matches "7".
    const regionIdx = ids.indexOf('region:07')
    const firstClubIdx = ids.findIndex(id => id.startsWith('club:'))
    // clubId "00005678" substring-matches "7", so a club is present — the
    // ordering assertion is not vacuous.
    expect(firstClubIdx).not.toBe(-1)
    expect(regionIdx).toBeLessThan(firstClubIdx)
    // Padded form also matches.
    const paddedIds = flatten(searchEntities('07', index)).map(
      e => `${e.type}:${e.id}`
    )
    expect(paddedIds).toContain('region:07')
  })

  it('is case-insensitive and matches club names by substring', () => {
    const flat = flatten(searchEntities('toast', index))
    expect(flat.some(e => e.id === '00001234')).toBe(true)
    const upper = flatten(searchEntities('TOAST', index))
    expect(upper.some(e => e.id === '00001234')).toBe(true)
  })

  it('ranks exact > prefix > substring at the same type weight', () => {
    // Among clubs: "Club 61 Speakers" prefix-matches "club", exact none.
    const flat = flatten(searchEntities('sun', index))
    // "Sunrise Communicators" prefix-matches "sun".
    expect(flat[0]?.id).toBe('00009999')
  })

  it('groups results by type in district → region → club → division → area order', () => {
    const groups = searchEntities('6', index)
    const types = groups.map(g => g.type)
    // Every present group respects the canonical order.
    const order = ['district', 'region', 'club', 'division', 'area']
    const indices = types.map(t => order.indexOf(t))
    expect(indices).not.toContain(-1)
    expect(indices).toEqual([...indices].sort((a, b) => a - b))
  })

  it('caps the total result count', () => {
    const many: Record<string, { districtId: string; clubName: string }> = {}
    for (let i = 0; i < 50; i++) {
      many[`club${i}`] = { districtId: '61', clubName: `Sixty One Club ${i}` }
    }
    const bigIndex = buildSearchIndex(RANKINGS, many)
    const total = flatten(searchEntities('six', bigIndex, { cap: 8 })).length
    expect(total).toBeLessThanOrEqual(8)
  })

  it('keeps a weighted district above the cap when a club flood would crowd it out', () => {
    // 50 clubs all substring-matching "61" — without the type weighting,
    // a global sort→cap could evict District 61 entirely.
    const flood: Record<string, { districtId: string; clubName: string }> = {}
    for (let i = 0; i < 50; i++) {
      flood[`club${i}`] = { districtId: '61', clubName: `Club 61 #${i}` }
    }
    const bigIndex = buildSearchIndex(RANKINGS, flood)
    const groups = searchEntities('61', bigIndex, { cap: 8 })
    const flat = flatten(groups)
    expect(flat.length).toBeLessThanOrEqual(8)
    // The exact-id district must survive the cap and lead the results.
    expect(flat[0]).toMatchObject({ type: 'district', id: '61' })
  })
})

describe('searchEntities — division/area query shapes (#1135)', () => {
  let index: SearchIndex
  beforeEach(() => {
    index = buildSearchIndex(RANKINGS, CLUBS, DIVISIONS_AREAS)
  })

  it('resolves "61 c" to District 61 Division C, district-scoped', () => {
    const flat = flatten(searchEntities('61 c', index))
    expect(flat[0]).toMatchObject({ type: 'division', id: '61/C' })
    // The SAME division letter in another district must not match.
    expect(flat.some(e => e.id === '57/C')).toBe(false)
  })

  it('resolves "c 61" (division-first word order) to the same division', () => {
    const flat = flatten(searchEntities('c 61', index))
    expect(flat.some(e => e.type === 'division' && e.id === '61/C')).toBe(true)
  })

  it('resolves "division c 61" and "61 division c" to District 61 Division C', () => {
    for (const q of ['division c 61', '61 division c']) {
      const flat = flatten(searchEntities(q, index))
      expect(flat[0]).toMatchObject({ type: 'division', id: '61/C' })
      expect(flat.some(e => e.id === '57/C')).toBe(false)
    }
  })

  it('is case-insensitive for division queries ("Division C 61")', () => {
    const flat = flatten(searchEntities('Division C 61', index))
    expect(flat[0]).toMatchObject({ type: 'division', id: '61/C' })
  })

  it('matches "division c" (no district) in every district that has one', () => {
    const ids = flatten(searchEntities('division c', index))
      .filter(e => e.type === 'division')
      .map(e => e.id)
    expect(ids).toContain('61/C')
    expect(ids).toContain('57/C')
  })

  it('resolves "area 23 61" to District 61 Area 23, district-scoped', () => {
    const flat = flatten(searchEntities('area 23 61', index))
    expect(flat[0]).toMatchObject({ type: 'area', id: '61/C/23' })
    expect(flat.some(e => e.id === '57/C/23')).toBe(false)
  })

  it('resolves "61 area 23" and the terse "61 23" to the same area', () => {
    for (const q of ['61 area 23', '61 23']) {
      const flat = flatten(searchEntities(q, index))
      expect(flat[0]).toMatchObject({ type: 'area', id: '61/C/23' })
    }
  })

  it('matches "area 23" (no district) in every district that has one', () => {
    const ids = flatten(searchEntities('area 23', index))
      .filter(e => e.type === 'area')
      .map(e => e.id)
    expect(ids).toContain('61/C/23')
    expect(ids).toContain('57/C/23')
  })

  it('keeps bare "61" district-first and clubs above divisions (no flood regression)', () => {
    const flat = flatten(searchEntities('61', index))
    expect(flat[0]).toMatchObject({ type: 'district', id: '61' })
    const firstClub = flat.findIndex(e => e.type === 'club')
    const firstDivision = flat.findIndex(e => e.type === 'division')
    expect(firstClub).not.toBe(-1)
    // Clubs outrank divisions for ambiguous queries (canonical group order).
    if (firstDivision !== -1) {
      expect(firstClub).toBeLessThan(firstDivision)
    }
  })

  it('orders the Clubs group before the Areas group when a query spans both', () => {
    // "23" substring-matches club id 00001234 and the Area 23 entities.
    const types = searchEntities('23', index).map(g => g.type)
    expect(types).toContain('club')
    expect(types).toContain('area')
    expect(types.indexOf('club')).toBeLessThan(types.indexOf('area'))
  })
})

// --- Union of all rosters: past-only districts (#1403) ---
//
// The index used to be built from the CURRENT roster only, so a district that
// has been consolidated away (D27: 151 snapshots, last 2026-06-30, absent from
// today's 94-district rankings) was unfindable at any year. The union comes
// from `config/district-snapshot-index.json` — districtId → chronological
// snapshot dates — which the app already fetches.

// districtId → chronological snapshot dates. '27' is past-only (its last
// snapshot predates the current program year); the rest are live.
const SNAPSHOT_INDEX: Record<string, string[]> = {
  '61': ['2025-06-30', '2026-06-30', '2026-07-31'],
  '6': ['2026-07-31'],
  '57': ['2026-07-31'],
  F: ['2026-07-31'],
  '27': ['2024-07-15', '2025-06-30', '2026-06-30'],
  '113': ['2019-05-31', '2020-06-30'],
  // Alphabetically ahead of live D57 on a '5' query — the tiebreak trap.
  '50': ['2018-06-30'],
}

describe('buildSearchIndex — union of all rosters (#1403)', () => {
  let index: SearchIndex
  beforeEach(() => {
    index = buildSearchIndex(RANKINGS, CLUBS, DIVISIONS_AREAS, SNAPSHOT_INDEX)
  })

  it('indexes a district that exists only in the snapshot index', () => {
    const d27 = index.entities.find(e => e.type === 'district' && e.id === '27')
    expect(d27).toBeDefined()
    expect(d27!.terms).toContain('27')
  })

  it('lands a past-only district on its MOST RECENT snapshot date and that date’s program year', () => {
    const d27 = index.entities.find(
      e => e.type === 'district' && e.id === '27'
    )!
    // 2026-06-30 is the last element of D27's chronological array, and June
    // 2026 belongs to the 2025-26 program year.
    expect(d27.route).toBe('/district/27?py=2025&date=2026-06-30')
    expect(d27.inactive).toBe(true)
    expect(d27.lastSnapshotDate).toBe('2026-06-30')
  })

  it('marks past-only districts inactive with a last-active context', () => {
    const d113 = index.entities.find(
      e => e.type === 'district' && e.id === '113'
    )!
    expect(d113.inactive).toBe(true)
    expect(d113.route).toBe('/district/113?py=2019&date=2020-06-30')
    expect(d113.context).toBe('Last active 2020-06-30')
  })

  it('leaves live districts byte-identical — plain route, not inactive, no context', () => {
    const d61 = index.entities.find(
      e => e.type === 'district' && e.id === '61'
    )!
    expect(d61.route).toBe('/district/61')
    expect(d61.inactive).toBeFalsy()
    expect(d61.context).toBeUndefined()
    // ...and the district entities from the current roster are still emitted
    // in rankings order, ahead of any past-only ones.
    const districtIds = index.entities
      .filter(e => e.type === 'district')
      .map(e => e.id)
    expect(districtIds.slice(0, RANKINGS.length)).toEqual(
      RANKINGS.map(r => r.districtId)
    )
  })

  it('omitting the snapshot index reproduces the pre-#1403 index exactly', () => {
    const legacy = buildSearchIndex(RANKINGS, CLUBS, DIVISIONS_AREAS)
    expect(
      legacy.entities.filter(e => e.type === 'district').map(e => e.id)
    ).toEqual(RANKINGS.map(r => r.districtId))
  })

  it('contributes nothing for malformed or empty snapshot-index values', () => {
    const malformed = buildSearchIndex(RANKINGS, CLUBS, DIVISIONS_AREAS, {
      '27': [],
      '113': 'junk' as unknown as string[],
      '999': null as unknown as string[],
    })
    const ids = malformed.entities
      .filter(e => e.type === 'district')
      .map(e => e.id)
    expect(ids).toEqual(RANKINGS.map(r => r.districtId))
  })
})

describe('searchEntities — past-only districts (#1403)', () => {
  let index: SearchIndex
  beforeEach(() => {
    index = buildSearchIndex(RANKINGS, CLUBS, DIVISIONS_AREAS, SNAPSHOT_INDEX)
  })

  it('finds District 27 — the load-bearing case: it returns nothing today', () => {
    const flat = flatten(searchEntities('27', index))
    expect(flat.some(e => e.type === 'district' && e.id === '27')).toBe(true)
  })

  it('still yields a clean empty state for a district that never existed', () => {
    // '999' is in neither roster, so no DISTRICT entity is produced for it
    // (the fixture club id 00009999 still substring-matches — that is the
    // pre-existing behaviour, unrelated to the union), and a query matching
    // nothing at all still returns no groups at all.
    const nineNineNine = flatten(searchEntities('999', index))
    expect(nineNineNine.some(e => e.type === 'district')).toBe(false)
    expect(searchEntities('8842', index)).toEqual([])
    // ...which is what makes "exists but not this year" distinguishable from
    // "never existed": D27 answers, D999 does not.
    expect(searchEntities('27', index)).not.toEqual([])
  })

  it('ranks live districts above past-only ones at the same match level', () => {
    // '5' prefix-matches live D57 and past-only D50, both at level 2. The
    // shorter-label / alphabetical tiebreaks would put '50' FIRST, so this
    // fails without the inactive demotion — the current-year common case
    // must not be pushed down by history.
    const flat = flatten(searchEntities('5', index))
    const live = flat.findIndex(e => e.type === 'district' && e.id === '57')
    const past = flat.findIndex(e => e.type === 'district' && e.id === '50')
    expect(live).not.toBe(-1)
    expect(past).not.toBe(-1)
    expect(live).toBeLessThan(past)
  })

  it('does not let a past-only district evict a club from the result cap', () => {
    // Both prefix-match '12': the club by name, the district by id — same
    // match level, so the type weight decides who survives the cap (the cap
    // is applied to the SCORED list, before grouping). Without the inactive
    // demotion TYPE_RANK puts every district above every club, and 68
    // historical districts would start pushing clubs out of the results.
    const mini = buildSearchIndex(
      [ranking('61', 'District 61', '07')],
      { '00001111': { districtId: '61', clubName: '12 Angry Speakers' } },
      {},
      { '120': ['2019-06-30'] }
    )
    const capped = flatten(searchEntities('12', mini, { cap: 1 }))
    expect(capped).toHaveLength(1)
    expect(capped[0]!.type).toBe('club')
    // Uncapped, both are returned — the district in its own (leading) group,
    // which is display order, not rank.
    const all = flatten(searchEntities('12', mini))
    expect(all.map(e => `${e.type}:${e.id}`)).toEqual([
      'district:120',
      'club:00001111',
    ])
  })

  it('keeps an exact id match on top regardless of the demotion', () => {
    const flat = flatten(searchEntities('27', index))
    expect(flat[0]).toMatchObject({ type: 'district', id: '27' })
  })
})
