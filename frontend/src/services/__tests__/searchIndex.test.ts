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

  it('resolves "61 area 23" to the same area', () => {
    const flat = flatten(searchEntities('61 area 23', index))
    expect(flat[0]).toMatchObject({ type: 'area', id: '61/C/23' })
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
